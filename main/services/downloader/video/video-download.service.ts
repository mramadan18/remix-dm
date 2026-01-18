import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import * as path from "path";
import * as fs from "fs";
import { ChildProcess } from "child_process";
import {
  getYtDlpWrap,
  ensureYtDlp,
  isBinaryAvailable,
} from "../../utils/binary-manager";
import { getDownloadSubPath } from "../../utils/file-utils";
import {
  VideoInfo,
  DownloadOptions,
  DownloadItem,
  DownloadStatus,
  ApiResponse,
} from "../types";
import { settingsService } from "../../settings.service";
import { SingleVideoDownloader } from "./single-video-downloader";
import { PlaylistDownloader } from "./playlist-downloader";

export class VideoDownloadService extends EventEmitter {
  private activeDownloads: Map<
    string,
    { process: ChildProcess; item: DownloadItem }
  > = new Map();
  private downloadQueue: DownloadItem[] = [];
  private maxConcurrent: number = 3;
  private completedDownloads: Set<string> = new Set();

  private single = new SingleVideoDownloader();
  private playlist = new PlaylistDownloader();

  constructor() {
    super();
    this.maxConcurrent = settingsService.getSettings().maxConcurrentDownloads;

    // Forward events from sub-downloader instances to this service
    this.single.on("progress", (p) => this.emit("progress", p));
    this.single.on("status-changed", (i) => this.emit("status-changed", i));

    this.playlist.on("progress", (p) => this.emit("progress", p));
    this.playlist.on("status-changed", (i) => this.emit("status-changed", i));
  }

  async getVideoMetadata(url: string): Promise<ApiResponse<VideoInfo>> {
    const isP =
      url.includes("playlist") ||
      url.includes("list=") ||
      url.includes("channel");
    return isP
      ? this.playlist.getPlaylistMetadata(url)
      : this.single.getVideoMetadata(url);
  }

  async startDownload(
    vInfo: VideoInfo | null,
    opts: DownloadOptions,
  ): Promise<ApiResponse<DownloadItem | DownloadItem[]>> {
    if (!isBinaryAvailable()) {
      try {
        await ensureYtDlp();
      } catch (e) {
        return { success: false, error: "yt-dlp not available" };
      }
    }

    if (vInfo?.isPlaylist && vInfo.playlist) {
      const tsks = this.playlist.preparePlaylistVideoTasks(vInfo, opts);
      const itms = [];
      for (const tsk of tsks) {
        const itm = await this.createDownloadItem(tsk.videoInfo, tsk.options);
        this.downloadQueue.push(itm);
        itms.push(itm);
      }
      this.processQueue();
      return { success: true, data: itms };
    }

    const item = await this.createDownloadItem(vInfo, opts);
    this.downloadQueue.push(item);
    this.processQueue();
    return { success: true, data: item };
  }

  private async createDownloadItem(
    vInfo: VideoInfo | null,
    opts: DownloadOptions,
  ): Promise<DownloadItem> {
    const id = randomUUID();
    // Explicitly handle output path
    let dir = opts.outputPath;

    // If not provided, use default subpath
    if (!dir) {
      dir = getDownloadSubPath(opts.audioOnly ? "audios" : "videos");
    }

    // Ensure path is absolute relative to default app downloads if needed
    if (!path.isAbsolute(dir)) {
      const baseDownloads = getDownloadSubPath(
        opts.audioOnly ? "audios" : "videos",
      );
      dir = path.join(baseDownloads, dir);
    }

    // Ensure directory exists
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.error(
        `[VideoDownloadService] Failed to create directory ${dir}:`,
        err,
      );
    }

    const filenameTemplate = opts.filename || "%(title).150s.%(ext)s";

    return {
      id,
      url: opts.url,
      videoInfo: vInfo,
      options: { ...opts, outputPath: dir, filename: filenameTemplate },
      status: DownloadStatus.PENDING,
      progress: {
        downloadId: id,
        status: DownloadStatus.PENDING,
        progress: 0,
        downloadedBytes: 0,
        totalBytes: this.calcTotalBytes(vInfo, opts.quality),
        speed: null,
        speedString: null,
        eta: null,
        etaString: null,
        filename: null,
      },
      outputPath: dir,
      filename: filenameTemplate,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      retryCount: 0,
    };
  }

  private processQueue() {
    this.maxConcurrent = settingsService.getSettings().maxConcurrentDownloads;
    const running = this.activeDownloads.size;
    const pending = this.downloadQueue.filter(
      (d) => d.status === DownloadStatus.PENDING,
    );
    pending
      .slice(0, Math.max(0, this.maxConcurrent - running))
      .forEach((i) => this.execute(i));
  }

  private async execute(item: DownloadItem) {
    item.status = DownloadStatus.DOWNLOADING;
    item.startedAt = new Date();
    item.progress.status = DownloadStatus.DOWNLOADING;
    item.progress.progress = 0;
    this.emit("progress", item.progress);
    this.emit("status-changed", item);

    const fPath = path.join(
      item.outputPath,
      item.filename || "%(title)s.%(ext)s",
    );

    // Pre-check for existing files if overwrite is enabled (to avoid WinError 183)
    if (
      settingsService.getSettings().onFileExists === "overwrite" &&
      !fPath.includes("%")
    ) {
      try {
        if (fs.existsSync(fPath)) {
          fs.unlinkSync(fPath);
        }
      } catch (e) {
        console.warn(
          `[VideoDownloadService] Failed to pre-delete existing file ${fPath}:`,
          e,
        );
      }
    }

    const args = this.single.buildArgs(item.options, fPath, item.videoInfo);

    try {
      const wrap = getYtDlpWrap();
      const ee = wrap.exec(args);
      this.activeDownloads.set(item.id, { process: ee.ytDlpProcess, item });

      const errs: string[] = [];
      this.single.setupProgressHandlers(ee, item, errs);

      ee.on("close", async (code) => {
        this.activeDownloads.delete(item.id);
        const ok =
          code === 0 ||
          item.progress.progress === 100 ||
          item.status === DownloadStatus.MERGING;

        if (ok) {
          await this.single.resolveFinalFileDetails(item);
          item.status = DownloadStatus.COMPLETED;
          item.completedAt = new Date();
          item.progress.status = DownloadStatus.COMPLETED;
          item.progress.progress = 100;
          this.emit("complete", item);
        } else if (
          item.status !== DownloadStatus.CANCELLED &&
          item.status !== DownloadStatus.PAUSED
        ) {
          item.status = DownloadStatus.FAILED;
          item.progress.status = DownloadStatus.FAILED;
          item.error = this.single.mapErrorMessage(errs, code);
          this.emit("error", item, item.error);
        }
        this.emit("status-changed", item);
        this.processQueue();
      });

      ee.on("error", (err) => {
        this.activeDownloads.delete(item.id);
        if (
          item.status === DownloadStatus.PAUSED ||
          item.status === DownloadStatus.CANCELLED
        )
          return;
        item.status = DownloadStatus.FAILED;
        item.progress.status = DownloadStatus.FAILED;
        item.error = err.message;
        this.emit("error", item, err.message);
        this.emit("status-changed", item);
        this.processQueue();
      });
    } catch (e) {
      item.status = DownloadStatus.FAILED;
      item.error = e instanceof Error ? e.message : String(e);
      this.emit("status-changed", item);
      this.processQueue();
    }
  }

  private calcTotalBytes(
    vInfo: VideoInfo | null,
    q: string | undefined,
  ): number | null {
    if (!vInfo) return null;
    const opt = vInfo.qualityOptions?.find((o) => o.key === q);
    if (opt?.totalSize) return opt.totalSize;
    if (vInfo.qualityOptions?.length)
      return vInfo.qualityOptions[0].totalSize || null;

    // Fallback logic for summing video + audio
    const vF = vInfo.formats.filter((f) => f.hasVideo);
    const aF = vInfo.formats.filter((f) => f.hasAudio && !f.hasVideo);
    let maxV = 0,
      maxA = 0;
    vF.forEach(
      (f) => (maxV = Math.max(maxV, f.filesize || f.filesizeApprox || 0)),
    );
    aF.forEach(
      (f) => (maxA = Math.max(maxA, f.filesize || f.filesizeApprox || 0)),
    );
    return maxV + maxA || null;
  }

  pauseDownload(id: string) {
    const d = this.activeDownloads.get(id);
    if (!d) return false;
    d.item.status = DownloadStatus.PAUSED;
    this.single.killProcess(d.process, id);
    this.activeDownloads.delete(id);
    this.emit("status-changed", d.item);
    return true;
  }

  async resumeDownload(id: string) {
    const i = this.downloadQueue.find((d) => d.id === id);
    if (!i) return false;

    if (i.status === DownloadStatus.PAUSED) {
      i.status = DownloadStatus.PENDING;
      this.processQueue();
      return true;
    }

    if (i.status === DownloadStatus.FAILED) {
      i.status = DownloadStatus.PENDING;
      i.error = null;
      i.progress.progress = 0;
      i.progress.downloadedBytes = 0;
      // Clean up any partial files to ensure a fresh start
      await this.single.cleanupFiles(i);
      this.processQueue();
      return true;
    }

    return false;
  }

  async cancelDownload(id: string) {
    const a = this.activeDownloads.get(id);
    if (a) {
      a.item.status = DownloadStatus.CANCELLED;
      this.single.killProcess(a.process, id);
      this.activeDownloads.delete(id);
      const idx = this.downloadQueue.findIndex((d) => d.id === id);
      if (idx !== -1) this.downloadQueue.splice(idx, 1);
      this.emit("item-removed", id);
      setTimeout(() => this.single.cleanupFiles(a.item), 2000);
      return true;
    }
    const idx = this.downloadQueue.findIndex((d) => d.id === id);
    if (idx !== -1) {
      const i = this.downloadQueue[idx];
      this.downloadQueue.splice(idx, 1);
      this.emit("item-removed", id);
      this.single.cleanupFiles(i);
      return true;
    }
    return false;
  }

  getDownloadStatus(id: string) {
    return this.downloadQueue.find((d) => d.id === id) || null;
  }
  getAllDownloads() {
    return [...this.downloadQueue];
  }
  clearCompleted() {
    const b = this.downloadQueue.length;
    this.downloadQueue = this.downloadQueue.filter(
      (d) =>
        d.status !== DownloadStatus.COMPLETED &&
        d.status !== DownloadStatus.CANCELLED &&
        d.status !== DownloadStatus.FAILED,
    );
    return b - this.downloadQueue.length;
  }
}
export const videoDownloader = new VideoDownloadService();
