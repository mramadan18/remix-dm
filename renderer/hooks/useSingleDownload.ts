import { useState, useCallback, useMemo, useEffect } from "react";
import {
  useVideoInfo,
  startDownload,
  DownloadQuality,
  useVideoActions,
  DownloadItem,
} from "./useDownload";
import {
  detectPlatform,
  isPlaylistUrl,
  AUDIO_FORMAT_OPTIONS,
  FORMAT_OPTIONS,
  getAvailableQualityOptions,
} from "../utils/formatters";
import { ApiResponse } from "../types/download";
import { useRouter } from "next/router";

export interface UseSingleDownloadReturn {
  // State
  url: string;
  selectedQuality: string;
  selectedFormat: string;
  isDownloading: boolean;
  downloadStatus: string | null;

  // Video info state
  videoInfo: ReturnType<typeof useVideoInfo>["videoInfo"];
  isLoading: boolean;
  error: string | null;

  // Computed values
  platform: { name: string; icon: string } | null;
  isAudioOnly: boolean;
  currentFormats: Array<{ key: string; label: string }>;
  availableQualities: Array<{ key: string; label: string }>;

  // Handlers
  handleUrlChange: (value: string) => void;
  handleFetch: () => Promise<void>;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  handleDownload: () => Promise<void>;
  handleClear: () => void;
  setSelectedQuality: (quality: string) => void;
  setSelectedFormat: (format: string) => void;
}

/**
 * Custom hook for managing single download logic
 */
export function useSingleDownload(): UseSingleDownloadReturn {
  const router = useRouter();
  // Local state
  const [url, setUrl] = useState("");
  const [selectedQuality, setSelectedQuality] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  // Video info hook
  const useVideoInfoResult = useVideoInfo();
  const {
    videoInfo,
    isLoading,
    error,
    extract,
    reset,
    setError,
    setIsLoading,
  } = useVideoInfoResult;
  const [isDirectDownload, setIsDirectDownload] = useState(false);
  const { detectLinkType, startDirectDownload } = useVideoActions();

  // Computed values
  const platform = useMemo(() => {
    return url ? detectPlatform(url) : null;
  }, [url]);

  const isAudioOnly = useMemo(() => {
    return selectedQuality === DownloadQuality.AUDIO_ONLY;
  }, [selectedQuality]);

  const isGreaterThan1080p = useMemo(() => {
    return Number(selectedQuality?.split("p")?.[0]) > 1080;
  }, [selectedQuality]);

  const currentFormats = useMemo(() => {
    if (isAudioOnly) return AUDIO_FORMAT_OPTIONS;

    if (isGreaterThan1080p) {
      return FORMAT_OPTIONS.filter((f) => f.key === "mkv");
    } else {
      return FORMAT_OPTIONS;
    }
  }, [isAudioOnly, isGreaterThan1080p]);

  const availableQualities = useMemo(() => {
    return getAvailableQualityOptions(videoInfo);
  }, [videoInfo]);

  // Set first quality as default when video info is loaded
  useEffect(() => {
    if (
      availableQualities.length > 0 &&
      (!selectedQuality ||
        !availableQualities.find((q) => q.key === selectedQuality))
    ) {
      setSelectedQuality(availableQualities[0].key);
    }
  }, [availableQualities, selectedQuality]);

  // Set default format based on quality when formats change
  useEffect(() => {
    if (currentFormats.length > 0) {
      // For video formats, choose MP4 for <= 1080p, MKV for > 1080p
      if (!isAudioOnly) {
        const qualityNum = Number(selectedQuality?.split("p")?.[0]);
        if (qualityNum > 1080) {
          setSelectedFormat("mkv");
        } else {
          setSelectedFormat("mp4");
        }
      } else {
        // For audio, keep the first option (usually mp3)
        setSelectedFormat(currentFormats[0].key);
      }
    }
  }, [currentFormats, selectedFormat, isAudioOnly, selectedQuality]);

  // Handle URL input change
  const handleUrlChange = useCallback(
    (value: string) => {
      setUrl(value);
      reset();
      setDownloadStatus(null);
    },
    [reset],
  );

  // Handle URL fetch
  const handleFetch = useCallback(async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    // 1. Basic URL validation
    try {
      new URL(trimmedUrl);
    } catch {
      reset();
      setError("Please enter a valid URL (e.g., https://youtube.com/...)");
      return;
    }

    // 2. Check if it's a playlist URL
    if (isPlaylistUrl(trimmedUrl)) {
      reset();
      const platformInfo = detectPlatform(trimmedUrl);
      const platformName = platformInfo ? platformInfo.name : "this platform";
      setError(
        `This link appears to be a ${platformName} playlist. Please use the 'Playlist/Channel' page for bulk downloads.`,
      );
      return;
    }

    // 3. Detect link type first (direct download vs video platform)
    setIsLoading(true);
    try {
      const linkType = await detectLinkType(trimmedUrl);

      if (linkType.success && linkType.data?.isDirect) {
        setIsDirectDownload(true);
        const data = linkType.data;

        // Mock video info for the UI to display file information
        const mockedInfo: any = {
          id: "direct-" + Date.now(),
          title:
            data.filename || trimmedUrl.split("/").pop() || "Direct Download",
          uploader: new URL(trimmedUrl).hostname,
          thumbnail: null,
          formats: [],
          qualityOptions: [
            {
              key: "original",
              label: "Direct File",
              quality: "file",
              resolution: "N/A",
              totalSize: data.contentLength || null,
            },
          ],
        };

        // @ts-ignore - internal setter
        useVideoInfoResult.setVideoInfo(mockedInfo);
        setSelectedQuality("original");
        setIsLoading(false);
        return;
      }
    } catch (err) {
      console.warn("[SingleDownload] Link type detection failed:", err);
    }

    setIsDirectDownload(false);
    const result = await extract(trimmedUrl);
    setIsLoading(false);

    // 4. Check if the extracted info resulted in a playlist (sometimes detection fails but yt-dlp finds a list)
    if (result.success && result.data?.isPlaylist) {
      reset();
      const platformName = result.data.extractorKey || "this platform";
      setError(
        `This link was detected as a ${platformName} playlist. Please use the 'Playlist/Channel' page for bulk downloads.`,
      );
    }
  }, [url, extract, reset, setError, detectLinkType]);

  // Handle key press (Enter to fetch)
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleFetch();
      }
    },
    [handleFetch],
  );

  // Handle download
  const handleDownload = useCallback(async () => {
    if (!url.trim()) return;

    // For video downloads, quality must be selected
    if (!isDirectDownload && !selectedQuality) return;

    setIsDownloading(true);
    setDownloadStatus("Starting download...");

    try {
      const isAudioOnly = selectedQuality === DownloadQuality.AUDIO_ONLY;

      let result: ApiResponse<DownloadItem>;
      if (isDirectDownload) {
        // Use direct downloader for files
        result = await startDirectDownload({
          url: url.trim(),
          outputPath: "", // Will use default
          filename: videoInfo?.title || undefined, // Use title we extracted or mocked
        });
      } else {
        // Use video downloader for media platforms
        result = await startDownload(videoInfo, {
          url: url.trim(),
          outputPath: "", // Will use default
          quality: selectedQuality,
          format: isAudioOnly ? selectedFormat : selectedFormat,
          audioOnly: isAudioOnly,
        });
      }

      if (result.success) {
        router.push("/downloads");
      } else {
        setDownloadStatus(`Error: ${result.error}`);
      }
    } catch (err) {
      setDownloadStatus(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsDownloading(false);
    }
  }, [url, videoInfo, selectedQuality, selectedFormat, isDirectDownload]);

  // Handle clear
  const handleClear = useCallback(() => {
    reset();
    setUrl("");
    setSelectedQuality("");
    setDownloadStatus(null);
  }, [reset]);

  // Handle quality change with format reset
  const handleQualityChange = useCallback((quality: string) => {
    setSelectedQuality(quality);
    // Reset format when switching to/from audio
    if (quality === DownloadQuality.AUDIO_ONLY) {
      setSelectedFormat("mp3");
    }
  }, []);

  return {
    // State
    url,
    selectedQuality,
    selectedFormat,
    isDownloading,
    downloadStatus,

    // Video info state
    videoInfo,
    isLoading,
    error,

    // Computed values
    platform,
    isAudioOnly,
    currentFormats,
    availableQualities,

    // Handlers
    handleUrlChange,
    handleFetch,
    handleKeyPress,
    handleDownload,
    handleClear,
    setSelectedQuality: handleQualityChange,
    setSelectedFormat,
  };
}
