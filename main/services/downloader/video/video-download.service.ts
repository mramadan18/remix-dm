/**
 * Video Download Service
 * Handles downloading videos using yt-dlp-wrap with progress tracking
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import * as path from "path";
import * as fs from "fs";
import { exec, ChildProcess } from "child_process";
import {
  getYtDlpWrap,
  ensureYtDlp,
  isBinaryAvailable,
  getFfmpegPath,
  isFfmpegAvailable,
} from "../../utils/binary-manager";
import {
  getDownloadSubPath,
  parseBytes,
  deleteFileWithRetry,
  renameFileForDeletion,
  scheduleFileDeletion,
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
import { settingsService } from "../../settings.service";

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
  // Track downloads that reached 100% or completed merge
  private completedDownloads: Set<string> = new Set();

  constructor() {
    super();
    this.maxConcurrent = settingsService.getSettings().maxConcurrentDownloads;
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

      // OPTIMIZATION: Limit playlist items for initial metadata fetch
      // For large playlists (e.g., 500+ videos), fetching all metadata at once
      // can cause huge JSON parsing delays. We limit to first 100 items.
      // NOTE: Do NOT use android,web player_client here
      // YouTube now requires PO Token for android client which blocks most formats
      // Using default clients gives us all available formats
      const args = [
        url,
        "--dump-single-json",
        "--no-warnings",
        "--no-check-certificates",
        "--flat-playlist", // Don't download playlist items, just get metadata
      ];

      // Check if this might be a playlist and add item limit
      // This helps with performance for large playlists
      if (
        url.includes("playlist") ||
        url.includes("list=") ||
        url.includes("channel")
      ) {
        args.push("--playlist-items", "1-50");
      }

      const rawOutput = await ytDlp.execPromise(args);
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
          protocol: f.protocol || null, // Important for filtering HLS (m3u8_native)
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
        videoInfo.duration,
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
          videos: metadata.entries.map((e: any, index: number) => {
            const entryThumbnail =
              e.thumbnail ||
              (e.thumbnails && e.thumbnails.length > 0
                ? e.thumbnails[e.thumbnails.length - 1].url
                : null);

            return {
              id: e.id,
              title: e.title,
              duration: e.duration || null,
              thumbnail: entryThumbnail,
              url: e.url || e.webpage_url,
              index: index + 1,
            };
          }),
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
   * OPTIMIZATION: Filters out HLS formats (m3u8) which are:
   * - Less stable than DASH
   * - Often cause "empty file" errors
   * - Numbers 91-96 on YouTube are typically HLS
   */
  private processQualityOptions(
    formats: VideoFormat[],
    duration: number | null,
  ): QualityOption[] {
    // Helper to check if format is HLS (unreliable format)
    const isHLS = (f: VideoFormat) => {
      return (
        f.protocol === "m3u8_native" ||
        f.protocol === "m3u8" ||
        f.extension === "m3u8"
      );
    };

    // Separate streams - AVOID HLS formats for YouTube
    // HLS (HTTP Live Streaming) is less reliable than DASH
    const videoOnly = formats.filter(
      (f) => f.hasVideo && !f.hasAudio && !isHLS(f),
    );
    const audioOnly = formats.filter(
      (f) => f.hasAudio && !f.hasVideo && !isHLS(f),
    );
    const combined = formats.filter(
      (f) => f.hasVideo && f.hasAudio && !isHLS(f),
    );

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
    duration: number | null,
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
    // Try resolution string first
    if (format.resolution) {
      // Match "1080p" format
      const pMatch = format.resolution.match(/(\d+)p/);
      if (pMatch) return parseInt(pMatch[1]);

      // Match "1920x1080" or "256x144" format (widthxheight)
      const wxhMatch = format.resolution.match(/(\d+)x(\d+)/);
      if (wxhMatch) return parseInt(wxhMatch[2]); // Return height (second number)
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
    videoInfo?: VideoInfo | null,
  ): string[] {
    const args: string[] = [
      "--no-warnings",
      "--newline", // Important for progress parsing
      // Removed --restrict-filenames to support Arabic and other Unicode characters
      // yt-dlp will still sanitize invalid filesystem characters automatically
      "-o",
      outputFilePath,

      // YOUTUBE BOT DETECTION MITIGATION:
      // YouTube has been aggressively blocking automated tools by sending empty/fake video files.
      // These flags help bypass detection:
      "--rm-cache-dir", // Clear cache to prevent using stale/blocked URLs
      "--no-check-certificates", // Already included but essential for blocked regions
      "--extractor-retries",
      "3", // Retry extractor if YouTube blocks the request
      "--fragment-retries",
      "5", // Retry individual fragments if download fails
    ];

    const settings = settingsService.getSettings();
    if (settings.onFileExists === "skip") {
      args.push("--no-overwrites");
    } else if (settings.onFileExists === "overwrite") {
      args.push("--force-overwrites");
    }

    // NOTE: Do NOT use android,web player_client here
    // YouTube now requires PO Token for android client which blocks most formats
    // The default client (android_sdkless + web_safari) provides all formats including AV1
    // This must match what getVideoMetadata uses to ensure format IDs are valid

    // 1. تقصير الاسم لضمان عدم تجاوز حد الـ 260 حرف في ويندوز
    args.push("--trim-filenames", "100");

    // 2. تجنب الرموز التي قد تسبب مشاكل في أنظمة الملفات القديمة
    args.push("--windows-filenames");

    // Add ffmpeg location if available - REQUIRED for post-processing (merging & audio extraction)
    const ffmpegLocation = getFfmpegPath();
    if (ffmpegLocation && isFfmpegAvailable()) {
      args.push("--ffmpeg-location", ffmpegLocation);
    }

    // Quality/Format selection
    if (options.audioOnly) {
      // Robust audio selector: prefer m4a (most compatible), avoid HLS, fallback to any audio
      // Using a fallback chain ensures we find something even if specific clients have limited formats
      let formatSelector =
        "bestaudio[ext=m4a][protocol!=m3u8_native]/bestaudio[ext=webm][protocol!=m3u8_native]/bestaudio/best";

      // If we have video info and a quality option for audio, try to use its specific format ID first
      if (videoInfo?.qualityOptions) {
        const audioOpt = videoInfo.qualityOptions.find(
          (opt) => opt.key === "bestaudio",
        );
        if (audioOpt?.audioFormat?.formatId) {
          formatSelector = `${audioOpt.audioFormat.formatId}/${formatSelector}`;
        }
      }

      args.push("-f", formatSelector);
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
        })),
      );

      if (videoInfo?.qualityOptions) {
        const qualityOption = videoInfo.qualityOptions.find(
          (opt) => opt.key === options.quality,
        );

        console.log(
          "[buildArgs] Found qualityOption:",
          qualityOption
            ? {
                key: qualityOption.key,
                videoFormatId: qualityOption.videoFormat?.formatId,
                audioFormatId: qualityOption.audioFormat?.formatId,
              }
            : null,
        );

        if (qualityOption) {
          const height = qualityOption.videoFormat
            ? this.getHeightFromFormat(qualityOption.videoFormat)
            : null;
          const videoId = qualityOption.videoFormat?.formatId;
          const audioId = qualityOption.audioFormat?.formatId || "bestaudio";

          if (qualityOption.key === "bestaudio") {
            formatSelector = "bestaudio/best";
          } else if (height) {
            // Solution:
            // 1. Try EXACT IDs from metadata
            // 2. Try best video at or below target height + best audio
            // 3. Try any format at or below target height
            // The '/' creates an OR condition, making it robust if IDs are unavailable
            formatSelector = `${videoId}+${audioId}/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;

            // Apply specific sorting to prioritize target resolution and compatibility
            args.push("--format-sort", `res:${height},vcodec:h264,acodec:m4a`);
          } else {
            formatSelector = `${videoId}+${audioId}/bestvideo+bestaudio/best`;
            args.push("--format-sort", "res,vcodec:h264,acodec:m4a");
          }

          console.log("[buildArgs] Using robust format selector");
          console.log(`[buildArgs] Format selector: ${formatSelector}`);
        }
      }

      console.log("[buildArgs] Final formatSelector:", formatSelector);

      // Fallback to qualityMap if formatSelector not found
      // All selectors avoid unconstrained "best" to prevent quality jumps
      if (!formatSelector) {
        const qualityMap: Record<string, string> = {
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
          [DownloadQuality.AUDIO_ONLY]: "bestaudio/best",
        };
        formatSelector = qualityMap[options.quality] || options.quality;

        // Apply general sorting for qualityMap
        const resMatch = options.quality.match(/(\d+)p/);
        if (resMatch) {
          args.push(
            "--format-sort",
            `res:${resMatch[1]},vcodec:h264,acodec:m4a`,
          );
        } else {
          args.push("--format-sort", "res,vcodec:h264,acodec:m4a");
        }
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
            "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
          );
        }
      } else {
        args.push(
          "-f",
          "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        );
      }
    }

    // Merge format for video+audio
    // CRITICAL: yt-dlp requires ffmpeg to merge video and audio streams
    if (!options.audioOnly) {
      const outputFormat = options.format || "mp4";
      args.push("--merge-output-format", outputFormat);

      // Remove intermediate files after successful merge
      args.push("--no-keep-video");

      // FIX for "Postprocessing: Stream #1:0 -> #0:1 (copy)" error
      // This error usually happens when trying to copy an incompatible audio codec (like Opus) into MP4.
      // We copy the video (fast) but re-encode the audio to AAC (very compatible with MP4).
      if (outputFormat === "mp4") {
        args.push("--postprocessor-args", "ffmpeg:-c:v copy -c:a aac");
      } else {
        args.push("--postprocessor-args", "ffmpeg:-c copy");
      }
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
    args.push("--add-metadata");

    // Rate limit
    if (options.rateLimit) {
      args.push("-r", options.rateLimit);
    }

    // Proxy
    if (options.proxy) {
      args.push("--proxy", options.proxy);
    }

    // User-Agent: Mimic real browser to avoid bot detection
    // YouTube is very aggressive about blocking automated tools
    // Using a recent Chrome user agent helps bypass detection
    args.push(
      "--user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );

    // Cookies
    if (options.cookies) {
      args.push("--cookies", options.cookies);
    }

    // DEBUGGING: Enable verbose mode to diagnose empty file errors
    // This helps identify whether the error is from fetching, writing, or merging
    // Verbose output will be captured in stderr and logged to console
    if (options.verbose) {
      args.push("--verbose");
      console.log(
        "[VideoDownload] Verbose mode enabled - check console for detailed yt-dlp output",
      );
    }

    // Add the URL last
    args.push(options.url);

    return args;
  }

  /**
   * Get initial total bytes from video info
   */
  private getInitialTotalBytes(
    videoInfo: VideoInfo | null,
    quality: string | undefined,
  ): number | null {
    if (!videoInfo) return null;

    // Try to get totalSize from the selected qualityOption
    if (quality) {
      const qualityOption = videoInfo.qualityOptions?.find(
        (opt) => opt.key === quality,
      );
      if (qualityOption?.totalSize) {
        return qualityOption.totalSize;
      }
    }

    // Fallback: get file size from qualityOptions
    if (videoInfo.qualityOptions && videoInfo.qualityOptions.length > 0) {
      const firstQualityOption =
        videoInfo.qualityOptions.find(
          (opt) => opt.totalSize && opt.key !== "bestaudio",
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
      (f) => f.hasAudio && !f.hasVideo,
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
      (f) => f.filesize || f.filesizeApprox,
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
    options: DownloadOptions,
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
    const outputDir =
      options.outputPath ||
      getDownloadSubPath(options.audioOnly ? "audios" : "videos");

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Use raw title from platform, yt-dlp will handle basic OS sanitization
    // We only sanitize if absolutely necessary (e.g. user provided custom name)
    let filenameTemplate: string;
    if (options.filename) {
      filenameTemplate = options.filename;
    } else {
      // Default template: Title + extension
      // %(title).100s limits the title to 100 characters to avoid Windows long path errors (260 char limit)
      filenameTemplate = "%(title).100s.%(ext)s";
    }

    // Get initial file size
    const initialTotalBytes = this.getInitialTotalBytes(
      videoInfo,
      options.quality,
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
    this.maxConcurrent = settingsService.getSettings().maxConcurrentDownloads;
    const runningCount = this.activeDownloads.size;
    const availableSlots = this.maxConcurrent - runningCount;

    if (availableSlots <= 0) return;

    // Get pending downloads
    const pendingDownloads = this.downloadQueue.filter(
      (d) => d.status === DownloadStatus.PENDING,
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
      item.filename || "%(title)s.%(ext)s",
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

        // OPTIMIZATION: Progress Calculation Strategy
        // yt-dlp sometimes sends `downloaded_bytes` directly in raw output,
        // but yt-dlp-wrap may not expose it reliably across all platforms/versions.
        // We use percentage-based calculation as a safe, consistent fallback that:
        // 1. Prevents UI jumps from inconsistent reporting
        // 2. Works reliably across all yt-dlp versions
        // 3. Provides smooth, gradual progress updates
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
            (progress.percent / 100) * totalBytesToUse,
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
              /\[download\]\s+(.+)\s+has already been downloaded/,
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

          try {
            const outputDir = item.outputPath;
            const currentFilename = item.filename || item.progress.filename;
            let finalFileResolved = false;

            // 1. RESOLVE FILENAME: Check if current filename is valid and exists
            // If it includes %, or has a format ID pattern (.f134, etc), or doesn't exist
            const isIntermediate =
              currentFilename && /\.(f\d+|temp|part)$/.test(currentFilename);
            const exists =
              currentFilename &&
              !currentFilename.includes("%") &&
              fs.existsSync(path.join(outputDir, currentFilename));

            if (!exists || isIntermediate || currentFilename?.includes("%")) {
              console.log(
                `[VideoDownload] Verifying final filename for ${item.id}...`,
              );

              if (fs.existsSync(outputDir)) {
                // Get the base name pattern from the template or current filename
                // e.g. "video.1080p.%(ext)s" -> "video.1080p."
                // e.g. "video.f134.mp4" -> "video."
                let basePattern = "";
                if (currentFilename?.includes("%")) {
                  basePattern = currentFilename.split(".%")[0];
                } else if (currentFilename) {
                  // Try to strip known intermediate suffixes
                  basePattern = currentFilename.replace(
                    /\.(f\d+|temp|part|ytdl).*$/,
                    "",
                  );
                }

                if (basePattern) {
                  const files = fs.readdirSync(outputDir);
                  // Find a file that starts with our base pattern and is not a part file
                  // Sort by mtime to get the newest match
                  const matchingFiles = files
                    .filter(
                      (f) =>
                        f.startsWith(basePattern) &&
                        !/\.(part|ytdl|f\d+)$/.test(f),
                    )
                    .map((f) => ({
                      name: f,
                      stats: fs.statSync(path.join(outputDir, f)),
                    }))
                    .sort(
                      (a, b) =>
                        b.stats.mtime.getTime() - a.stats.mtime.getTime(),
                    );

                  if (matchingFiles.length > 0) {
                    const bestMatch = matchingFiles[0].name;
                    console.log(
                      `[VideoDownload] Resolved final filename: ${bestMatch}`,
                    );
                    item.filename = bestMatch;
                    item.progress.filename = bestMatch;
                    finalFileResolved = true;
                  }
                }

                // If still not found, try finding the most recent file in the directory
                if (!finalFileResolved) {
                  const files = fs.readdirSync(outputDir);
                  const recentFiles = files
                    .map((f) => ({ name: f, path: path.join(outputDir, f) }))
                    .map((f) => {
                      try {
                        const stats = fs.statSync(f.path);
                        return stats.isFile() && stats.size > 1024 * 1024
                          ? { ...f, stats }
                          : null;
                      } catch {
                        return null;
                      }
                    })
                    .filter((f) => f !== null)
                    .sort(
                      (a, b) =>
                        b!.stats.mtime.getTime() - a!.stats.mtime.getTime(),
                    );

                  if (recentFiles.length > 0 && recentFiles[0]) {
                    // Only use it if it's very recent (last 30 seconds)
                    const now = new Date().getTime();
                    if (now - recentFiles[0].stats.mtime.getTime() < 30000) {
                      item.filename = recentFiles[0].name;
                      item.progress.filename = recentFiles[0].name;
                      finalFileResolved = true;
                    }
                  }
                }
              }
            }

            // 2. UPDATE PROGRESS/SIZE: Get actual file size
            const resolvedFilename = item.filename || item.progress.filename;
            if (resolvedFilename && !resolvedFilename.includes("%")) {
              const filePath = path.join(outputDir, resolvedFilename);
              if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                if (stats.size > 0) {
                  item.progress.totalBytes = stats.size;
                  item.progress.downloadedBytes = stats.size;
                }
              }
            } else if (
              item.progress.totalBytes &&
              item.progress.downloadedBytes === 0
            ) {
              item.progress.downloadedBytes = item.progress.totalBytes;
            }
          } catch (error) {
            console.warn(
              "[VideoDownload] Exception during completion details gathering:",
              error,
            );
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
                    line.includes("Unsupported URL"),
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
            } else if (errorMessage.includes("The downloaded file is empty")) {
              errorMessage =
                "⚠️ The downloaded file is empty. YouTube bot detection likely blocked this download.\n\n" +
                "🛠️ Troubleshooting steps:\n" +
                "1. UPDATE yt-dlp: Go to Settings > Engines > Update yt-dlp (Most common fix)\n" +
                "2. USE COOKIES: Export cookies from your browser and add them in download settings\n" +
                "3. CHECK PERMISSIONS: Ensure the download folder has write permissions\n" +
                "4. CLEAR CACHE: The app now clears cache automatically, but you can try restarting\n" +
                "5. ENABLE DEBUG: Set verbose mode to see detailed error logs\n\n" +
                "💡 This error is usually caused by YouTube's aggressive bot detection.";
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
            // Try to find the main error line
            const errorLines = lastError
              .split("\n")
              .filter(
                (line) =>
                  line.includes("ERROR:") ||
                  line.includes("Cannot parse") ||
                  line.includes("Unsupported URL"),
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
          } else if (errorMessage.includes("The downloaded file is empty")) {
            errorMessage =
              "⚠️ The downloaded file is empty. YouTube bot detection likely blocked this download.\n\n" +
              "🛠️ Troubleshooting steps:\n" +
              "1. UPDATE yt-dlp: Go to Settings > Engines > Update yt-dlp (Most common fix)\n" +
              "2. USE COOKIES: Export cookies from your browser and add them in download settings\n" +
              "3. CHECK PERMISSIONS: Ensure the download folder has write permissions\n" +
              "4. CLEAR CACHE: The app now clears cache automatically, but you can try restarting\n" +
              "5. ENABLE DEBUG: Set verbose mode to see detailed error logs\n\n" +
              "💡 This error is usually caused by YouTube's aggressive bot detection.";
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
  private killProcess(process: ChildProcess, downloadId: string): void {
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
        // Fallback to SIGKILL after a short delay if needed?
        // For now SIGTERM is usually enough on Unix
      } catch (e) {
        console.warn(`[VideoDownload] Failed to kill process ${pid}:`, e);
      }
    }
  }

  /**
   * Cleanup any files (partial or complete) associated with a download
   * OPTIMIZATION: Handles Windows file lock race conditions by:
   * 1. Using aggressive retry strategies with delays
   * 2. Renaming files first to break locks (Windows-specific)
   * 3. Scheduling delayed deletions if immediate deletion fails
   * This ensures cleanup succeeds even when Windows keeps file handles open
   * for several milliseconds after process termination
   */
  private async cleanupFiles(item: DownloadItem): Promise<void> {
    if (!item.outputPath) return;

    // Use aggressive retry strategy on Windows
    const isWindows = process.platform === "win32";
    const maxRetries = isWindows ? 15 : 10;
    const retryDelay = isWindows ? 2000 : 3000;

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

        for (const file of variations) {
          if (fs.existsSync(file)) {
            // On Windows, try rename first to break file handle locks
            if (isWindows) {
              const renamedPath = renameFileForDeletion(file);
              if (renamedPath) {
                console.log(
                  `[VideoDownload] Renamed file for deletion: ${file} -> ${renamedPath}`,
                );
                // Try to delete immediately
                const immediateSuccess = await deleteFileWithRetry(
                  renamedPath,
                  5,
                  1000,
                );
                if (!immediateSuccess) {
                  // Schedule for later deletion
                  scheduleFileDeletion(renamedPath, 15000);
                  console.log(
                    `[VideoDownload] Scheduled deletion for: ${renamedPath}`,
                  );
                }
              } else {
                // Rename failed, try normal deletion
                const success = await deleteFileWithRetry(
                  file,
                  maxRetries,
                  retryDelay,
                );
                if (!success) {
                  // Final attempt after longer wait
                  await new Promise((resolve) => setTimeout(resolve, 5000));
                  await deleteFileWithRetry(file, 5, 2000);
                }
              }
            } else {
              // Non-Windows: normal deletion
              const success = await deleteFileWithRetry(
                file,
                maxRetries,
                retryDelay,
              );
              if (success) {
                console.log(`[VideoDownload] Deleted file: ${file}`);
              }
            }
          }
        }
      }

      // 2. Scan the directory for any related partial files (f137, f251 etc)
      if (fs.existsSync(item.outputPath)) {
        const files = fs.readdirSync(item.outputPath);

        // Use current filename base as pattern
        const fileBase = item.filename?.split(".")[0];

        if (fileBase && fileBase.length > 3 && fileBase !== "%(title)s") {
          for (const file of files) {
            if (file.includes(fileBase)) {
              if (
                file.endsWith(".part") ||
                file.endsWith(".ytdl") ||
                file.includes(".f") ||
                file.endsWith(".temp")
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
        `[VideoDownload] Error during file cleanup for ${item.id}:`,
        error,
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
  async cancelDownload(downloadId: string): Promise<boolean> {
    // Check if active
    const active = this.activeDownloads.get(downloadId);
    if (active) {
      active.item.status = DownloadStatus.CANCELLED;
      active.item.progress.status = DownloadStatus.CANCELLED;

      // Kill the process and all its children
      this.killProcess(active.process, downloadId);

      this.activeDownloads.delete(downloadId);

      // Remove from queue
      const qIdx = this.downloadQueue.findIndex((d) => d.id === downloadId);
      if (qIdx !== -1) {
        this.downloadQueue.splice(qIdx, 1);
      }

      this.emit("item-removed", downloadId);

      // Wait longer for OS to release file locks (especially on Windows)
      const isWindows = process.platform === "win32";
      const waitTime = isWindows ? 4000 : 2000;

      // Background cleanup
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        const itemToCleanup = { ...active.item };
        await this.cleanupFiles(itemToCleanup);
      })();

      return true;
    }

    // Check if in queue
    const queueIndex = this.downloadQueue.findIndex((d) => d.id === downloadId);
    if (queueIndex !== -1) {
      const item = this.downloadQueue[queueIndex];
      const terminalState =
        item.status === DownloadStatus.COMPLETED ||
        item.status === DownloadStatus.FAILED ||
        item.status === DownloadStatus.CANCELLED;

      // If it's a finished job, remove it from queue
      if (terminalState) {
        this.downloadQueue.splice(queueIndex, 1);
        this.emit("item-removed", downloadId);
        return true;
      }

      item.status = DownloadStatus.CANCELLED;
      item.progress.status = DownloadStatus.CANCELLED;

      // Also try to cleanup files for queued items in case it was restarted
      await this.cleanupFiles(item);

      // Remove from queue after cancellation
      this.downloadQueue.splice(queueIndex, 1);
      this.emit("item-removed", downloadId);
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
        d.status !== DownloadStatus.CANCELLED &&
        d.status !== DownloadStatus.FAILED,
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
