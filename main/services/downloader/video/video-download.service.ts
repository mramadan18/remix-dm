/**
 * Video Download Service
 * Handles downloading videos using yt-dlp-wrap with progress tracking
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import * as path from "path";
import * as fs from "fs";
import {
  getYtDlpWrap,
  ensureYtDlp,
  isBinaryAvailable,
  getFfmpegPath,
  isFfmpegAvailable,
} from "../../utils/binary-manager";
import {
  getDownloadSubPath,
  sanitizeFilename,
  formatBytes,
  formatSpeed,
  formatETA,
  parseBytes,
} from "../../utils/file-utils";
import {
  VideoInfo,
  DownloadOptions,
  DownloadItem,
  DownloadStatus,
  DownloadQuality,
  ApiResponse,
  VideoFormat,
  Thumbnail,
  SubtitleTrack,
  PlaylistInfo,
  PlaylistVideoEntry,
  QualityOption,
} from "../types";

/**
 * Download manager class for managing video downloads
 */
export class VideoDownloadService extends EventEmitter {
  private activeDownloads: Map<string, { process: any; item: DownloadItem }> =
    new Map();
  private downloadQueue: DownloadItem[] = [];
  private maxConcurrent: number = 3;
  // Track downloads that reached 100% or completed merge
  private completedDownloads: Set<string> = new Set();

  constructor(maxConcurrent: number = 3) {
    super();
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Get video metadata
   */
  async getVideoMetadata(url: string): Promise<ApiResponse<VideoInfo>> {
    try {
      await ensureYtDlp();
      const ytDlp = getYtDlpWrap();

      // Use execPromise with custom args instead of getVideoInfo()
      // The default getVideoInfo() uses "-f best" which is deprecated and causes warnings
      // We use "--dump-single-json" which fetches all formats without selecting one
      const rawOutput = await ytDlp.execPromise([
        url,
        "--dump-single-json",
        "--no-warnings",
        "--no-check-certificates",
        "--flat-playlist", // Don't download playlist items, just get metadata
      ]);
      const metadata = JSON.parse(rawOutput);

      // Map raw metadata to VideoInfo
      const videoInfo: VideoInfo = {
        id: metadata.id,
        title: metadata.title,
        description: metadata.description || null,
        duration: metadata.duration || null,
        durationString: metadata.duration_string || null,
        uploader: metadata.uploader || null,
        uploaderUrl: metadata.uploader_url || null,
        uploadDate: metadata.upload_date || null,
        viewCount: metadata.view_count || null,
        likeCount: metadata.like_count || null,
        thumbnail: metadata.thumbnail || null,
        thumbnails: (metadata.thumbnails || []).map((t: any) => ({
          url: t.url,
          width: t.width,
          height: t.height,
          resolution: t.resolution,
        })),
        formats: (metadata.formats || []).map((f: any) => ({
          formatId: f.format_id,
          extension: f.ext,
          resolution: f.resolution || null,
          quality: f.quality ? String(f.quality) : "",
          filesize: f.filesize || null,
          filesizeApprox: f.filesize_approx || null,
          fps: f.fps || null,
          vcodec: f.vcodec || null,
          acodec: f.acodec || null,
          hasVideo: f.vcodec !== "none",
          hasAudio: f.acodec !== "none",
          tbr: f.tbr || null,
        })),
        subtitles: this.mapSubtitles(metadata.subtitles),
        webpage_url: metadata.webpage_url,
        extractor: metadata.extractor,
        extractorKey: metadata.extractor_key,
        isLive: metadata.is_live || false,
        isPlaylist: !!metadata._type && metadata._type === "playlist",
      };

      // Process and group available formats into clean quality options
      videoInfo.qualityOptions = this.processQualityOptions(
        videoInfo.formats,
        videoInfo.duration
      );

      if (videoInfo.isPlaylist && metadata.entries) {
        videoInfo.playlist = {
          id: metadata.id,
          title: metadata.title,
          description: metadata.description || null,
          uploader: metadata.uploader || null,
          uploaderUrl: metadata.uploader_url || null,
          thumbnail: metadata.thumbnail || null,
          videoCount: metadata.entries.length,
          videos: metadata.entries.map((e: any, index: number) => ({
            id: e.id,
            title: e.title,
            duration: e.duration || null,
            thumbnail: e.thumbnail || null,
            url: e.url || e.webpage_url,
            index: index + 1,
          })),
        };
      }

      return {
        success: true,
        data: videoInfo,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch metadata";

      // Provide more helpful error messages for common issues
      let userFriendlyError = errorMessage;

      if (
        errorMessage.includes("Cannot parse data") ||
        errorMessage.includes("Unsupported URL")
      ) {
        userFriendlyError = `Unable to parse video data. This may be due to an outdated yt-dlp version. Please update yt-dlp and try again. Original error: ${errorMessage}`;
      } else if (
        errorMessage.includes("Video unavailable") ||
        errorMessage.includes("Private video")
      ) {
        userFriendlyError = "This video is unavailable or private.";
      } else if (errorMessage.includes("Sign in")) {
        userFriendlyError =
          "This video requires authentication. Please check if the video is accessible.";
      }

      return {
        success: false,
        error: userFriendlyError,
      };
    }
  }

  private mapSubtitles(subs: any): Record<string, SubtitleTrack[]> {
    if (!subs) return {};
    const result: Record<string, SubtitleTrack[]> = {};
    for (const lang in subs) {
      result[lang] = subs[lang].map((s: any) => ({
        language: lang,
        languageCode: lang,
        url: s.url,
        ext: s.ext,
        isAutoGenerated: false,
      }));
    }
    return result;
  }

  /**
   * Process and group formats into clean quality options with accurate size estimation
   */
  private processQualityOptions(
    formats: VideoFormat[],
    duration: number | null
  ): QualityOption[] {
    // Separate streams
    const videoOnly = formats.filter((f) => f.hasVideo && !f.hasAudio);
    const audioOnly = formats.filter((f) => f.hasAudio && !f.hasVideo);
    const combined = formats.filter((f) => f.hasVideo && f.hasAudio);

    // Find the best audio format as a baseline for DASH streams
    // Preference: opus (webm) > m4a > others. Then highest bitrate.
    const bestAudio = [...audioOnly].sort((a, b) => {
      const getAudioScore = (f: VideoFormat) => {
        const ext = (f.extension || "").toLowerCase();
        if (ext === "webm") return 3; // Typically opus
        if (ext === "m4a") return 2;
        return 1;
      };
      const scoreA = getAudioScore(a);
      const scoreB = getAudioScore(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return (b.tbr || 0) - (a.tbr || 0);
    })[0];

    const audioSize = bestAudio
      ? this.calculateFormatSize(bestAudio, duration) || 0
      : 0;

    // Group video formats by resolution height
    const groups = new Map<number, VideoFormat[]>();
    [...videoOnly, ...combined].forEach((f) => {
      const height = this.getHeightFromFormat(f);
      if (!height) return;
      if (!groups.has(height)) groups.set(height, []);
      groups.get(height)!.push(f);
    });

    const options: QualityOption[] = [];

    // For each resolution, prefer combined formats first, then pick the most efficient format
    groups.forEach((formatsInGroup, height) => {
      // First, try to find a combined format (video + audio together)
      const combinedFormats = formatsInGroup.filter((f) => f.hasAudio);
      const videoOnlyFormats = formatsInGroup.filter((f) => !f.hasAudio);

      // Prefer combined formats to avoid need for merging
      const formatsToSort =
        combinedFormats.length > 0 ? combinedFormats : videoOnlyFormats;

      const bestVideo = formatsToSort.sort((a, b) => {
        // Codec preference for efficiency (Modern codecs are smaller for same quality)
        const getCodecScore = (f: VideoFormat) => {
          const vcodec = (f.vcodec || "").toLowerCase();
          if (vcodec.includes("av01")) return 3; // AV1
          if (vcodec.includes("vp9") || vcodec.includes("vp09")) return 2; // VP9
          if (vcodec.includes("avc") || vcodec.includes("h264")) return 1; // H264
          return 0;
        };

        const scoreA = getCodecScore(a);
        const scoreB = getCodecScore(b);
        if (scoreA !== scoreB) return scoreB - scoreA;

        // If same codec, prefer higher FPS
        if ((b.fps || 0) !== (a.fps || 0)) return (b.fps || 0) - (a.fps || 0);

        // If same FPS, prefer the one yt-dlp would likely pick (bitrate/tbr)
        return (b.tbr || 0) - (a.tbr || 0);
      })[0];

      const videoSize = this.calculateFormatSize(bestVideo, duration) || 0;
      // If it's a combined format, don't add audioSize. If it's video-only, add best audio size.
      const totalSize = bestVideo.hasAudio ? videoSize : videoSize + audioSize;

      options.push({
        key: `${height}p`,
        label: this.getQualityLabel(height),
        quality: `${height}p`,
        resolution: bestVideo.resolution || `${height}p`,
        totalSize: totalSize > 0 ? totalSize : null,
        videoFormat: bestVideo,
        audioFormat: bestVideo.hasAudio ? undefined : bestAudio,
      });
    });

    // Add Audio Only option
    if (bestAudio) {
      options.push({
        key: "bestaudio",
        label: "Audio Only",
        quality: "audio",
        resolution: "audio",
        totalSize: audioSize > 0 ? audioSize : null,
        audioFormat: bestAudio,
      });
    }

    // Sort options by resolution descending (highest quality first)
    const sortedOptions = options.sort((a, b) => {
      const getRes = (key: string) => parseInt(key) || 0;
      const resA = getRes(a.key);
      const resB = getRes(b.key);
      if (resA !== resB) return resB - resA;
      return a.key === "bestaudio" ? 1 : -1;
    });

    // Add "Best Quality" auto option at the very top
    if (sortedOptions.length > 0 && sortedOptions[0].key !== "bestaudio") {
      const best = sortedOptions[0];
      sortedOptions.unshift({
        ...best,
        key: "best",
        label: "Best Quality (Auto)",
      });
    }

    return sortedOptions;
  }

  /**
   * Calculate approximate file size in bytes
   */
  private calculateFormatSize(
    format: VideoFormat,
    duration: number | null
  ): number | null {
    if (format.filesize) return format.filesize;
    if (format.filesizeApprox) return format.filesizeApprox;

    // Fallback: tbr (kbps) * duration (s) / 8
    if (format.tbr && duration) {
      return Math.round((format.tbr * 1024 * duration) / 8);
    }

    return null;
  }

  /**
   * Helper to extract numeric height from resolution string or format
   */
  private getHeightFromFormat(format: VideoFormat): number | null {
    // Try resolution string first (e.g., "1920x1080")
    if (format.resolution) {
      const match = format.resolution.match(/(\d+)p/);
      if (match) return parseInt(match[1]);
      const resMatch = format.resolution.match(/x(\d+)/);
      if (resMatch) return parseInt(resMatch[1]);
    }

    // Try quality field (e.g., "1080p")
    if (format.quality) {
      // Convert to string in case it's a number (e.g., from Facebook)
      const qualityStr = String(format.quality);
      const match = qualityStr.match(/(\d+)p/);
      if (match) return parseInt(match[1]);
    }

    return null;
  }

  /**
   * Get human readable label for quality
   */
  private getQualityLabel(height: number): string {
    if (height >= 2160) return "4K (2160p)";
    if (height >= 1440) return "2K (1440p)";
    if (height >= 1080) return "Full HD (1080p)";
    if (height >= 720) return "HD (720p)";
    if (height >= 480) return "SD (480p)";
    if (height >= 360) return "Low (360p)";
    return `${height}p`;
  }

  /**
   * Build yt-dlp arguments from download options
   */
  private buildArgs(
    options: DownloadOptions,
    outputFilePath: string,
    videoInfo?: VideoInfo | null
  ): string[] {
    const args: string[] = [
      "--no-warnings",
      "--newline", // Important for progress parsing
      "--restrict-filenames", // Restrict filenames to ASCII only, avoid special chars
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
    } else if (options.quality) {
      // First, try to find the quality option from videoInfo.qualityOptions
      let formatSelector: string | null = null;

      console.log("[buildArgs] options.quality:", options.quality);
      console.log(
        "[buildArgs] videoInfo?.qualityOptions:",
        videoInfo?.qualityOptions?.map((q) => ({
          key: q.key,
          videoFormatId: q.videoFormat?.formatId,
          audioFormatId: q.audioFormat?.formatId,
        }))
      );

      if (videoInfo?.qualityOptions) {
        const qualityOption = videoInfo.qualityOptions.find(
          (opt) => opt.key === options.quality
        );

        console.log(
          "[buildArgs] Found qualityOption:",
          qualityOption
            ? {
                key: qualityOption.key,
                videoFormatId: qualityOption.videoFormat?.formatId,
                audioFormatId: qualityOption.audioFormat?.formatId,
              }
            : null
        );

        if (qualityOption) {
          // Build format selector from the quality option
          if (qualityOption.key === "best") {
            // Prefer h264 (avc1) codec for maximum compatibility
            // Some platforms use HEVC/VP9 which don't play on all players
            formatSelector =
              "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
          } else if (qualityOption.key === "bestaudio") {
            formatSelector = "bestaudio";
          } else if (qualityOption.videoFormat && qualityOption.audioFormat) {
            // DASH streams (YouTube, Vimeo, Facebook, etc.): video + audio separate
            // Use format IDs with fallback to ensure format is available
            const height = this.getHeightFromFormat(qualityOption.videoFormat);
            const videoId = qualityOption.videoFormat.formatId;
            const audioId = qualityOption.audioFormat.formatId;

            // Build format selector with fallback chain:
            // 1. Try exact format IDs first
            // 2. Fallback to h264 codec at same height (most compatible)
            // 3. Fallback to any codec at same height
            // 4. Fallback to best available
            if (height) {
              formatSelector = `${videoId}+${audioId}/bestvideo[vcodec^=avc1][height<=${height}]+bestaudio/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
            } else {
              formatSelector = `${videoId}+${audioId}/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best`;
            }

            console.log("[buildArgs] Using DASH streams with fallback");
            console.log(`[buildArgs] Format selector: ${formatSelector}`);
          } else if (qualityOption.videoFormat) {
            // Combined formats (TikTok, Instagram, Facebook, Twitter, etc.)
            // Video and audio are together in one stream
            if (qualityOption.videoFormat.hasAudio) {
              // Combined format - use just the formatId
              // This ensures we get exactly the selected quality
              formatSelector = qualityOption.videoFormat.formatId;
            } else {
              // Video-only format (rare case) - add best audio as fallback
              formatSelector = `${qualityOption.videoFormat.formatId}+bestaudio`;
            }
          }
        }
      }

      console.log("[buildArgs] Final formatSelector:", formatSelector);

      // Fallback to qualityMap if formatSelector not found
      // All selectors prefer h264 (avc1) codec for maximum compatibility
      if (!formatSelector) {
        const qualityMap: Record<string, string> = {
          [DownloadQuality.BEST]:
            "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
          [DownloadQuality.BEST_VIDEO]:
            "bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best",
          [DownloadQuality.QUALITY_4K]:
            "bestvideo[vcodec^=avc1][height<=2160]+bestaudio/bestvideo[height<=2160]+bestaudio/best[height<=2160]",
          [DownloadQuality.QUALITY_1440P]:
            "bestvideo[vcodec^=avc1][height<=1440]+bestaudio/bestvideo[height<=1440]+bestaudio/best[height<=1440]",
          [DownloadQuality.QUALITY_1080P]:
            "bestvideo[vcodec^=avc1][height<=1080]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]",
          [DownloadQuality.QUALITY_720P]:
            "bestvideo[vcodec^=avc1][height<=720]+bestaudio/bestvideo[height<=720]+bestaudio/best[height<=720]",
          [DownloadQuality.QUALITY_480P]:
            "bestvideo[vcodec^=avc1][height<=480]+bestaudio/bestvideo[height<=480]+bestaudio/best[height<=480]",
          [DownloadQuality.QUALITY_360P]:
            "bestvideo[vcodec^=avc1][height<=360]+bestaudio/bestvideo[height<=360]+bestaudio/best[height<=360]",
          [DownloadQuality.AUDIO_ONLY]: "bestaudio",
        };
        formatSelector = qualityMap[options.quality] || options.quality;
      }

      args.push("-f", formatSelector);
    } else {
      // Default to best quality if no quality specified
      args.push(
        "-f",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
      );
    }

    // Merge format for video+audio
    // CRITICAL: yt-dlp requires ffmpeg to merge video and audio streams
    if (!options.audioOnly) {
      // Add ffmpeg location if available - REQUIRED for merging DASH streams
      const ffmpegLocation = getFfmpegPath();
      if (ffmpegLocation && isFfmpegAvailable()) {
        args.push("--ffmpeg-location", ffmpegLocation);
        console.log("[buildArgs] Using ffmpeg at:", ffmpegLocation);
      } else {
        console.warn(
          "[buildArgs] WARNING: ffmpeg not available, merging may fail!"
        );
      }

      // Specify output format (container)
      args.push("--merge-output-format", options.format || "mp4");

      // Remove intermediate files after successful merge
      args.push("--no-keep-video");

      // Just copy streams without re-encoding (fast)
      // Format selector already prefers h264 compatible formats
      args.push("--postprocessor-args", "ffmpeg:-c copy");
    }

    console.log("[buildArgs] Final args:", args.join(" "));

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
    const downloadId = randomUUID();
    const outputDir = options.outputPath || getDownloadSubPath("videos");

    // Ensure output directory exists (double-check)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate filename template
    // Always use yt-dlp template to avoid path length issues and let yt-dlp handle sanitization
    let filenameTemplate: string;
    if (options.filename && !options.filename.includes("%")) {
      // User provided a specific filename - sanitize it
      const sanitized = sanitizeFilename(options.filename, 200);
      filenameTemplate = sanitized;
    } else if (options.filename) {
      // User provided a template
      filenameTemplate = options.filename;
    } else {
      // Use yt-dlp template with sanitization
      // Limit title to 100 chars to avoid path length issues on Windows (MAX_PATH = 260)
      // yt-dlp will sanitize invalid chars with --restrict-filenames
      filenameTemplate = "%(title).100s.%(ext)s";
    }

    // Build output path with template
    // yt-dlp will replace %(title)s and %(ext)s with actual values and sanitize automatically
    const outputFilePath = path.join(outputDir, filenameTemplate);

    // Try to get initial file size from videoInfo
    let initialTotalBytes: number | null = null;
    if (videoInfo && videoInfo.formats && videoInfo.formats.length > 0) {
      // Get file size from the first format that has it
      const formatWithSize = videoInfo.formats.find(
        (f) => f.filesize || f.filesizeApprox
      );
      if (formatWithSize) {
        initialTotalBytes =
          formatWithSize.filesize || formatWithSize.filesizeApprox;
      }
    }

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
        totalBytes: initialTotalBytes,
        speed: null,
        speedString: null,
        eta: null,
        etaString: null,
        filename: null,
      },
      outputPath: outputDir,
      filename: filenameTemplate,
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
   * Execute a download using yt-dlp-wrap
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

    const args = this.buildArgs(item.options, outputFilePath, item.videoInfo);

    try {
      const ytDlpWrap = getYtDlpWrap();
      const eventEmitter = ytDlpWrap.exec(args);

      this.activeDownloads.set(item.id, {
        process: eventEmitter.ytDlpProcess,
        item,
      });

      // Handle Progress
      eventEmitter.on("progress", (progress) => {
        item.progress.progress = progress.percent;

        if (progress.totalSize) {
          item.progress.totalBytes =
            typeof progress.totalSize === "string"
              ? parseBytes(progress.totalSize)
              : progress.totalSize;
        }

        // Calculate downloaded bytes if total bytes is available
        if (item.progress.totalBytes) {
          item.progress.downloadedBytes =
            (item.progress.progress / 100) * item.progress.totalBytes;
        }

        item.progress.speedString = progress.currentSpeed;
        item.progress.etaString = progress.eta;

        this.emit("progress", item.progress);
      });

      // Handle Events (to detect filename, merging, etc)
      eventEmitter.on("ytDlpEvent", (eventType, eventData) => {
        // console.log(eventType, eventData);
        if (
          eventType === "youtube-dl" &&
          eventData.includes("[download] Destination:")
        ) {
          const match = eventData.match(/Destination:\s+(.+)/);
          if (match) {
            item.progress.filename = path.basename(match[1]);
            item.filename = item.progress.filename;
          }
        }

        if (
          eventData.includes("[Merger]") ||
          eventData.includes("Merging formats")
        ) {
          item.status = DownloadStatus.MERGING;
          item.progress.status = DownloadStatus.MERGING;
          this.completedDownloads.add(item.id);
          this.emit("status-changed", item);
        }
      });

      eventEmitter.on("close", (code) => {
        this.activeDownloads.delete(item.id);

        const reachedCompletion =
          this.completedDownloads.has(item.id) ||
          item.progress.progress === 100;

        if (code === 0 || reachedCompletion) {
          item.status = DownloadStatus.COMPLETED;
          item.completedAt = new Date();
          item.progress.status = DownloadStatus.COMPLETED;
          item.progress.progress = 100;
          this.completedDownloads.delete(item.id);
          this.emit("complete", item);
        } else if (item.status !== DownloadStatus.CANCELLED) {
          item.status = DownloadStatus.FAILED;
          item.progress.status = DownloadStatus.FAILED;
          this.emit("error", item, `Process exited with code ${code}`);
        }

        this.emit("status-changed", item);
        this.processQueue();
      });

      eventEmitter.on("error", (error) => {
        this.activeDownloads.delete(item.id);
        item.status = DownloadStatus.FAILED;
        item.error = error.message;
        item.progress.status = DownloadStatus.FAILED;
        this.emit("error", item, error.message);
        this.emit("status-changed", item);
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
   * Pause a download (kill the process)
   */
  pauseDownload(downloadId: string): boolean {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return false;

    // Use SIGTERM or SIGINT
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
