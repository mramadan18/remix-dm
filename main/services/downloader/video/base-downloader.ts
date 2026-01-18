import { EventEmitter } from "events";
import { exec, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  deleteFileWithRetry,
  renameFileForDeletion,
  parseBytes,
} from "../../utils/file-utils";
import { DownloadItem, DownloadStatus } from "../types";

/**
 * Base class for downloaders providing common functionality
 */
export abstract class BaseDownloader extends EventEmitter {
  /**
   * Helper to kill process and its children robustly
   */
  public killProcess(process: ChildProcess, downloadId: string): void {
    if (!process) return;

    const pid = process.pid;
    if (!pid) {
      try {
        process.kill("SIGTERM");
      } catch (e) {}
      return;
    }

    if (global.process.platform === "win32") {
      // Forcefully kill the process tree on Windows
      exec(`taskkill /F /T /PID ${pid}`, (err) => {
        if (err) {
          console.warn(
            `[BaseDownloader] taskkill failed for PID ${pid}, falling back to process.kill:`,
            err,
          );
          try {
            process.kill("SIGTERM");
          } catch (e) {}
        }
      });
    } else {
      // Unix: send SIGTERM to the process group if possible, or just kill the process
      try {
        process.kill("SIGTERM");
      } catch (e) {
        console.warn(`[BaseDownloader] Failed to kill process ${pid}:`, e);
      }
    }
  }

  /**
   * Cleanup any files (partial or complete) associated with a download
   */
  public async cleanupFiles(item: DownloadItem): Promise<void> {
    if (!item.outputPath) return;
    // ... rest of method remains same but public

    const isWindows = process.platform === "win32";
    const maxRetries = isWindows ? 15 : 10;
    const retryDelay = isWindows ? 2000 : 3000;

    try {
      if (item.filename && !item.filename.includes("%")) {
        const fullPath = path.join(item.outputPath, item.filename);
        const variations = [
          fullPath,
          `${fullPath}.part`,
          `${fullPath}.ytdl`,
          `${fullPath}.temp`,
          `${fullPath}.temp.mp4`,
          `${fullPath}.temp.mkv`,
          `${fullPath}.temp.webm`,
        ];

        for (const file of variations) {
          if (fs.existsSync(file)) {
            if (isWindows) {
              const renamedPath = renameFileForDeletion(file);
              if (renamedPath) {
                await deleteFileWithRetry(renamedPath, 5, 1000);
              } else {
                await deleteFileWithRetry(file, maxRetries, retryDelay);
              }
            } else {
              await deleteFileWithRetry(file, maxRetries, retryDelay);
            }
          }
        }
      }

      if (fs.existsSync(item.outputPath)) {
        const files = fs.readdirSync(item.outputPath);
        const fileBase = item.filename?.split(".")[0];

        if (fileBase && fileBase.length > 3 && fileBase !== "%(title)s") {
          for (const file of files) {
            if (file.includes(fileBase)) {
              if (
                file.endsWith(".part") ||
                file.endsWith(".ytdl") ||
                file.includes(".f") ||
                file.includes(".temp") ||
                file.includes(".tmp")
              ) {
                await deleteFileWithRetry(
                  path.join(item.outputPath, file),
                  maxRetries,
                  retryDelay,
                );
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(
        `[BaseDownloader] Error during cleanup for ${item.id}:`,
        error,
      );
    }
  }

  /**
   * Get common yt-dlp arguments
   */
  protected getBaseArgs(): string[] {
    return [
      "--no-warnings",
      "--newline",
      "--rm-cache-dir",
      "--no-check-certificates",
      "--geo-bypass",
      "--extractor-retries",
      "5",
      "--fragment-retries",
      "10",
      "--retry-sleep",
      "5",
      "--user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "--add-header",
      "Accept-Language:en-US,en;q=0.9",
      "--add-header",
      "Sec-Ch-Ua-Platform:Windows",
      "--add-header",
      "Sec-Fetch-Mode:navigate",
    ];
  }

  /**
   * Handle common yt-dlp progress and events
   */
  public setupProgressHandlers(
    eventEmitter: any,
    item: DownloadItem,
    stderrMessages: string[],
  ): void {
    let firstProgressReceived = false;

    eventEmitter.on("progress", (progress: any) => {
      if (
        item.status !== DownloadStatus.DOWNLOADING &&
        item.status !== DownloadStatus.PENDING &&
        item.status !== DownloadStatus.MERGING
      ) {
        return;
      }

      const wasFirstProgress = !firstProgressReceived;
      if (!firstProgressReceived) {
        firstProgressReceived = true;
        item.progress.downloadedBytes = 0;
      }

      if (progress.percent !== undefined && progress.percent !== null) {
        item.progress.progress = Math.min(100, Math.max(0, progress.percent));
      }

      if (progress.totalSize) {
        const newTotalBytes =
          typeof progress.totalSize === "string"
            ? parseBytes(progress.totalSize)
            : progress.totalSize;
        if (newTotalBytes !== null && newTotalBytes > 0) {
          item.progress.totalBytes = newTotalBytes;
        }
      }

      const totalBytesToUse = item.progress.totalBytes;
      if (
        totalBytesToUse &&
        totalBytesToUse > 0 &&
        progress.percent !== undefined
      ) {
        const calculatedBytes = Math.round(
          (progress.percent / 100) * totalBytesToUse,
        );
        if (calculatedBytes > item.progress.downloadedBytes) {
          if (wasFirstProgress && calculatedBytes > totalBytesToUse * 0.5) {
            item.progress.downloadedBytes = 0;
          } else {
            item.progress.downloadedBytes = calculatedBytes;
          }
        }
      }

      item.progress.speedString = progress.currentSpeed;
      item.progress.etaString = progress.eta;
      this.emit("progress", item.progress);
    });

    eventEmitter.on("ytDlpEvent", (eventType: string, eventData: string) => {
      if (
        item.status !== DownloadStatus.DOWNLOADING &&
        item.status !== DownloadStatus.PENDING &&
        item.status !== DownloadStatus.MERGING
      ) {
        return;
      }

      if (eventData) {
        const dataStr = String(eventData);

        // Robust manual progress parsing
        if (dataStr.includes("[download]") && dataStr.includes("%")) {
          // Match percentage: e.g., 10.5% or 100%
          const percentMatch = dataStr.match(/(\d+(?:\.\d+)?)%/);
          if (percentMatch) {
            const percent = parseFloat(percentMatch[1]);
            if (!isNaN(percent)) {
              item.progress.progress = percent;

              // Match total size: e.g., of 100.00MiB
              const sizeMatch = dataStr.match(/of\s+([^\s]+)/);
              if (sizeMatch && !item.progress.totalBytes) {
                const total = parseBytes(sizeMatch[1]);
                if (total) item.progress.totalBytes = total;
              }

              // Update downloaded bytes if we have total size
              if (item.progress.totalBytes) {
                item.progress.downloadedBytes = Math.round(
                  (percent / 100) * item.progress.totalBytes,
                );
              }

              // Match speed: e.g., at 10.00MiB/s
              const speedMatch = dataStr.match(/at\s+([^\s]+)/);
              if (speedMatch) item.progress.speedString = speedMatch[1];

              // Match ETA: e.g., ETA 00:10
              const etaMatch = dataStr.match(/ETA\s+([^\s]+)/);
              if (etaMatch) item.progress.etaString = etaMatch[1];

              this.emit("progress", item.progress);
            }
          }
        }

        if (dataStr.includes("ERROR:") || dataStr.includes("WARNING:")) {
          stderrMessages.push(dataStr);
          if (!item.error && dataStr.includes("ERROR:")) {
            item.error = dataStr;
          }
        }
      }

      if (eventType === "youtube-dl") {
        if (eventData.includes("[download] Destination:")) {
          const match = eventData.match(/Destination:\s+(.+)/);
          if (match) {
            item.progress.filename = path.basename(match[1]);
            item.filename = item.progress.filename;
          }
        } else if (eventData.includes("has already been downloaded")) {
          const match = eventData.match(
            /\[download\]\s+(.+)\s+has already been downloaded/,
          );
          if (match) {
            item.progress.filename = path.basename(match[1]);
            item.filename = item.progress.filename;
          }
        } else if (eventData.includes("[Merger] Merging formats into")) {
          const match = eventData.match(/into\s+"?(.+?)"?$/);
          if (match) {
            item.progress.filename = path.basename(match[1]);
            item.filename = item.progress.filename;
          }
          item.status = DownloadStatus.MERGING;
          item.progress.status = DownloadStatus.MERGING;
          this.emit("status-changed", item);
        }
      }
    });
  }

  /**
   * Map stderr messages and exit code to user-friendly error message
   */
  public mapErrorMessage(
    stderrMessages: string[],
    exitCode: number | null,
  ): string {
    const combinedErrors = stderrMessages.join("\n");

    if (
      combinedErrors.includes("Unable to parse data") ||
      combinedErrors.includes("Could not parse JSON")
    ) {
      return "Critical Error: Cannot parse video data from provider. Try again later.";
    }
    if (
      combinedErrors.includes("Video unavailable") ||
      combinedErrors.includes("Join this channel to get access")
    ) {
      return "Video unavailable: This video might be private or region-restricted.";
    }
    if (combinedErrors.includes("Sign in to confirm your age")) {
      return "Age restricted: This content requires age verification/cookies.";
    }
    if (combinedErrors.includes("Empty file")) {
      return "Provider error: Received empty file from server.";
    }
    if (combinedErrors.includes("No such file or directory")) {
      return "Filesystem error: Could not write to output directory.";
    }
    if (combinedErrors.includes("WinError 183")) {
      return "File already exists: Cannot overwrite or rename the existing file. Try changing the filename or enabling 'Overwrite' in settings.";
    }

    if (exitCode !== 0 && exitCode !== null) {
      return `Download failed (Exit code: ${exitCode}). ${stderrMessages.slice(-1)[0] || ""}`;
    }

    return (
      stderrMessages.find((m) => m.includes("ERROR:"))?.replace("ERROR:", "") ||
      "Unknown download error occurred"
    );
  }

  /**
   * Try to resolve the final filename and file size after download completion
   * Important for merged files where the initial name might have Changed
   */
  public async resolveFinalFileDetails(item: DownloadItem): Promise<void> {
    try {
      if (!fs.existsSync(item.outputPath)) return;

      // 1. Try to find the exact file if we have a filename
      if (item.filename) {
        const fullPath = path.join(item.outputPath, item.filename);
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          item.progress.totalBytes = stats.size;
          item.progress.downloadedBytes = stats.size;
          return;
        }
      }

      // 2. If filename with % was used or name changed during merge, search by title
      const files = fs.readdirSync(item.outputPath);
      const title = item.videoInfo?.title?.substring(0, 50);

      if (title) {
        // Find newest file matching title
        const matches = files
          .filter(
            (f) =>
              f.includes(title) && !f.endsWith(".part") && !f.endsWith(".ytdl"),
          )
          .map((f) => ({
            name: f,
            path: path.join(item.outputPath, f),
            mtime: fs.statSync(path.join(item.outputPath, f)).mtimeMs,
          }))
          .sort((a, b) => b.mtime - a.mtime);

        if (matches.length > 0) {
          const bestMatch = matches[0];
          item.filename = bestMatch.name;
          item.progress.filename = bestMatch.name;
          const stats = fs.statSync(bestMatch.path);
          item.progress.totalBytes = stats.size;
          item.progress.downloadedBytes = stats.size;
        }
      }
    } catch (e) {
      console.warn("[BaseDownloader] Failed to resolve final file details:", e);
    }
  }
}
