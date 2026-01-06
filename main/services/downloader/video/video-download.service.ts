/**
 * Video Download Service
 * Handles downloading videos using yt-dlp with progress tracking
 */

import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import * as path from "path";
import {
  spawnYtDlp,
  isBinaryAvailable,
  ensureYtDlp,
} from "../../utils/binary-manager";
import {
  getDefaultDownloadPath,
  getDownloadSubPath,
  sanitizeFilename,
  formatBytes,
  formatSpeed,
  formatETA,
  generateUniqueFilename,
} from "../../utils/file-utils";
import {
  VideoInfo,
  DownloadOptions,
  DownloadProgress,
  DownloadItem,
  DownloadStatus,
  DownloadQuality,
  ApiResponse,
} from "../types";

// Regex patterns for parsing yt-dlp output
const PATTERNS = {
  // [download]   5.0% of 100.00MiB at 5.00MiB/s ETA 00:19
  download:
    /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?(\d+\.?\d*)(KiB|MiB|GiB|B)\s+at\s+(\d+\.?\d*)(KiB|MiB|GiB|B)\/s\s+ETA\s+(\d+:\d+(?::\d+)?)/i,
  // Alternative format: [download]  50.0% of ~   100.00MiB at    5.00MiB/s ETA 00:10
  downloadAlt: /\[download\]\s+(\d+\.?\d*)%/,
  // [download] Destination: filename.mp4
  destination: /\[download\]\s+Destination:\s+(.+)/,
  // [Merger] Merging formats into "filename.mp4"
  merger: /\[Merger\]\s+Merging formats into\s+"(.+)"/,
  // [ffmpeg] Merging formats into "filename.mp4"
  ffmpegMerge: /\[ffmpeg\]\s+Merging formats into\s+"(.+)"/,
  // Already downloaded
  alreadyDownloaded: /\[download\]\s+(.+) has already been downloaded/,
  // Download completed
  downloadComplete: /\[download\]\s+100%/,
  // Fragment download: [download] Downloading fragment 5 of 100
  fragment: /\[download\]\s+Downloading\s+fragment\s+(\d+)\s+of\s+(\d+)/,
};

/**
 * Convert size string to bytes
 */
function parseSize(value: number, unit: string): number {
  const multipliers: Record<string, number> = {
    B: 1,
    KiB: 1024,
    MiB: 1024 * 1024,
    GiB: 1024 * 1024 * 1024,
  };
  return value * (multipliers[unit] || 1);
}

/**
 * Parse ETA string to seconds
 */
function parseEta(etaStr: string): number {
  const parts = etaStr.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Generate a unique download ID
 */
function generateDownloadId(): string {
  return randomUUID();
}

/**
 * Download manager class for managing video downloads
 */
export class VideoDownloadService extends EventEmitter {
  private activeDownloads: Map<
    string,
    { process: ChildProcess; item: DownloadItem }
  > = new Map();
  private downloadQueue: DownloadItem[] = [];
  private maxConcurrent: number = 3;

  constructor(maxConcurrent: number = 3) {
    super();
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Build yt-dlp arguments from download options
   */
  private buildArgs(
    options: DownloadOptions,
    outputFilePath: string
  ): string[] {
    const args: string[] = [
      "--no-warnings",
      "--newline", // Important for progress parsing
      "--progress",
      "-o",
      outputFilePath,
    ];

    // Quality/Format selection
    if (options.audioOnly) {
      args.push("-f", "bestaudio");
      args.push("-x"); // Extract audio
      if (options.format) {
        args.push("--audio-format", options.format);
      }
    } else if (options.format) {
      args.push("-f", options.format);
    } else if (options.quality) {
      const qualityMap: Record<string, string> = {
        [DownloadQuality.BEST]:
          "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        [DownloadQuality.BEST_VIDEO]: "bestvideo+bestaudio/best",
        [DownloadQuality.QUALITY_4K]:
          "bestvideo[height<=2160]+bestaudio/best[height<=2160]",
        [DownloadQuality.QUALITY_1440P]:
          "bestvideo[height<=1440]+bestaudio/best[height<=1440]",
        [DownloadQuality.QUALITY_1080P]:
          "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
        [DownloadQuality.QUALITY_720P]:
          "bestvideo[height<=720]+bestaudio/best[height<=720]",
        [DownloadQuality.QUALITY_480P]:
          "bestvideo[height<=480]+bestaudio/best[height<=480]",
        [DownloadQuality.QUALITY_360P]:
          "bestvideo[height<=360]+bestaudio/best[height<=360]",
        [DownloadQuality.AUDIO_ONLY]: "bestaudio",
      };
      const formatSelector = qualityMap[options.quality] || options.quality;
      args.push("-f", formatSelector);
    }

    // Merge format for video+audio
    if (!options.audioOnly) {
      args.push("--merge-output-format", options.format || "mp4");
    }

    // Subtitles
    if (options.subtitles?.download) {
      args.push("--write-subs");
      if (
        options.subtitles.languages &&
        options.subtitles.languages.length > 0
      ) {
        args.push("--sub-langs", options.subtitles.languages.join(","));
      } else {
        args.push("--sub-langs", "all");
      }
      if (options.subtitles.embedInVideo) {
        args.push("--embed-subs");
      }
    }

    // Thumbnail
    if (options.thumbnail?.download) {
      args.push("--write-thumbnail");
      if (options.thumbnail.embedInVideo) {
        args.push("--embed-thumbnail");
      }
    }

    // Metadata
    if (options.metadata?.embedInVideo) {
      args.push("--embed-metadata");
    }

    // Rate limit
    if (options.rateLimit) {
      args.push("-r", options.rateLimit);
    }

    // Proxy
    if (options.proxy) {
      args.push("--proxy", options.proxy);
    }

    // Cookies
    if (options.cookies) {
      args.push("--cookies", options.cookies);
    }

    // Add the URL last
    args.push(options.url);

    return args;
  }

  /**
   * Start a new download
   */
  async startDownload(
    videoInfo: VideoInfo | null,
    options: DownloadOptions
  ): Promise<ApiResponse<DownloadItem>> {
    // Ensure yt-dlp is available
    if (!isBinaryAvailable()) {
      try {
        await ensureYtDlp();
      } catch (error) {
        return {
          success: false,
          error: "yt-dlp is not available",
        };
      }
    }

    // Create download item
    const downloadId = generateDownloadId();
    const outputDir = options.outputPath || getDownloadSubPath("videos");

    // Generate filename
    let filename = options.filename;
    if (!filename && videoInfo) {
      const ext = options.audioOnly
        ? options.format || "mp3"
        : options.format || "mp4";
      filename = sanitizeFilename(videoInfo.title) + "." + ext;
    }
    if (!filename) {
      filename = "%(title)s.%(ext)s"; // Let yt-dlp handle it
    }

    const outputFilePath = path.join(outputDir, filename);

    const downloadItem: DownloadItem = {
      id: downloadId,
      url: options.url,
      videoInfo,
      options,
      status: DownloadStatus.PENDING,
      progress: {
        downloadId,
        status: DownloadStatus.PENDING,
        progress: 0,
        downloadedBytes: 0,
        totalBytes: null,
        speed: null,
        speedString: null,
        eta: null,
        etaString: null,
        filename: null,
      },
      outputPath: outputDir,
      filename,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      retryCount: 0,
    };

    // Add to queue
    this.downloadQueue.push(downloadItem);

    // Process queue
    this.processQueue();

    return {
      success: true,
      data: downloadItem,
    };
  }

  /**
   * Process the download queue
   */
  private processQueue(): void {
    const runningCount = this.activeDownloads.size;
    const availableSlots = this.maxConcurrent - runningCount;

    if (availableSlots <= 0) return;

    // Get pending downloads
    const pendingDownloads = this.downloadQueue.filter(
      (d) => d.status === DownloadStatus.PENDING
    );

    // Start downloads up to available slots
    const toStart = pendingDownloads.slice(0, availableSlots);

    for (const item of toStart) {
      this.executeDownload(item);
    }
  }

  /**
   * Execute a download
   */
  private async executeDownload(item: DownloadItem): Promise<void> {
    // Update status
    item.status = DownloadStatus.DOWNLOADING;
    item.startedAt = new Date();
    item.progress.status = DownloadStatus.DOWNLOADING;

    this.emit("status-changed", item);

    const outputFilePath = path.join(
      item.outputPath,
      item.filename || "%(title)s.%(ext)s"
    );

    const args = this.buildArgs(item.options, outputFilePath);

    try {
      const process = spawnYtDlp(args);

      this.activeDownloads.set(item.id, { process, item });

      // Handle stdout (progress)
      process.stdout?.on("data", (data) => {
        this.parseProgress(item, data.toString());
      });

      // Handle stderr
      process.stderr?.on("data", (data) => {
        const stderr = data.toString();
        console.log("yt-dlp stderr:", stderr);

        // Check for errors
        if (stderr.includes("ERROR")) {
          item.error = stderr;
        }
      });

      // Handle process close
      process.on("close", (code) => {
        this.activeDownloads.delete(item.id);

        if (code === 0) {
          item.status = DownloadStatus.COMPLETED;
          item.completedAt = new Date();
          item.progress.status = DownloadStatus.COMPLETED;
          item.progress.progress = 100;

          this.emit("complete", item);
        } else if (item.status !== DownloadStatus.CANCELLED) {
          item.status = DownloadStatus.FAILED;
          item.progress.status = DownloadStatus.FAILED;

          this.emit(
            "error",
            item,
            item.error || `Process exited with code ${code}`
          );
        }

        this.emit("status-changed", item);

        // Process next in queue
        this.processQueue();
      });

      process.on("error", (error) => {
        this.activeDownloads.delete(item.id);

        item.status = DownloadStatus.FAILED;
        item.error = error.message;
        item.progress.status = DownloadStatus.FAILED;

        this.emit("error", item, error.message);
        this.emit("status-changed", item);

        // Process next in queue
        this.processQueue();
      });
    } catch (error) {
      item.status = DownloadStatus.FAILED;
      item.error = error instanceof Error ? error.message : "Unknown error";
      item.progress.status = DownloadStatus.FAILED;

      this.emit("error", item, item.error);
      this.emit("status-changed", item);

      this.processQueue();
    }
  }

  /**
   * Parse yt-dlp output for progress information
   */
  private parseProgress(item: DownloadItem, output: string): void {
    const lines = output.split("\n");

    for (const line of lines) {
      // Check for destination filename
      const destMatch = line.match(PATTERNS.destination);
      if (destMatch) {
        item.progress.filename = path.basename(destMatch[1]);
        item.filename = item.progress.filename;
      }

      // Check for merger
      const mergerMatch =
        line.match(PATTERNS.merger) || line.match(PATTERNS.ffmpegMerge);
      if (mergerMatch) {
        item.status = DownloadStatus.MERGING;
        item.progress.status = DownloadStatus.MERGING;
        this.emit("status-changed", item);
      }

      // Check for fragment download
      const fragmentMatch = line.match(PATTERNS.fragment);
      if (fragmentMatch) {
        item.progress.currentFragment = parseInt(fragmentMatch[1]);
        item.progress.totalFragments = parseInt(fragmentMatch[2]);
      }

      // Check for download progress
      const downloadMatch = line.match(PATTERNS.download);
      if (downloadMatch) {
        const [, percent, size, sizeUnit, speed, speedUnit, eta] =
          downloadMatch;

        const totalBytes = parseSize(parseFloat(size), sizeUnit);
        const percentNum = parseFloat(percent);
        const downloadedBytes = totalBytes * (percentNum / 100);
        const speedBytes = parseSize(parseFloat(speed), speedUnit);
        const etaSeconds = parseEta(eta);

        item.progress.progress = percentNum;
        item.progress.totalBytes = totalBytes;
        item.progress.downloadedBytes = downloadedBytes;
        item.progress.speed = speedBytes;
        item.progress.speedString = formatSpeed(speedBytes);
        item.progress.eta = etaSeconds;
        item.progress.etaString = formatETA(etaSeconds);

        this.emit("progress", item.progress);
      } else {
        // Try alternative progress pattern
        const altMatch = line.match(PATTERNS.downloadAlt);
        if (altMatch) {
          item.progress.progress = parseFloat(altMatch[1]);
          this.emit("progress", item.progress);
        }
      }

      // Check for completion
      if (line.match(PATTERNS.downloadComplete)) {
        item.progress.progress = 100;
        this.emit("progress", item.progress);
      }

      // Check for already downloaded
      const alreadyMatch = line.match(PATTERNS.alreadyDownloaded);
      if (alreadyMatch) {
        item.progress.progress = 100;
        item.progress.filename = path.basename(alreadyMatch[1]);
        this.emit("progress", item.progress);
      }
    }
  }

  /**
   * Pause a download (kill the process)
   */
  pauseDownload(downloadId: string): boolean {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return false;

    download.process.kill("SIGTERM");
    download.item.status = DownloadStatus.PAUSED;
    download.item.progress.status = DownloadStatus.PAUSED;

    this.activeDownloads.delete(downloadId);
    this.emit("status-changed", download.item);

    return true;
  }

  /**
   * Resume a paused download
   */
  resumeDownload(downloadId: string): boolean {
    const item = this.downloadQueue.find((d) => d.id === downloadId);
    if (!item || item.status !== DownloadStatus.PAUSED) return false;

    item.status = DownloadStatus.PENDING;
    item.progress.status = DownloadStatus.PENDING;

    this.processQueue();
    return true;
  }

  /**
   * Cancel a download
   */
  cancelDownload(downloadId: string): boolean {
    // Check if active
    const active = this.activeDownloads.get(downloadId);
    if (active) {
      active.item.status = DownloadStatus.CANCELLED;
      active.item.progress.status = DownloadStatus.CANCELLED;
      active.process.kill("SIGTERM");
      this.activeDownloads.delete(downloadId);
      this.emit("status-changed", active.item);
      return true;
    }

    // Check if in queue
    const queueIndex = this.downloadQueue.findIndex((d) => d.id === downloadId);
    if (queueIndex !== -1) {
      const item = this.downloadQueue[queueIndex];
      item.status = DownloadStatus.CANCELLED;
      item.progress.status = DownloadStatus.CANCELLED;
      this.emit("status-changed", item);
      return true;
    }

    return false;
  }

  /**
   * Get download status
   */
  getDownloadStatus(downloadId: string): DownloadItem | null {
    return this.downloadQueue.find((d) => d.id === downloadId) || null;
  }

  /**
   * Get all downloads
   */
  getAllDownloads(): DownloadItem[] {
    return [...this.downloadQueue];
  }

  /**
   * Clear completed downloads from queue
   */
  clearCompleted(): number {
    const before = this.downloadQueue.length;
    this.downloadQueue = this.downloadQueue.filter(
      (d) =>
        d.status !== DownloadStatus.COMPLETED &&
        d.status !== DownloadStatus.CANCELLED
    );
    return before - this.downloadQueue.length;
  }

  /**
   * Set maximum concurrent downloads
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
    this.processQueue();
  }
}

// Export singleton instance
export const videoDownloader = new VideoDownloadService();
