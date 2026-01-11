import { useState, useCallback, useMemo, useEffect } from "react";
import { useVideoInfo, startDownload, DownloadQuality } from "./useDownload";
import {
  detectPlatform,
  isPlaylistUrl,
  AUDIO_FORMAT_OPTIONS,
  FORMAT_OPTIONS,
  getAvailableQualityOptions,
} from "../utils/formatters";

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
  // Local state
  const [url, setUrl] = useState("");
  const [selectedQuality, setSelectedQuality] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  // Video info hook
  const { videoInfo, isLoading, error, extract, reset, setError } =
    useVideoInfo();

  // Computed values
  const platform = useMemo(() => {
    return url ? detectPlatform(url) : null;
  }, [url]);

  const isAudioOnly = useMemo(() => {
    return selectedQuality === DownloadQuality.AUDIO_ONLY;
  }, [selectedQuality]);

  const isGreater1080p = useMemo(() => {
    return Number(selectedQuality?.split("p")?.[0]) > 1080;
  }, [selectedQuality]);

  const currentFormats = useMemo(() => {
    return isAudioOnly
      ? AUDIO_FORMAT_OPTIONS
      : isGreater1080p
      ? FORMAT_OPTIONS.filter((f) => f.key === "mkv")
      : FORMAT_OPTIONS;
  }, [isAudioOnly, isGreater1080p]);

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

  // Set default format when current formats change
  useEffect(() => {
    if (currentFormats.length > 0) {
      if (
        !selectedFormat ||
        !currentFormats.find((f) => f.key === selectedFormat)
      ) {
        setSelectedFormat(currentFormats[0].key);
      }
    }
  }, [currentFormats, selectedFormat]);

  // Handle URL input change
  const handleUrlChange = useCallback(
    (value: string) => {
      setUrl(value);
      reset();
      setDownloadStatus(null);
    },
    [reset]
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
        `This link appears to be a ${platformName} playlist. Please use the 'Playlist/Channel' page for bulk downloads.`
      );
      return;
    }

    // 3. Optional: Check for supported platforms (warning instead of error to stay flexible)
    // const platformInfo = detectPlatform(trimmedUrl);
    // if (!platformInfo) {
    //   // We can still try to extract, but we warn the user
    // }

    const result = await extract(trimmedUrl);

    // 4. Check if the extracted info resulted in a playlist (sometimes detection fails but yt-dlp finds a list)
    if (result.success && result.data?.isPlaylist) {
      reset();
      const platformName = result.data.extractorKey || "this platform";
      setError(
        `This link was detected as a ${platformName} playlist. Please use the 'Playlist/Channel' page for bulk downloads.`
      );
    }
  }, [url, extract, reset, setError]);

  // Handle key press (Enter to fetch)
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleFetch();
      }
    },
    [handleFetch]
  );

  // Handle download
  const handleDownload = useCallback(async () => {
    if (!url.trim() || !selectedQuality) return;

    setIsDownloading(true);
    setDownloadStatus("Starting download...");

    try {
      const isAudioOnly = selectedQuality === DownloadQuality.AUDIO_ONLY;

      const result = await startDownload(videoInfo, {
        url: url.trim(),
        outputPath: "", // Will use default
        quality: selectedQuality,
        format: isAudioOnly ? selectedFormat : selectedFormat,
        audioOnly: isAudioOnly,
      });

      if (result.success) {
        setDownloadStatus(
          "Download started! Check Downloads tab for progress."
        );
      } else {
        setDownloadStatus(`Error: ${result.error}`);
      }
    } catch (err) {
      setDownloadStatus(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setIsDownloading(false);
    }
  }, [url, videoInfo, selectedQuality, selectedFormat]);

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
