/**
 * Video Download Service
 * Handles downloading videos using yt-dlp-wrap with progress tracking
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
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
    // First option is now the default (no "best" option)
    const sortedOptions = options.sort((a, b) => {
      const getRes = (key: string) => parseInt(key) || 0;
      const resA = getRes(a.key);
      const resB = getRes(b.key);
      if (resA !== resB) return resB - resA;
      return a.key === "bestaudio" ? 1 : -1;
    });

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
      // Removed --restrict-filenames to support Arabic and other Unicode characters
      // yt-dlp will still sanitize invalid filesystem characters automatically
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
          if (qualityOption.key === "bestaudio") {
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
      // Default to first available quality if no quality specified
      if (videoInfo?.qualityOptions && videoInfo.qualityOptions.length > 0) {
        const firstQuality = videoInfo.qualityOptions[0];
        if (firstQuality.videoFormat && firstQuality.audioFormat) {
          const videoId = firstQuality.videoFormat.formatId;
          const audioId = firstQuality.audioFormat.formatId;
          args.push("-f", `${videoId}+${audioId}/bestvideo+bestaudio/best`);
        } else if (firstQuality.videoFormat) {
          args.push("-f", firstQuality.videoFormat.formatId);
        } else {
          args.push(
            "-f",
            "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
          );
        }
      } else {
        args.push(
          "-f",
          "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
        );
      }
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
   * Get quality label from video info and options for filename
   */
  private getQualityLabelForFilename(
    videoInfo: VideoInfo | null,
    quality: string | undefined
  ): string | null {
    if (!videoInfo || !quality) return null;

    const qualityOption = videoInfo.qualityOptions?.find(
      (opt) => opt.key === quality
    );

    if (!qualityOption) return null;

    // Prefer quality field (e.g., "1080p", "720p")
    if (qualityOption.quality) {
      return qualityOption.quality;
    }

    // Fallback to key if it's a valid quality (not "best" or "bestaudio")
    if (qualityOption.key && qualityOption.key !== "bestaudio") {
      return qualityOption.key;
    }

    return null;
  }

  /**
   * Generate filename template based on options and video info
   */
  private generateFilenameTemplate(
    options: DownloadOptions,
    videoInfo: VideoInfo | null,
    qualityLabel: string | null
  ): string {
    const hasNonEnglish =
      videoInfo?.title && /[^\x00-\x7F]/.test(videoInfo.title);

    // User provided specific filename (no template)
    if (options.filename && !options.filename.includes("%")) {
      const needsSlugify = /[^\x00-\x7F]/.test(options.filename);

      if (qualityLabel) {
        const ext = path.extname(options.filename);
        const nameWithoutExt = options.filename.replace(ext, "");
        return sanitizeFilename(
          `${nameWithoutExt}.${qualityLabel}${ext}`,
          200,
          needsSlugify
        );
      }

      return sanitizeFilename(options.filename, 200, needsSlugify);
    }

    // User provided template
    if (options.filename) {
      return qualityLabel
        ? options.filename.replace(/\.%\(ext\)s$/, `.${qualityLabel}.%(ext)s`)
        : options.filename;
    }

    // Default template
    const titleTemplate =
      hasNonEnglish && videoInfo?.title
        ? sanitizeFilename(videoInfo.title, 100, true).replace(/\.[^/.]+$/, "")
        : "%(title).100s";

    return qualityLabel
      ? `${titleTemplate}.${qualityLabel}.%(ext)s`
      : `${titleTemplate}.%(ext)s`;
  }

  /**
   * Get initial total bytes from video info
   */
  private getInitialTotalBytes(
    videoInfo: VideoInfo | null,
    quality: string | undefined
  ): number | null {
    if (!videoInfo) return null;

    // Try to get totalSize from the selected qualityOption
    if (quality) {
      const qualityOption = videoInfo.qualityOptions?.find(
        (opt) => opt.key === quality
      );
      if (qualityOption?.totalSize) {
        return qualityOption.totalSize;
      }
    }

    // Fallback: get file size from qualityOptions
    if (videoInfo.qualityOptions && videoInfo.qualityOptions.length > 0) {
      const firstQualityOption =
        videoInfo.qualityOptions.find(
          (opt) => opt.totalSize && opt.key !== "bestaudio"
        ) || videoInfo.qualityOptions[0];

      if (firstQualityOption?.totalSize) {
        return firstQualityOption.totalSize;
      }
    }

    // Last resort: estimate from formats
    if (!videoInfo.formats || videoInfo.formats.length === 0) {
      return null;
    }

    const videoFormats = videoInfo.formats.filter((f) => f.hasVideo);
    const audioFormats = videoInfo.formats.filter(
      (f) => f.hasAudio && !f.hasVideo
    );

    let maxVideoSize = 0;
    let maxAudioSize = 0;

    videoFormats.forEach((f) => {
      const size = f.filesize || f.filesizeApprox || 0;
      if (size > maxVideoSize) maxVideoSize = size;
    });

    audioFormats.forEach((f) => {
      const size = f.filesize || f.filesizeApprox || 0;
      if (size > maxAudioSize) maxAudioSize = size;
    });

    // If we have separate video and audio, sum them
    if (maxVideoSize > 0 && maxAudioSize > 0) {
      return maxVideoSize + maxAudioSize;
    }

    if (maxVideoSize > 0) {
      return maxVideoSize;
    }

    // Last resort: get file size from the first format that has it
    const formatWithSize = videoInfo.formats.find(
      (f) => f.filesize || f.filesizeApprox
    );

    return formatWithSize
      ? formatWithSize.filesize || formatWithSize.filesizeApprox
      : null;
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

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get quality label and generate filename
    const qualityLabel = this.getQualityLabelForFilename(
      videoInfo,
      options.quality
    );
    const filenameTemplate = this.generateFilenameTemplate(
      options,
      videoInfo,
      qualityLabel
    );

    // Get initial file size
    const initialTotalBytes = this.getInitialTotalBytes(
      videoInfo,
      options.quality
    );

    // Create download item
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

    // Add to queue and process
    this.downloadQueue.push(downloadItem);
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

    // Reset progress when starting a new download
    // This ensures downloadedBytes starts from 0 even if totalBytes is already set
    item.progress.progress = 0;
    item.progress.downloadedBytes = 0;

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

      // Track when download actually started (first progress event)
      let firstProgressReceived = false;

      // Handle Progress
      eventEmitter.on("progress", (progress) => {
        // IGNORE PROGRESS IF NOT DOWNLOADING
        if (
          item.status !== DownloadStatus.DOWNLOADING &&
          item.status !== DownloadStatus.PENDING
        ) {
          return;
        }

        const wasFirstProgress = !firstProgressReceived;

        // Mark that we've received the first progress event
        if (!firstProgressReceived) {
          firstProgressReceived = true;
          // Ensure downloadedBytes starts from 0 when download actually begins
          item.progress.downloadedBytes = 0;
        }

        // Update progress percentage (with safety check)
        if (progress.percent !== undefined && progress.percent !== null) {
          item.progress.progress = Math.min(100, Math.max(0, progress.percent));
        }

        // Update total bytes if available from progress event
        if (progress.totalSize) {
          const newTotalBytes =
            typeof progress.totalSize === "string"
              ? parseBytes(progress.totalSize)
              : progress.totalSize;

          // Only update if we got a valid value
          if (newTotalBytes !== null && newTotalBytes > 0) {
            item.progress.totalBytes = newTotalBytes;
          }
        }

        // Calculate downloaded bytes from percentage and total bytes
        // This ensures downloadedBytes is always updated when we have the necessary data
        // Use totalBytes from progress event, or fall back to initialTotalBytes from videoInfo
        const totalBytesToUse = item.progress.totalBytes;

        if (
          totalBytesToUse &&
          totalBytesToUse > 0 &&
          progress.percent !== undefined &&
          progress.percent !== null
        ) {
          const calculatedBytes = Math.round(
            (progress.percent / 100) * totalBytesToUse
          );

          // Only update if calculated value is greater than current
          // This ensures downloadedBytes increases gradually, not jumps to high values
          if (calculatedBytes > item.progress.downloadedBytes) {
            // Additional safety check: if this is the first progress event and calculatedBytes
            // is very high (e.g., > 50% of total), it might be a reporting error from yt-dlp
            // In that case, ignore the high value and start from 0
            if (wasFirstProgress && calculatedBytes > totalBytesToUse * 0.5) {
              // If first progress shows > 50%, it's likely incorrect, keep at 0
              item.progress.downloadedBytes = 0;
            } else {
              item.progress.downloadedBytes = calculatedBytes;
            }
          }
        }
        // If totalBytes is not available yet, downloadedBytes will remain at its current value
        // This prevents resetting to 0 when totalBytes hasn't been determined yet

        item.progress.speedString = progress.currentSpeed;
        item.progress.etaString = progress.eta;

        this.emit("progress", item.progress);
      });

      // Track stderr messages for better error reporting
      let stderrMessages: string[] = [];

      // Handle Events (to detect filename, merging, etc)
      eventEmitter.on("ytDlpEvent", (eventType, eventData) => {
        // IGNORE EVENTS IF NOT DOWNLOADING OR MERGING
        if (
          item.status !== DownloadStatus.DOWNLOADING &&
          item.status !== DownloadStatus.PENDING &&
          item.status !== DownloadStatus.MERGING
        ) {
          return;
        }

        // console.log(eventType, eventData);

        // Capture error messages from stderr
        if (eventData) {
          const errorData = String(eventData);

          // Check for error patterns
          if (
            errorData.includes("ERROR:") ||
            errorData.includes("WARNING:") ||
            errorData.includes("Cannot parse data") ||
            errorData.includes("Unsupported URL") ||
            errorData.includes("Video unavailable")
          ) {
            stderrMessages.push(errorData);
            // Store the error message for later use
            if (!item.error) {
              item.error = errorData;
            }
          }
        }

        if (eventType === "youtube-dl") {
          // 1. Standard Destination
          if (eventData.includes("[download] Destination:")) {
            const match = eventData.match(/Destination:\s+(.+)/);
            if (match) {
              item.progress.filename = path.basename(match[1]);
              item.filename = item.progress.filename;
            }
          }
          // 2. Already Downloaded
          else if (eventData.includes("has already been downloaded")) {
            const match = eventData.match(
              /\[download\]\s+(.+)\s+has already been downloaded/
            );
            if (match) {
              item.progress.filename = path.basename(match[1]);
              item.filename = item.progress.filename;
            }
          }
          // 3. Merger Output (Final File)
          else if (eventData.includes("[Merger] Merging formats into")) {
            const match = eventData.match(/into\s+"?(.+?)"?$/);
            if (match) {
              item.progress.filename = path.basename(match[1]);
              item.filename = item.progress.filename;
            }

            item.status = DownloadStatus.MERGING;
            item.progress.status = DownloadStatus.MERGING;
            this.completedDownloads.add(item.id);
            this.emit("status-changed", item);
          }
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

          // Try to get actual file size if totalBytes is not available or downloadedBytes is 0
          if (
            !item.progress.totalBytes ||
            item.progress.downloadedBytes === 0 ||
            item.filename?.includes("%") // Also check if filename is not resolved
          ) {
            try {
              // RESOLVE FILENAME: If filename still has template placeholders (like %(ext)s), find the real file
              if (item.filename?.includes("%")) {
                const outputDir = item.outputPath;
                if (fs.existsSync(outputDir)) {
                  // Get the base name without the extension placeholder
                  // e.g. "my-video.1080p.%(ext)s" -> "my-video.1080p."
                  const basePattern = item.filename.split(".%")[0];

                  const files = fs.readdirSync(outputDir);

                  // Find a file that starts with our base pattern
                  const matchingFile = files.find(
                    (f) =>
                      f.startsWith(basePattern) &&
                      !f.endsWith(".part") &&
                      !f.endsWith(".ytdl")
                  );

                  if (matchingFile) {
                    console.log(
                      `[VideoDownload] Resolved filename from disk: ${matchingFile}`
                    );
                    item.filename = matchingFile;
                    item.progress.filename = matchingFile;
                  }
                }
              }

              // First, try to use the filename if we have it
              if (item.progress.filename || item.filename) {
                const filename = item.progress.filename || item.filename;
                // Double check we don't hold a template
                if (filename && !filename.includes("%")) {
                  const filePath = path.join(item.outputPath, filename);
                  if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    if (stats.size > 0) {
                      item.progress.totalBytes = stats.size;
                      item.progress.downloadedBytes = stats.size;
                    }
                  }
                }
              }

              // If we still don't have the size, try to find the most recently modified file
              if (
                !item.progress.totalBytes ||
                item.progress.downloadedBytes === 0
              ) {
                const outputDir = item.outputPath;
                if (fs.existsSync(outputDir)) {
                  const files = fs.readdirSync(outputDir);
                  // Find the most recently modified file (likely the downloaded file)
                  const fileStats = files
                    .map((file) => {
                      const filePath = path.join(outputDir, file);
                      try {
                        const stats = fs.statSync(filePath);
                        // Skip directories and very small files (likely not the video)
                        if (stats.isFile() && stats.size > 1024) {
                          return {
                            path: filePath,
                            size: stats.size,
                            mtime: stats.mtime,
                          };
                        }
                        return null;
                      } catch {
                        return null;
                      }
                    })
                    .filter((stat) => stat !== null)
                    .sort((a, b) => b!.mtime.getTime() - a!.mtime.getTime());

                  if (fileStats.length > 0 && fileStats[0]) {
                    const actualSize = fileStats[0].size;
                    if (actualSize > 0) {
                      item.progress.totalBytes = actualSize;
                      item.progress.downloadedBytes = actualSize;
                    }
                  }
                }
              }
            } catch (error) {
              console.warn("[VideoDownload] Failed to get file size:", error);
            }
          } else if (
            item.progress.totalBytes &&
            item.progress.downloadedBytes === 0
          ) {
            // If we have totalBytes but downloadedBytes is 0, set it to totalBytes
            item.progress.downloadedBytes = item.progress.totalBytes;
          }

          this.completedDownloads.delete(item.id);
          this.emit("complete", item);
        } else if (
          item.status !== DownloadStatus.CANCELLED &&
          item.status !== DownloadStatus.PAUSED
        ) {
          item.status = DownloadStatus.FAILED;
          item.progress.status = DownloadStatus.FAILED;

          // Create a user-friendly error message
          let errorMessage = `Process exited with code ${code}`;

          // Use stderr messages if available
          if (stderrMessages.length > 0) {
            const lastError = stderrMessages[stderrMessages.length - 1];

            // Extract the actual error message
            const errorMatch = lastError.match(/ERROR:\s*(.+)/i);
            if (errorMatch) {
              errorMessage = errorMatch[1].trim();
            } else {
              // Try to find the main error line
              const errorLines = lastError
                .split("\n")
                .filter(
                  (line) =>
                    line.includes("ERROR:") ||
                    line.includes("Cannot parse") ||
                    line.includes("Unsupported URL")
                );
              if (errorLines.length > 0) {
                errorMessage = errorLines[0].replace(/ERROR:\s*/i, "").trim();
              } else {
                errorMessage = lastError.trim();
              }
            }

            // Provide helpful suggestions for common errors
            if (errorMessage.includes("Cannot parse data")) {
              errorMessage = `Unable to parse video data from this source. This may be due to:\n- An outdated yt-dlp version (try updating)\n- Changes in the website structure\n- The video may be private or restricted\n\nOriginal error: ${errorMessage}`;
            } else if (errorMessage.includes("Unsupported URL")) {
              errorMessage = `This URL is not supported. Please check the URL and try again.\n\nOriginal error: ${errorMessage}`;
            } else if (errorMessage.includes("Video unavailable")) {
              errorMessage = "This video is unavailable or has been removed.";
            }
          }

          item.error = errorMessage;
          this.emit("error", item, errorMessage);
        }

        this.emit("status-changed", item);
        this.processQueue();
      });

      eventEmitter.on("error", (error) => {
        this.activeDownloads.delete(item.id);

        // If manually paused or cancelled, don't report as error
        if (
          item.status === DownloadStatus.PAUSED ||
          item.status === DownloadStatus.CANCELLED
        ) {
          return;
        }

        item.status = DownloadStatus.FAILED;

        // Use stderr messages if available, otherwise use error message
        let errorMessage = error.message;
        if (stderrMessages.length > 0) {
          const lastError = stderrMessages[stderrMessages.length - 1];
          const errorMatch = lastError.match(/ERROR:\s*(.+)/i);
          if (errorMatch) {
            errorMessage = errorMatch[1].trim();
          } else {
            errorMessage = lastError.trim();
          }
        }

        item.error = errorMessage;
        item.progress.status = DownloadStatus.FAILED;
        this.emit("error", item, errorMessage);
        this.emit("status-changed", item);
        this.processQueue();
      });
    } catch (error) {
      if (
        (item.status as DownloadStatus) === DownloadStatus.PAUSED ||
        (item.status as DownloadStatus) === DownloadStatus.CANCELLED
      ) {
        return;
      }
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

    // 1. Set status FIRST so event listeners ignore coming events
    download.item.status = DownloadStatus.PAUSED;
    download.item.progress.status = DownloadStatus.PAUSED;

    // 2. Kill the process and all its children
    this.killProcess(download.process, downloadId);

    // 3. Update queue and notify
    this.activeDownloads.delete(downloadId);
    this.emit("status-changed", download.item);

    return true;
  }

  /**
   * Helper to kill process and its children robustly
   */
  private killProcess(process: any, downloadId: string): void {
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
            `[VideoDownload] taskkill failed for PID ${pid}, falling back to process.kill:`,
            err
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
        // Fallback to SIGKILL after a short delay if needed?
        // For now SIGTERM is usually enough on Unix
      } catch (e) {
        console.warn(`[VideoDownload] Failed to kill process ${pid}:`, e);
      }
    }
  }

  /**
   * Cleanup any files (partial or complete) associated with a download
   */
  private cleanupFiles(item: DownloadItem): void {
    if (!item.outputPath) return;

    try {
      // 1. If we have a concrete filename, try to delete it and its variations
      if (item.filename && !item.filename.includes("%")) {
        const fullPath = path.join(item.outputPath, item.filename);
        const variations = [
          fullPath,
          `${fullPath}.part`,
          `${fullPath}.ytdl`,
          `${fullPath}.temp`,
        ];

        variations.forEach((file) => {
          if (fs.existsSync(file)) {
            try {
              fs.unlinkSync(file);
            } catch (err) {
              console.warn(
                `[VideoDownload] Failed to delete file ${file}:`,
                err
              );
            }
          }
        });
      }

      // 2. Scan the directory for any related partial files (f137, f251 etc)
      if (fs.existsSync(item.outputPath)) {
        const files = fs.readdirSync(item.outputPath);

        // Use current filename base as pattern
        const fileBase = item.filename?.split(".")[0];

        if (fileBase && fileBase.length > 3 && fileBase !== "%(title)s") {
          files.forEach((file) => {
            if (file.includes(fileBase)) {
              if (
                file.endsWith(".part") ||
                file.endsWith(".ytdl") ||
                file.includes(".f") ||
                file.endsWith(".temp")
              ) {
                try {
                  fs.unlinkSync(path.join(item.outputPath, file));
                } catch (e) {}
              }
            }
          });
        }
      }
    } catch (error) {
      console.error(
        `[VideoDownload] Error during file cleanup for ${item.id}:`,
        error
      );
    }
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

      // Kill the process and all its children
      this.killProcess(active.process, downloadId);

      // Clean up files after a short delay to ensure process is released
      const itemToCleanup = { ...active.item };
      setTimeout(() => this.cleanupFiles(itemToCleanup), 1000);

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

      // Also try to cleanup files for queued items in case it was restarted
      this.cleanupFiles(item);

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
