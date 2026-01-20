/**
 * Direct Download Service
 * Handles direct file downloads using aria2 RPC
 * Supports multi-part downloads with progress tracking
 */

import { EventEmitter } from "events";
import { WebSocket } from "ws";
import * as path from "path";
import * as fs from "fs";
import { powerSaveBlocker } from "electron";
import { v4 as uuidv4 } from "uuid";
import { DownloadItem, DownloadStatus, DownloadOptions } from "../types";
import { APP_CONFIG } from "../../../../renderer/config/app-config";
import { settingsService } from "../../settings.service";
import {
  ensureAria2,
  getAria2RpcConfig,
  restartAria2Daemon,
} from "../../utils/aria2-manager";
import {
  sanitizeFilename,
  getDownloadSubPath,
  getCategoryByExtension,
  getFreeDiskSpace,
  deleteFileWithRetry,
  generateUniqueFilename,
} from "../../utils/file-utils";
import { detectLinkType } from "./url-detection.service";

// Generate unique request IDs
let requestIdCounter = 0;
function getRequestId(): string {
  const appId = APP_CONFIG.name.toLowerCase().replace(/\s+/g, "-");
  return `${appId}-${++requestIdCounter}`;
}

/**
 * Aria2 download status mapping
 */
const ARIA2_STATUS_MAP: Record<string, DownloadStatus> = {
  active: DownloadStatus.DOWNLOADING,
  waiting: DownloadStatus.PENDING,
  paused: DownloadStatus.PAUSED,
  error: DownloadStatus.FAILED,
  complete: DownloadStatus.COMPLETED,
  removed: DownloadStatus.CANCELLED,
};

/**
 * Direct Download Service class
 * Manages direct file downloads using aria2
 */
class DirectDownloadService extends EventEmitter {
  private ws: WebSocket | null = null;
  private downloads: Map<string, DownloadItem> = new Map();
  private connected = false;
  private reconnecting = false;
  private pendingRequests = new Map<
    string,
    { resolve: (data: any) => void; reject: (error: any) => void }
  >();
  private consecutiveTimeouts = 0;
  private readonly MAX_CONSECUTIVE_TIMEOUTS = 2; // Faster recovery (2 fails x 5s = 10s)
  private rpcFailureCount = 0;
  private readonly MAX_RPC_FAILURES = 10;
  private gidToDownloadId: Map<string, string> = new Map();
  private removedGids: Set<string> = new Set();
  private progressInterval: any = null;
  private heartbeatInterval: any = null;
  private dummyRpcInterval: any = null;
  private powerSaveBlockerId: number | null = null;
  private connectPromise: Promise<void> | null = null;

  constructor() {
    super();
  }

  /**
   * Initialize connection to aria2 RPC
   */
  async connect(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // Prevent race condition: reuse existing connection promise
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  /**
   * Internal connection implementation
   */
  private async doConnect(): Promise<void> {
    // Ensure aria2 is running
    await ensureAria2();

    const config = getAria2RpcConfig();
    const url = `ws://${config.host}:${config.port}/jsonrpc`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
          console.log("[DirectDownload] Connected to aria2 RPC");
          this.connected = true;
          this.reconnecting = false;
          this.consecutiveTimeouts = 0;

          // 1. WebSocket Heartbeat (Standard Ping/Pong)
          this.heartbeatInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.ws.ping();
            } else {
              this.stopHeartbeat();
            }
          }, 30000);

          // 2. Dummy RPC (Extra insurance against aggressive Firewalls/Routers)
          this.dummyRpcInterval = setInterval(async () => {
            if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
              try {
                // Fetching version is a light call that keeps the socket active
                await this.sendRequest("aria2.getVersion", [], 5000);
              } catch (e) {
                console.warn("[DirectDownload] Heartbeat RPC failed");
              }
            }
          }, 60000);

          // Run sync and restore in background to avoid blocking initial commands
          (async () => {
            try {
              await this.syncWithAria2();
              await this.restoreActiveDownloads();
              await this.updateGlobalSettings();
              this.startProgressPolling();
              this.updatePowerSaveStatus();
            } catch (err) {
              console.warn(
                "[DirectDownload] Background initialization failed:",
                err,
              );
            }
          })();

          resolve();
        });

        this.ws.on("message", (data: Buffer) => {
          this.handleMessage(data.toString());
        });

        this.ws.on("close", () => {
          console.log("[DirectDownload] Disconnected from aria2 RPC");
          this.connected = false;
          this.stopProgressPolling();
          this.stopHeartbeat();

          // Reject all pending requests to prevent memory leak
          for (const [id, { reject: rejectRequest }] of this.pendingRequests) {
            rejectRequest(new Error("WebSocket connection closed"));
          }
          this.pendingRequests.clear();

          this.attemptReconnect();
        });

        this.ws.on("error", (error) => {
          console.error("[DirectDownload] WebSocket error:", error);
          if (!this.connected) {
            // Reject all pending requests on error
            for (const [id, { reject: rejectRequest }] of this
              .pendingRequests) {
              rejectRequest(error);
            }
            this.pendingRequests.clear();
            reject(error);
          }
        });
      } catch (error) {
        // Reject all pending requests on error
        for (const [id, { reject: rejectRequest }] of this.pendingRequests) {
          rejectRequest(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
        this.pendingRequests.clear();
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect to aria2
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;

    // Persistent reconnection - will try more aggressively if we lose connection
    let retryDelay = 2000;
    const maxDelay = 30000;

    while (!this.connected) {
      console.log(
        `[DirectDownload] Connection lost. Attempting background reconnect...`,
      );

      try {
        await this.connect();
        if (this.connected) {
          console.log("[DirectDownload] Reconnected successfully");
          break;
        }
      } catch {
        // Incremental backoff for retries
        await new Promise((r) => setTimeout(r, retryDelay));
        retryDelay = Math.min(retryDelay * 1.5, maxDelay);
      }
    }

    this.reconnecting = false;
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      // console.log("[DirectDownload] RPC Message:", JSON.stringify(message)); // uncomment for extreme debugging

      // Handle response to our requests
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject } = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if (message.error) {
          reject(new Error(message.error.message || "aria2 RPC error"));
        } else {
          resolve(message.result);
        }
        return;
      }

      // Handle aria2 notifications
      if (message.method) {
        this.handleNotification(message.method, message.params);
      }
    } catch (error) {
      console.error("[DirectDownload] Failed to parse message:", error);
    }
  }

  /**
   * Handle aria2 notifications
   */
  private handleNotification(method: string, params: unknown[]): void {
    console.log(
      `[DirectDownload] Notification received: ${method}`,
      JSON.stringify(params),
    ); // debug logging

    const gid = params?.[0]?.["gid"] || params?.[0];
    if (!gid || typeof gid !== "string") return;

    const downloadId = this.gidToDownloadId.get(gid);
    if (!downloadId) return;

    const download = this.downloads.get(downloadId);
    if (!download) return;

    switch (method) {
      case "aria2.onDownloadStart":
        this.updateDownloadStatus(downloadId, DownloadStatus.DOWNLOADING);
        break;
      case "aria2.onDownloadPause":
        this.updateDownloadStatus(downloadId, DownloadStatus.PAUSED);
        break;
      case "aria2.onDownloadStop":
        this.updateDownloadStatus(downloadId, DownloadStatus.CANCELLED);
        break;
      case "aria2.onDownloadComplete":
        this.handleDownloadComplete(downloadId);
        break;
      case "aria2.onDownloadError":
        // Fetch detailed error from aria2
        this.sendRequest("aria2.tellStatus", [gid, ["errorMessage"]])
          .then((status: any) => {
            const error =
              status?.errorMessage || "Download failed (Unknown reason)";
            console.error(
              `[DirectDownload] ERROR reported by aria2 for GID ${gid}:`,
              error,
            );
            this.handleDownloadError(downloadId, error);
          })
          .catch(() => {
            this.handleDownloadError(downloadId, "Download failed");
          });
        break;
    }
  }

  /**
   * Send RPC request to aria2
   */
  private async sendRequest(
    method: string,
    params: unknown[] = [],
    timeoutMs = 5000, // Reduced from 20s for faster hang detection
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const config = getAria2RpcConfig();
    const id = getRequestId();

    // Add secret token as first parameter
    const fullParams = [`token:${config.secret}`, ...params];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.consecutiveTimeouts++;

        // If too many timeouts, force a reconnect
        if (this.consecutiveTimeouts >= this.MAX_CONSECUTIVE_TIMEOUTS) {
          console.warn(
            "[DirectDownload] Multiple RPC timeouts, forcing reconnect...",
          );
          this.consecutiveTimeouts = 0;
          this.forceReconnect();
        }

        reject(new Error("Request timeout"));
      }, timeoutMs); // Custom or default timeout

      this.pendingRequests.set(id, {
        resolve: (data) => {
          clearTimeout(timeout);
          this.consecutiveTimeouts = 0; // Reset on success
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params: fullParams,
      };

      console.log(
        `[DirectDownload] Sending RPC request: ${method}`,
        JSON.stringify(params),
      );
      this.ws!.send(JSON.stringify(request));
    });
  }

  /**
   * Force a full engine and connection recovery
   */
  private async forceReconnect(): Promise<void> {
    this.rpcFailureCount++;
    console.warn(
      `[DirectDownload] Recovery triggered (Attempt ${this.rpcFailureCount})`,
    );

    // 1. Close current connection and cleanup listeners/intervals
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
      } catch (e) {
        /* ignore */
      }
    }
    this.connected = false;
    this.stopProgressPolling();
    this.stopHeartbeat();

    // 2. HARD RESET: Kill the stalled process and restart the daemon
    // This addresses "Deadlocked" engines that don't respond even to new sockets
    console.warn("[DirectDownload] Hard-killing stalled aria2 process...");

    try {
      await restartAria2Daemon();

      // Short wait for OS to fully release file handles/ports
      await new Promise((r) => setTimeout(r, 2000));

      // 3. Establish fresh connection
      await this.connect();

      if (this.connected) {
        console.log("[DirectDownload] Engine recovered and reconnected.");
      }
    } catch (err) {
      console.error("[DirectDownload] Critical: Engine recovery failed", err);
      // Fallback to retry loop if immediate recovery fails
      setTimeout(() => this.attemptReconnect(), 5000);
    }
  }

  /**
   * Start progress polling
   */
  private startProgressPolling(): void {
    if (this.progressInterval) return;

    const poll = async () => {
      const hasActiveTasks = Array.from(this.downloads.values()).some(
        (d) =>
          d.status === DownloadStatus.DOWNLOADING ||
          d.status === DownloadStatus.PENDING,
      );

      if (!this.connected || !hasActiveTasks) {
        console.log("[DirectDownload] Polling IDLE - Stopping interval.");
        this.stopProgressPolling();
        return;
      }

      try {
        const [activeStats, waitingStats] = (await Promise.all([
          this.sendRequest("aria2.tellActive", [
            [
              "gid",
              "status",
              "totalLength",
              "completedLength",
              "downloadSpeed",
              "files",
              "errorCode",
              "errorMessage",
            ],
          ]),
          this.sendRequest("aria2.tellWaiting", [
            0,
            100,
            [
              "gid",
              "status",
              "totalLength",
              "completedLength",
              "downloadSpeed",
              "files",
              "errorCode",
              "errorMessage",
            ],
          ]),
        ])) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];

        const allStats = [...(activeStats || []), ...(waitingStats || [])];

        if (allStats.length > 0) {
          allStats.forEach((status) => {
            const gid = status.gid as string;
            if (gid) {
              const downloadId = this.gidToDownloadId.get(gid);
              if (downloadId) {
                // Log if status is error
                if (status.status === "error") {
                  console.error(
                    `[DirectDownload] Polled task ${gid} has ERROR status. Code: ${status.errorCode}, Message: ${status.errorMessage}`,
                  );
                  this.handleDownloadError(
                    downloadId,
                    (status.errorMessage as string) || "Download failed",
                  );
                } else {
                  this.updateProgressFromStatus(downloadId, status);
                }
              }
            }
          });
        }
      } catch (error) {
        // Only log if not a timeout (which is handled in sendRequest)
        if (error instanceof Error && error.message !== "Request timeout") {
          console.warn("[DirectDownload] Polling error:", error.message);
        }
      } finally {
        // Schedule next poll only after current one is done
        // Increased to 2000ms to reduce RPC pressure (UI still feels smooth)
        this.progressInterval = setTimeout(poll, 2000) as any;
      }
    };

    this.progressInterval = setTimeout(poll, 2000) as any;
  }

  /**
   * Stop progress polling
   */
  private stopProgressPolling(): void {
    if (this.progressInterval) {
      clearTimeout(this.progressInterval as any);
      this.progressInterval = null;
    }
  }

  /**
   * Stop heartbeats
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.dummyRpcInterval) {
      clearInterval(this.dummyRpcInterval);
      this.dummyRpcInterval = null;
    }
  }

  /**
   * Update Electron PowerSaveBlocker status
   */
  private updatePowerSaveStatus(): void {
    const hasActiveDownloads = Array.from(this.downloads.values()).some(
      (d) =>
        d.status === DownloadStatus.DOWNLOADING ||
        d.status === DownloadStatus.PENDING,
    );

    if (hasActiveDownloads && this.powerSaveBlockerId === null) {
      this.powerSaveBlockerId = powerSaveBlocker.start(
        "prevent-app-suspension",
      );
      console.log(
        "[DirectDownload] Power save blocker STARTED (Active downloads detected)",
      );
    } else if (!hasActiveDownloads && this.powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(this.powerSaveBlockerId);
      this.powerSaveBlockerId = null;
      console.log(
        "[DirectDownload] Power save blocker STOPPED (No active downloads)",
      );
    }
  }

  /**
   * Get GID by download ID
   */
  private getGidByDownloadId(downloadId: string): string | undefined {
    for (const [gid, id] of this.gidToDownloadId) {
      if (id === downloadId) return gid;
    }
    return undefined;
  }

  /**
   * Update progress from aria2 status
   */
  private updateProgressFromStatus(
    downloadId: string,
    status: Record<string, unknown>,
  ): void {
    const download = this.downloads.get(downloadId);
    if (!download) return;

    const totalLength = parseInt(status.totalLength as string, 10) || 0;
    const completedLength = parseInt(status.completedLength as string, 10) || 0;
    const downloadSpeed = parseInt(status.downloadSpeed as string, 10) || 0;
    const aria2Status = status.status as string;

    // Calculate progress
    const progress =
      totalLength > 0 ? (completedLength / totalLength) * 100 : 0;

    // Calculate ETA
    const eta =
      downloadSpeed > 0
        ? Math.round((totalLength - completedLength) / downloadSpeed)
        : null;

    // Update filename from files if available
    let filename = download.filename;
    const files = status.files as Array<{ path: string }>;
    if (files && files.length > 0 && files[0].path) {
      filename = path.basename(files[0].path);
    }

    // Verify status and log errors
    if (aria2Status === "error") {
      console.error(
        `[DirectDownload] Task ${downloadId} (GID: ${status.gid}) changed to ERROR status. ErrorCode: ${status.errorCode}, ErrorMessage: ${status.errorMessage}`,
      );
    }

    // Update download item
    download.status = ARIA2_STATUS_MAP[aria2Status] || download.status;
    download.filename = filename;
    download.progress = {
      downloadId,
      status: download.status,
      progress: Math.min(progress, 100),
      downloadedBytes: completedLength,
      totalBytes: totalLength || null,
      speed: downloadSpeed,
      speedString: this.formatSpeed(downloadSpeed),
      eta,
      etaString: eta !== null ? this.formatEta(eta) : null,
      filename,
    };

    this.downloads.set(downloadId, download);

    // Emit progress event
    this.emit("progress", download.progress);

    // Update power save status if status changed to completed/failed
    if (
      aria2Status === "complete" ||
      aria2Status === "error" ||
      aria2Status === "removed"
    ) {
      this.updatePowerSaveStatus();
    }
  }

  /**
   * Update download status
   */
  private updateDownloadStatus(
    downloadId: string,
    status: DownloadStatus,
  ): void {
    const download = this.downloads.get(downloadId);
    if (!download) return;

    download.status = status;
    download.progress.status = status;

    if (status === DownloadStatus.PAUSED) {
      download.progress.speed = 0;
      download.progress.speedString = null;
      download.progress.eta = null;
      download.progress.etaString = null;
    }

    this.downloads.set(downloadId, download);
    this.emit("status-changed", download);
    this.updatePowerSaveStatus();

    if (
      status === DownloadStatus.DOWNLOADING ||
      status === DownloadStatus.PENDING
    ) {
      this.startProgressPolling();
    }
  }

  /**
   * Handle download complete
   */
  private handleDownloadComplete(downloadId: string): void {
    const download = this.downloads.get(downloadId);
    if (!download) return;

    download.status = DownloadStatus.COMPLETED;
    download.completedAt = new Date();
    download.progress.status = DownloadStatus.COMPLETED;
    download.progress.progress = 100;

    this.downloads.set(downloadId, download);

    this.emit("complete", download);
    this.emit("status-changed", download);
  }

  /**
   * Handle download error
   */
  private async handleDownloadError(
    downloadId: string,
    errorMessage: string,
  ): Promise<void> {
    console.error(
      `[DirectDownload] handleDownloadError triggered for ${downloadId}:`,
      errorMessage,
    );
    const download = this.downloads.get(downloadId);
    if (!download) return;

    download.status = DownloadStatus.FAILED;
    download.error = errorMessage;
    download.progress.status = DownloadStatus.FAILED;

    this.downloads.set(downloadId, download);

    // Delete incomplete files on error
    const gid = this.getGidByDownloadId(downloadId);
    if (gid) {
      try {
        // 1. Get file paths before removing anything
        let filePaths: string[] = [];
        try {
          const status = (await this.sendRequest("aria2.tellStatus", [
            gid,
            ["files"],
          ])) as { files?: Array<{ path: string }> };

          if (status.files && status.files.length > 0) {
            filePaths = status.files
              .map((f) => f.path)
              .filter((p) => p && p.length > 0);
          }
        } catch (error) {
          console.warn(
            "[DirectDownload] Could not cache paths on error:",
            error,
          );
        }

        // Fallback: Use stored filename if aria2 fails
        if (
          filePaths.length === 0 &&
          download.outputPath &&
          download.filename
        ) {
          filePaths.push(path.join(download.outputPath, download.filename));
        }

        // 2. Remove immediately from aria2
        try {
          await this.sendRequest("aria2.forceRemove", [gid]);
          await this.sendRequest("aria2.removeDownloadResult", [gid]);
        } catch (e) {
          /* ignore */
        }

        // 3. Cooldown for OS locks
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 4. Actual file deletion
        if (filePaths.length > 0) {
          for (const filePath of filePaths) {
            if (filePath) {
              const fileDeleted = await deleteFileWithRetry(filePath, 10, 1000);
              const aria2File = `${filePath}.aria2`;
              const controlDeleted = await deleteFileWithRetry(
                aria2File,
                5,
                500,
              );
              const logName = path.basename(filePath);
              console.log(
                `[DirectDownload] Error Cleanup: ${logName} -> ${
                  fileDeleted ? "Cleaned" : "Failed"
                } (Control: ${controlDeleted ? "OK" : "Error"})`,
              );
            }
          }
        }
      } catch (err) {
        console.warn("[DirectDownload] Error during file cleanup:", err);
      }
    }

    this.emit("error", download, errorMessage);
    this.emit("status-changed", download);
  }

  /**
   * Format speed to human-readable string
   */
  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return (bytesPerSecond / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  }

  /**
   * Format ETA to human-readable string
   */
  private formatEta(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  /**
   * Start a new direct download
   */
  async startDownload(options: DownloadOptions): Promise<{
    success: boolean;
    data?: DownloadItem;
    error?: string;
  }> {
    try {
      // Validate URL
      if (!options.url || typeof options.url !== "string") {
        return {
          success: false,
          error: "Invalid URL provided",
        };
      }

      // Basic URL validation
      try {
        const urlObj = new URL(options.url);
        if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
          return {
            success: false,
            error: "Only HTTP and HTTPS protocols are supported",
          };
        }
      } catch {
        return {
          success: false,
          error: "Invalid URL format",
        };
      }

      // Ensure connected to aria2
      await this.connect();

      // 0. Detect link type first to resolve filename (prevents race condition)
      let linkInfo: any = {};
      try {
        // Race detection with 5s timeout to avoid blocking too long
        linkInfo = await Promise.race([
          detectLinkType(options.url, "direct"),
          new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000),
          ),
        ]);
      } catch (err) {
        console.warn(
          "[DirectDownload] Link detection failed, proceeding with defaults:",
          err instanceof Error ? err.message : String(err),
        );
        // Fallback to a timestamp-based filename if no other name is available
        linkInfo = { filename: `download_${Date.now()}` };
      }

      const initialFilename = options.filename || linkInfo.filename;
      const settings = settingsService.getSettings();

      // Determine output directory
      let outputDir = options.outputPath;
      if (!outputDir) {
        // Use global download path from settings
        const category = getCategoryByExtension(initialFilename || options.url);
        outputDir = getDownloadSubPath(category as any);
      }

      // 0.5 Handle file existence based on settings
      let finalFilename = initialFilename;
      if (finalFilename) {
        const fullPath = path.join(outputDir, finalFilename);
        if (fs.existsSync(fullPath)) {
          if (settings.onFileExists === "skip") {
            console.log(`[DirectDownload] File exists, skipping: ${fullPath}`);
            return {
              success: true,
              error: "File already exists (skipped)",
            };
          } else if (settings.onFileExists === "overwrite") {
            console.log(
              `[DirectDownload] File exists, overwriting: ${fullPath}`,
            );
            try {
              if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
              if (fs.existsSync(`${fullPath}.aria2`))
                fs.unlinkSync(`${fullPath}.aria2`);
            } catch (err) {
              console.warn(
                `[DirectDownload] Failed to delete existing file for overwrite:`,
                err,
              );
            }
          } else if (settings.onFileExists === "rename") {
            finalFilename = generateUniqueFilename(outputDir, finalFilename);
            console.log(
              `[DirectDownload] File exists, renamed to: ${finalFilename}`,
            );
          }
        }
      }

      // 1. Aggressive duplication check (URL + Filename)
      const targetFilename = options.filename;
      for (const [id, d] of this.downloads.entries()) {
        const isSameUrl = d.url === options.url;
        const isSameFile =
          targetFilename &&
          d.filename === targetFilename &&
          d.outputPath === outputDir;

        if (isSameUrl || isSameFile) {
          if (
            d.status === DownloadStatus.DOWNLOADING ||
            d.status === DownloadStatus.PENDING
          ) {
            console.log(
              `[DirectDownload] Found existing active task (${d.status}) for:`,
              targetFilename || options.url,
            );

            // Auto-fix: Update User-Agent if a better one was detected
            if (linkInfo.suggestedUserAgent) {
              const gid = this.getGidByDownloadId(id);
              if (gid) {
                const newHeader = [
                  `User-Agent: ${linkInfo.suggestedUserAgent}`,
                  `Referer: ${options.url}`,
                ];
                this.sendRequest("aria2.changeOption", [
                  gid,
                  { header: newHeader },
                ])
                  .then(() =>
                    console.log(
                      `[DirectDownload] Updated options for task ${id} with suggested UA`,
                    ),
                  )
                  .catch((err) =>
                    console.warn(
                      `[DirectDownload] Failed to update options for ${id}:`,
                      err,
                    ),
                  );
              }
            }

            return { success: true, data: d };
          }

          // If it's a failed or cancelled task for the same file,
          // we remove it to start a fresh attempt
          if (
            d.status === DownloadStatus.FAILED ||
            d.status === DownloadStatus.CANCELLED
          ) {
            console.log(
              "[DirectDownload] Removing old task to avoid duplicates:",
              d.filename || d.id,
            );
            await this.cancelDownload(id);
          }
        }
      }

      const downloadId = uuidv4();

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Check disk space only on Linux/macOS (Windows statfsSync is very slow)
      if (process.platform !== "win32") {
        const freeSpace = await getFreeDiskSpace(outputDir);
        const minRequiredSpace = 100 * 1024 * 1024; // 100MB
        if (freeSpace !== null && freeSpace < minRequiredSpace) {
          const freeSpaceMB = Math.round(freeSpace / (1024 * 1024));
          return {
            success: false,
            error: `Insufficient disk space. Available: ${freeSpaceMB}MB, Required: ${Math.round(
              minRequiredSpace / (1024 * 1024),
            )}MB`,
          };
        }
      } else {
        // On Windows, check disk space in background to avoid blocking
        getFreeDiskSpace(outputDir)
          .then((freeSpace) => {
            if (freeSpace !== null && freeSpace < 100 * 1024 * 1024) {
              console.warn(
                `[DirectDownload] Low disk space warning: ${Math.round(
                  freeSpace / (1024 * 1024),
                )}MB available`,
              );
            }
          })
          .catch(() => {
            // Ignore errors in background check
          });
      }

      // Build aria2 options - Optimized for large files and reliability
      // Use suggested UA from detection if available (fixes 403 on some hosts)
      const userAgent =
        linkInfo.suggestedUserAgent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36";

      const aria2Options: Record<string, string | string[]> = {
        dir: outputDir,
        "max-connection-per-server": "4",
        split: "8",
        "min-split-size": "4M",
        continue: "true",
        "auto-file-renaming": "true",
        "file-allocation": process.platform === "win32" ? "falloc" : "none",
        "connect-timeout": "60",
        timeout: "60",
        "max-tries": "0",
        "retry-wait": "5",
        "disk-cache": "64M", // Reduces disk I/O pressure and engine hangs
        "stream-piece-selector": "geom", // Smarter piece selection, less fragmentation
        "disable-ipv6": "true", // Force IPv4 to avoid unreachable network errors
        header: [`User-Agent: ${userAgent}`, `Referer: ${options.url}`],
        "check-certificate": "false",
      };

      if (finalFilename) {
        aria2Options.out = sanitizeFilename(finalFilename);
      }
      // Ensure URL is properly encoded for aria2
      let finalUrl = options.url;
      try {
        const urlObj = new URL(options.url);
        finalUrl = urlObj.toString();
      } catch (e) {
        finalUrl = options.url.replace(/\[/g, "%5B").replace(/\]/g, "%5D");
      }

      console.log(`[DirectDownload] Raw URL: ${options.url}`);
      console.log(`[DirectDownload] Final encoded URL: ${finalUrl}`);

      const downloadItem: DownloadItem = {
        id: downloadId,
        url: options.url,
        videoInfo: null,
        options,
        status: DownloadStatus.PENDING,
        progress: {
          downloadId,
          status: DownloadStatus.PENDING,
          progress: 0,
          downloadedBytes: 0,
          totalBytes: linkInfo.contentLength || null,
          speed: null,
          speedString: null,
          eta: null,
          etaString: null,
          filename: finalFilename || null,
        },
        outputPath: outputDir,
        filename: finalFilename || null,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
        error: null,
        retryCount: 0,
      };

      // 2. Add to memory maps BEFORE the RPC call
      // This ensures cancelDownload can find the item if called while addUri is pending
      this.downloads.set(downloadId, downloadItem);
      this.emit("status-changed", downloadItem);

      // 3. Start the download in aria2
      let gid: string;
      try {
        gid = (await this.sendRequest(
          "aria2.addUri",
          [[finalUrl], aria2Options],
          60000,
        )) as string;
      } catch (error) {
        // Cleanup on failure
        this.downloads.delete(downloadId);
        throw error;
      }

      // 4. Check if the job was cancelled while we were waiting for addUri
      if (!this.downloads.has(downloadId)) {
        console.warn(
          `[DirectDownload] Job ${downloadId} was cancelled during initialization. Purging new GID: ${gid}`,
        );
        this.removedGids.add(gid);
        this.sendRequest("aria2.forceRemove", [gid]).catch(() => {});
        this.sendRequest("aria2.removeDownloadResult", [gid]).catch(() => {});
        return {
          success: false,
          error: "Download cancelled during initialization",
        };
      }

      // 5. Success: Link GID to download ID
      const existingIdForGid = this.gidToDownloadId.get(gid);
      if (existingIdForGid) {
        const existingItem = this.downloads.get(existingIdForGid);
        if (existingItem) {
          console.log(
            `[DirectDownload] Aria2 matched new request to existing GID: ${gid}`,
          );
          // Cleanup our temporary item and return the existing one
          this.downloads.delete(downloadId);
          return { success: true, data: existingItem };
        }
      }

      this.gidToDownloadId.set(gid, downloadId);
      this.updatePowerSaveStatus();
      this.startProgressPolling();

      return { success: true, data: downloadItem };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[DirectDownload] Failed to start download:", error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Pause a download
   */
  async pauseDownload(downloadId: string): Promise<boolean> {
    try {
      const gid = this.getGidByDownloadId(downloadId);
      if (!gid) return false;

      this.updateDownloadStatus(downloadId, DownloadStatus.PAUSED);

      this.sendRequest("aria2.pause", [gid]).catch((err) => {
        console.error("[DirectDownload] Background pause failed:", err);
      });

      return true;
    } catch (error) {
      console.error("[DirectDownload] Failed to initiate pause:", error);
      return false;
    }
  }

  /**
   * Resume a download
   */
  async resumeDownload(downloadId: string): Promise<boolean> {
    try {
      const download = this.downloads.get(downloadId);
      if (!download) return false;

      if (download.status === DownloadStatus.DOWNLOADING) {
        return true;
      }

      if (
        download.status !== DownloadStatus.PAUSED &&
        download.status !== DownloadStatus.PENDING
      ) {
        console.warn(
          `[DirectDownload] Cannot resume download in status ${download.status}`,
        );
        return false;
      }

      const gid = this.getGidByDownloadId(downloadId);
      if (!gid) return false;

      this.updateDownloadStatus(downloadId, DownloadStatus.DOWNLOADING);

      this.sendRequest("aria2.unpause", [gid]).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("cannot be unpaused")) {
          console.error("[DirectDownload] Background resume failed:", err);
        }
      });

      return true;
    } catch (error) {
      console.error("[DirectDownload] Failed to initiate resume:", error);
      return false;
    }
  }

  /**
   * Cancel a download
   */
  async cancelDownload(downloadId: string): Promise<boolean> {
    try {
      const download = this.downloads.get(downloadId);
      if (!download) return false;

      const gid = this.getGidByDownloadId(downloadId);

      // Track GID as removed to prevent ghost recovery during sync
      if (gid) {
        this.removedGids.add(gid);
      }

      // 1. Captured file paths for deletion
      let filePaths: string[] = [];
      if (download.outputPath && download.filename) {
        filePaths.push(path.join(download.outputPath, download.filename));
      }

      // 2. IMPORTANT: Remove from memory immediately so UI reflects the deletion
      this.downloads.delete(downloadId);
      if (gid) this.gidToDownloadId.delete(gid);
      this.emit("item-removed", downloadId);
      this.updatePowerSaveStatus();

      // 3. Perform cleanup in background
      if (gid) {
        (async () => {
          try {
            // Get accurate paths before removal
            const status = (await this.sendRequest(
              "aria2.tellStatus",
              [gid, ["files"]],
              5000,
            ).catch(() => null)) as any;

            if (status?.files) {
              const bgPaths = status.files
                .map((f: any) => f.path)
                .filter((p: any) => p && p.length > 0);
              for (const p of bgPaths) {
                if (!filePaths.includes(p)) filePaths.push(p);
              }
            }

            // Remove from aria2 with retry
            let removedSuccessfully = false;
            for (let i = 0; i < 3; i++) {
              try {
                await this.sendRequest("aria2.forceRemove", [gid]);
                removedSuccessfully = true;
                break;
              } catch (e) {
                // If it's already removed, consider it a success
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.includes("not found") || msg.includes("is not found")) {
                  removedSuccessfully = true;
                  break;
                }
                await new Promise((r) => setTimeout(r, 1000));
              }
            }

            // Always try to remove result to purge it from Stopped list
            for (let i = 0; i < 3; i++) {
              try {
                await this.sendRequest("aria2.removeDownloadResult", [gid]);
                break;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.includes("not found") || msg.includes("is not found")) {
                  break;
                }
                await new Promise((r) => setTimeout(r, 1000));
              }
            }

            // Give OS time to release file handles
            await new Promise((r) => setTimeout(r, 1500));

            for (const filePath of filePaths) {
              await deleteFileWithRetry(filePath, 10, 1000);
              await deleteFileWithRetry(`${filePath}.aria2`, 5, 500);
            }

            // After some extra time, we can stop tracking this GID as removed
            // (long enough for any parallel sync calls to have finished)
            setTimeout(() => {
              this.removedGids.delete(gid);
            }, 30000);
          } catch (err) {
            console.error("[DirectDownload] Background cleanup failed:", err);
            // Don't keep it in the set forever even if cleanup fails
            setTimeout(() => {
              if (gid) this.removedGids.delete(gid);
            }, 60000);
          }
        })();
      } else if (filePaths.length > 0) {
        (async () => {
          await new Promise((r) => setTimeout(r, 1000));
          for (const filePath of filePaths) {
            await deleteFileWithRetry(filePath, 10, 1000);
            await deleteFileWithRetry(`${filePath}.aria2`, 5, 500);
          }
        })();
      }

      return true;
    } catch (error) {
      console.error("[DirectDownload] Failed to cancel download:", error);
      return false;
    }
  }

  /**
   * Get download status
   */
  getDownloadStatus(downloadId: string): DownloadItem | null {
    return this.downloads.get(downloadId) || null;
  }

  /**
   * Get all downloads
   */
  getAllDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values());
  }

  /**
   * Clear completed downloads from memory and aria2
   */
  async clearCompleted(): Promise<number> {
    let count = 0;
    const itemsToRemove: string[] = [];

    for (const [id, download] of this.downloads) {
      if (
        download.status === DownloadStatus.COMPLETED ||
        download.status === DownloadStatus.CANCELLED ||
        download.status === DownloadStatus.FAILED
      ) {
        itemsToRemove.push(id);
        count++;
      }
    }

    for (const id of itemsToRemove) {
      const gid = this.getGidByDownloadId(id);
      if (gid) {
        try {
          await this.sendRequest("aria2.removeDownloadResult", [gid]);
        } catch (e) {
          /* ignore */
        }
        this.gidToDownloadId.delete(gid);
      }
      this.downloads.delete(id);
    }

    return count;
  }

  /**
   * Restore active downloads from memory if they are missing in Aria2
   * (e.g. after a daemon restart)
   */
  private async restoreActiveDownloads(): Promise<void> {
    console.log("[DirectDownload] Checking for lost downloads to restore...");

    for (const [id, download] of this.downloads.entries()) {
      if (
        download.status !== DownloadStatus.DOWNLOADING &&
        download.status !== DownloadStatus.PENDING
      ) {
        continue;
      }

      const gid = this.getGidByDownloadId(id);
      let needsRestore = !gid;
      if (gid) {
        try {
          await this.sendRequest("aria2.tellStatus", [gid]);
        } catch (e) {
          needsRestore = true;
          this.gidToDownloadId.delete(gid);
        }
      }

      if (needsRestore) {
        console.warn(
          `[DirectDownload] Restoring lost download: ${
            download.filename || download.url
          }`,
        );

        try {
          const options = download.options || {
            url: download.url,
            outputPath: download.outputPath,
            quality: "file",
          };

          const aria2Options: Record<string, string | string[]> = {
            dir: download.outputPath || getDownloadSubPath("others"),
            "max-connection-per-server": "4",
            split: "8",
            "min-split-size": "4M",
            continue: "true",
            "auto-file-renaming": "true",
            header: [
              "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36",
              `Referer: ${download.url}`,
            ],
            "check-certificate": "false",
          };

          if (download.filename) {
            aria2Options.out = sanitizeFilename(download.filename);
          }

          const newGid = (await this.sendRequest("aria2.addUri", [
            [download.url],
            aria2Options,
          ])) as string;

          this.gidToDownloadId.set(newGid, id);
          this.updateDownloadStatus(id, DownloadStatus.DOWNLOADING);
        } catch (err) {
          console.error(
            `[DirectDownload] Failed to restore download ${id}:`,
            err,
          );
          this.handleDownloadError(
            id,
            "Restoration failed after daemon restart",
          );
        }
      }
    }
  }

  /**
   * Sync in-memory state with actual aria2 tasks
   * Useful on startup to recover tasks from aria2 session
   */
  private async syncWithAria2(): Promise<void> {
    try {
      console.log("[DirectDownload] Syncing with aria2...");

      const [active, waiting, stopped] = (await Promise.all([
        this.sendRequest("aria2.tellActive", [
          [
            "gid",
            "status",
            "totalLength",
            "completedLength",
            "downloadSpeed",
            "files",
            "dir",
          ],
        ]),
        this.sendRequest("aria2.tellWaiting", [
          0,
          1000,
          ["gid", "status", "totalLength", "completedLength", "files", "dir"],
        ]),
        this.sendRequest("aria2.tellStopped", [
          0,
          1000,
          ["gid", "status", "totalLength", "completedLength", "files", "dir"],
        ]),
      ])) as [any[], any[], any[]];

      const allTasks = [
        ...(Array.isArray(active) ? active : []),
        ...(Array.isArray(waiting) ? waiting : []),
        ...(Array.isArray(stopped) ? stopped : []),
      ];

      for (const task of allTasks) {
        if (!task.gid) continue;
        if (this.gidToDownloadId.has(task.gid)) continue;
        if (this.removedGids.has(task.gid)) continue;

        let isDuplicate = false;
        let urlFromTask = "Unknown URL";
        if (
          task.files &&
          task.files[0] &&
          task.files[0].uris &&
          task.files[0].uris[0]
        ) {
          urlFromTask = task.files[0].uris[0].uri;
        }

        for (const existingDownload of this.downloads.values()) {
          if (existingDownload.url === urlFromTask) {
            isDuplicate = true;
            this.gidToDownloadId.set(task.gid, existingDownload.id);
            break;
          }
        }

        if (isDuplicate) continue;

        try {
          const gid = task.gid;
          const downloadId = uuidv4();
          const aria2Status = task.status as string;

          let url = "Unknown URL";
          let filename = "Unknown File";
          let outputPath = task.dir || "";

          if (task.files && task.files[0]) {
            const file = task.files[0];
            if (file.uris && file.uris[0]) {
              url = file.uris[0].uri;
            }
            if (file.path && file.path.length > 0) {
              filename = path.basename(file.path);
              outputPath = path.dirname(file.path);
            }
          }

          const totalLength = parseInt(task.totalLength, 10) || 0;
          const completedLength = parseInt(task.completedLength, 10) || 0;
          const progress =
            totalLength > 0 ? (completedLength / totalLength) * 100 : 0;

          const downloadItem: DownloadItem = {
            id: downloadId,
            url,
            videoInfo: null,
            options: {
              url,
              outputPath,
              quality: "file",
            },
            status: ARIA2_STATUS_MAP[aria2Status] || DownloadStatus.PENDING,
            progress: {
              downloadId,
              status: ARIA2_STATUS_MAP[aria2Status] || DownloadStatus.PENDING,
              progress: Math.min(progress, 100),
              downloadedBytes: completedLength,
              totalBytes: totalLength || null,
              speed: 0,
              speedString: "0 B/s",
              eta: null,
              etaString: null,
              filename,
            },
            outputPath,
            filename,
            createdAt: new Date(),
            startedAt: completedLength > 0 ? new Date() : null,
            completedAt: aria2Status === "complete" ? new Date() : null,
            error: null,
            retryCount: 0,
          };

          this.downloads.set(downloadId, downloadItem);
          this.gidToDownloadId.set(gid, downloadId);
        } catch (err) {
          console.warn(
            `[DirectDownload] Failed to parse synced task ${task.gid}:`,
            err,
          );
        }
      }
    } catch (error) {
      console.warn("[DirectDownload] Sync failed:", error);
    }
  }

  /**
   * Update global aria2 settings from app settings
   */
  async updateGlobalSettings(): Promise<void> {
    const settings = settingsService.getSettings();
    try {
      await this.sendRequest("aria2.changeGlobalOption", [
        {
          "max-concurrent-downloads":
            settings.maxConcurrentDownloads.toString(),
        },
      ]);
      console.log(
        `[DirectDownload] Global settings updated: max-concurrent=${settings.maxConcurrentDownloads}`,
      );
    } catch (err) {
      console.warn("[DirectDownload] Failed to update global options:", err);
    }
  }

  /**
   * Disconnect from aria2
   */
  disconnect(): void {
    this.stopProgressPolling();
    this.stopHeartbeat();
    if (this.powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(this.powerSaveBlockerId);
      this.powerSaveBlockerId = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

// Export singleton instance
export const directDownloader = new DirectDownloadService();
