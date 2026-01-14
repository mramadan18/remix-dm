import { DownloadQuality } from "../hooks/useDownload";
export { PLATFORMS } from "../types/download";
import { PLATFORMS, VideoFormat, VideoInfo } from "../types/download";

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number | null): string {
  if (!bytes) return "Unknown";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format duration in seconds to readable string
 */
export function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format view count
 */
export function formatViewCount(views: number | null): string {
  if (!views) return "N/A";
  if (views >= 1000000) return (views / 1000000).toFixed(1) + "M";
  if (views >= 1000) return (views / 1000).toFixed(1) + "K";
  return views.toString();
}

/**
 * Detect platform from URL
 */
export function detectPlatform(
  url: string
): { name: string; icon: string } | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace("www.", "");
    for (const platform of Object.values(PLATFORMS)) {
      if (platform.domains.some((d) => hostname.includes(d))) {
        return { name: platform.name, icon: platform.icon };
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Check if a URL is likely a playlist
 */
export function isPlaylistUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const params = urlObj.searchParams;

    // YouTube Playlist
    if (hostname.includes("youtube.com") && params.has("list")) {
      // Note: Some URLs have both watch?v= and list=, yt-dlp usually handles this depending on context.
      // But for "Single Download", we might want to warn if it's primarily a list.
      return true;
    }

    // Specific playlist paths for other platforms
    const playlistPatterns = [
      /playlist/i,
      /album/i,
      /set/i, // SoundCloud
      /course/i,
      /series/i,
    ];

    return playlistPatterns.some((pattern) => pattern.test(urlObj.pathname));
  } catch {
    return false;
  }
}

/**
 * Extract filename from URL
 */
export function getFilenameFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split("/");
    const lastPart = parts[parts.length - 1];

    if (lastPart && lastPart.includes(".") && lastPart.length > 3) {
      try {
        return decodeURIComponent(lastPart);
      } catch {
        return lastPart;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Extract available quality options from video formats
 */
export function getAvailableQualityOptions(
  videoInfo: VideoInfo | null
): Array<{ key: string; label: string; filesize?: string }> {
  if (!videoInfo) {
    return QUALITY_OPTIONS;
  }

  // Use pre-calculated quality options from the service if available
  if (videoInfo.qualityOptions && videoInfo.qualityOptions.length > 0) {
    return videoInfo.qualityOptions.map((opt) => ({
      key: opt.key,
      label: opt.totalSize
        ? `${opt.label} (${formatBytes(opt.totalSize)})`
        : opt.label,
    }));
  }

  // Fallback to legacy calculation if qualityOptions are missing
  if (!videoInfo.formats || videoInfo.formats.length === 0) {
    return QUALITY_OPTIONS;
  }

  const availableQualities = new Map<
    string,
    { key: string; label: string; filesize: number | null }
  >();

  // Always add "Best Quality" option
  availableQualities.set(DownloadQuality.BEST, {
    key: DownloadQuality.BEST,
    label: "Best Quality (Auto)",
    filesize: null,
  });

  // Group formats by resolution and find the best filesize for each
  const resolutionMap = new Map<string, VideoFormat>();

  videoInfo.formats.forEach((format) => {
    if (!format.hasVideo) return; // Skip audio-only formats

    const resolution = format.resolution;
    if (!resolution) return;

    const resolutionNum = parseInt(resolution.replace("p", ""));
    if (isNaN(resolutionNum)) return;

    // Map resolution to quality key
    let qualityKey: string | null = null;
    let qualityLabel: string | null = null;

    if (resolutionNum >= 2160) {
      qualityKey = DownloadQuality.QUALITY_4K;
      qualityLabel = "4K (2160p)";
    } else if (resolutionNum >= 1440) {
      qualityKey = DownloadQuality.QUALITY_1440P;
      qualityLabel = "2K (1440p)";
    } else if (resolutionNum >= 1080) {
      qualityKey = DownloadQuality.QUALITY_1080P;
      qualityLabel = "Full HD (1080p)";
    } else if (resolutionNum >= 720) {
      qualityKey = DownloadQuality.QUALITY_720P;
      qualityLabel = "HD (720p)";
    } else if (resolutionNum >= 480) {
      qualityKey = DownloadQuality.QUALITY_480P;
      qualityLabel = "SD (480p)";
    } else if (resolutionNum >= 360) {
      qualityKey = DownloadQuality.QUALITY_360P;
      qualityLabel = "Low (360p)";
    }

    if (!qualityKey || !qualityLabel) return;

    // Keep the format with the largest filesize for each quality
    const existing = resolutionMap.get(qualityKey);
    const currentSize = format.filesize || format.filesizeApprox || 0;
    const existingSize = existing?.filesize || existing?.filesizeApprox || 0;

    if (!existing || currentSize > existingSize) {
      resolutionMap.set(qualityKey, format);
      availableQualities.set(qualityKey, {
        key: qualityKey,
        label: qualityLabel,
        filesize: format.filesize || format.filesizeApprox,
      });
    }
  });

  // Check if audio-only formats are available
  const hasAudioFormats = videoInfo.formats.some(
    (f) => f.hasAudio && !f.hasVideo
  );
  if (hasAudioFormats) {
    const audioFormat = videoInfo.formats.find(
      (f) => f.hasAudio && !f.hasVideo
    );
    availableQualities.set(DownloadQuality.AUDIO_ONLY, {
      key: DownloadQuality.AUDIO_ONLY,
      label: "Audio Only",
      filesize: audioFormat?.filesize || audioFormat?.filesizeApprox || null,
    });
  }

  // Convert to array and sort by quality (highest first)
  const qualityOrder = [
    DownloadQuality.BEST,
    DownloadQuality.QUALITY_4K,
    DownloadQuality.QUALITY_1440P,
    DownloadQuality.QUALITY_1080P,
    DownloadQuality.QUALITY_720P,
    DownloadQuality.QUALITY_480P,
    DownloadQuality.QUALITY_360P,
    DownloadQuality.AUDIO_ONLY,
  ];

  const result = qualityOrder
    .filter((key) => availableQualities.has(key))
    .map((key) => {
      const quality = availableQualities.get(key)!;
      return {
        key: quality.key,
        label: quality.filesize
          ? `${quality.label} (${formatBytes(quality.filesize)})`
          : quality.label,
      };
    });

  return result.length > 0 ? result : QUALITY_OPTIONS;
}

/**
 * Quality options for downloads
 */
export const QUALITY_OPTIONS = [
  { key: DownloadQuality.BEST, label: "Best Quality (Auto)" },
  { key: DownloadQuality.QUALITY_4K, label: "4K (2160p)" },
  { key: DownloadQuality.QUALITY_1440P, label: "2K (1440p)" },
  { key: DownloadQuality.QUALITY_1080P, label: "Full HD (1080p)" },
  { key: DownloadQuality.QUALITY_720P, label: "HD (720p)" },
  { key: DownloadQuality.QUALITY_480P, label: "SD (480p)" },
  { key: DownloadQuality.QUALITY_360P, label: "Low (360p)" },
  { key: DownloadQuality.AUDIO_ONLY, label: "Audio Only" },
];

/**
 * Video format options
 */
export const FORMAT_OPTIONS = [
  { key: "mp4", label: "MP4 (Recommended)" },
  { key: "mkv", label: "MKV" },
  { key: "webm", label: "WebM" },
];

/**
 * Audio format options
 */
export const AUDIO_FORMAT_OPTIONS = [
  { key: "mp3", label: "MP3" },
  { key: "m4a", label: "M4A (AAC)" },
  { key: "opus", label: "Opus" },
  { key: "flac", label: "FLAC (Lossless)" },
];
