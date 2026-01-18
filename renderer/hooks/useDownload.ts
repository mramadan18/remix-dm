/**
 * Download API Hook
 * Provides easy access to download functionality from renderer
 */

import { useCallback, useEffect, useState } from "react";
import {
  VideoInfo,
  DownloadOptions,
  DownloadItem,
  DownloadProgress,
  DownloadStatus,
  DownloadQuality,
  ApiResponse,
  DownloadIpcChannels,
  LinkTypeResult,
  DetectionMode,
} from "../types/download";

/**
 * Extract video information from URL
 */
export async function extractVideoInfo(
  url: string,
): Promise<ApiResponse<VideoInfo>> {
  try {
    const result = await window.ipc.invoke(
      DownloadIpcChannels.EXTRACT_VIDEO_INFO,
      url,
    );
    return result as ApiResponse<VideoInfo>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to extract video info",
    };
  }
}

/**
 * Start a new download
 */
export async function startDownload(
  videoInfo: VideoInfo | null,
  options: DownloadOptions,
): Promise<ApiResponse<DownloadItem | DownloadItem[]>> {
  try {
    const result = await window.ipc.invoke(DownloadIpcChannels.START_DOWNLOAD, {
      videoInfo,
      options,
    });
    return result as ApiResponse<DownloadItem>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to start download",
    };
  }
}

/**
 * Pause a download
 */
export async function pauseDownload(
  downloadId: string,
): Promise<ApiResponse<boolean>> {
  try {
    const result = await window.ipc.invoke(
      DownloadIpcChannels.PAUSE_DOWNLOAD,
      downloadId,
    );
    return result as ApiResponse<boolean>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to pause download",
    };
  }
}

/**
 * Resume a download
 */
export async function resumeDownload(
  downloadId: string,
): Promise<ApiResponse<boolean>> {
  try {
    const result = await window.ipc.invoke(
      DownloadIpcChannels.RESUME_DOWNLOAD,
      downloadId,
    );
    return result as ApiResponse<boolean>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to resume download",
    };
  }
}

/**
 * Cancel a download
 */
export async function cancelDownload(
  downloadId: string,
): Promise<ApiResponse<boolean>> {
  try {
    const result = await window.ipc.invoke(
      DownloadIpcChannels.CANCEL_DOWNLOAD,
      downloadId,
    );
    return result as ApiResponse<boolean>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to cancel download",
    };
  }
}

/**
 * Get all downloads
 */
export async function getAllDownloads(): Promise<ApiResponse<DownloadItem[]>> {
  try {
    const result = await window.ipc.invoke(
      DownloadIpcChannels.GET_ALL_DOWNLOADS,
      null,
    );
    return result as ApiResponse<DownloadItem[]>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get downloads",
    };
  }
}

/**
 * Clear completed downloads
 */
export async function clearCompletedDownloads(): Promise<ApiResponse<number>> {
  try {
    const result = await window.ipc.invoke(
      DownloadIpcChannels.CLEAR_COMPLETED,
      null,
    );
    return result as ApiResponse<number>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to clear downloads",
    };
  }
}

/**
 * Open file location in explorer
 */
export async function openFileLocation(
  path: string,
): Promise<ApiResponse<boolean>> {
  try {
    const result = await window.ipc.invoke("shell:show-item-in-folder", path);
    return result as ApiResponse<boolean>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to open file location",
    };
  }
}

/**
 * Open file with default application
 */
export async function openFile(path: string): Promise<ApiResponse<boolean>> {
  try {
    const result = await window.ipc.invoke("shell:open-path", path);
    return result as ApiResponse<boolean>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to open file",
    };
  }
}

/**
 * Get default download path
 */
export async function getDefaultDownloadPath(): Promise<ApiResponse<string>> {
  try {
    const result = await window.ipc.invoke("download:get-default-path", null);
    return result as ApiResponse<string>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get download path",
    };
  }
}

/**
 * Get download sub-path for specific type
 */
export async function getDownloadSubPath(
  type:
    | "videos"
    | "audios"
    | "playlists"
    | "others"
    | "programs"
    | "compressed"
    | "documents",
): Promise<ApiResponse<string>> {
  try {
    const result = await window.ipc.invoke("download:get-sub-path", type);
    return result as ApiResponse<string>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get download sub-path",
    };
  }
}

/**
 * Detect link type (direct download vs video)
 */
export async function detectLinkType(
  url: string,
  mode: DetectionMode = "auto",
): Promise<ApiResponse<LinkTypeResult>> {
  try {
    const result = await window.ipc.invoke(
      DownloadIpcChannels.DETECT_LINK_TYPE,
      { url, mode },
    );
    return result as ApiResponse<LinkTypeResult>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to detect link type",
    };
  }
}

/**
 * Start a direct download (using aria2)
 */
export async function startDirectDownload(
  options: DownloadOptions,
): Promise<ApiResponse<DownloadItem>> {
  try {
    const result = await window.ipc.invoke(
      DownloadIpcChannels.START_DIRECT_DOWNLOAD,
      options,
    );
    return result as ApiResponse<DownloadItem>;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to start direct download",
    };
  }
}

/**
 * Ensure yt-dlp binary is available
 */
export async function ensureBinary(): Promise<
  ApiResponse<{ path: string; version: string | null }>
> {
  try {
    const result = await window.ipc.invoke("download:ensure-binary", null);
    return result as ApiResponse<{ path: string; version: string | null }>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to ensure binary",
    };
  }
}

/**
 * Hook for managing downloads with real-time updates
 */
export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial downloads
  useEffect(() => {
    const loadDownloads = async () => {
      setIsLoading(true);
      const result = await getAllDownloads();
      if (result.success && result.data) {
        setDownloads(result.data);
      } else {
        setError(result.error || "Failed to load downloads");
      }
      setIsLoading(false);
    };

    loadDownloads();
  }, []);

  // Subscribe to download events
  useEffect(() => {
    const unsubProgress = window.ipc.on(
      DownloadIpcChannels.DOWNLOAD_PROGRESS,
      (progress) => {
        const prog = progress as DownloadProgress;
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === prog.downloadId
              ? { ...d, progress: prog, status: prog.status }
              : d,
          ),
        );
      },
    );

    const unsubComplete = window.ipc.on(
      DownloadIpcChannels.DOWNLOAD_COMPLETE,
      (item) => {
        const downloadItem = item as DownloadItem;
        setDownloads((prev) =>
          prev.map((d) => (d.id === downloadItem.id ? downloadItem : d)),
        );
      },
    );

    const unsubError = window.ipc.on(
      DownloadIpcChannels.DOWNLOAD_ERROR,
      (data) => {
        const { item } = data as { item: DownloadItem; error: string };
        setDownloads((prev) => prev.map((d) => (d.id === item.id ? item : d)));
      },
    );

    const unsubStatusChanged = window.ipc.on(
      DownloadIpcChannels.DOWNLOAD_STATUS_CHANGED,
      (item) => {
        const downloadItem = item as DownloadItem;
        setDownloads((prev) => {
          const exists = prev.find((d) => d.id === downloadItem.id);
          if (exists) {
            return prev.map((d) =>
              d.id === downloadItem.id ? downloadItem : d,
            );
          }
          return [...prev, downloadItem];
        });
      },
    );

    const unsubRemoved = window.ipc.on(
      DownloadIpcChannels.DOWNLOAD_REMOVED,
      (downloadId) => {
        setDownloads((prev) => prev.filter((d) => d.id !== downloadId));
      },
    );

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
      unsubStatusChanged();
      unsubRemoved();
    };
  }, []);

  // Actions
  const addDownload = useCallback(
    async (videoInfo: VideoInfo | null, options: DownloadOptions) => {
      const result = await startDownload(videoInfo, options);
      if (result.success && result.data) {
        const newData = result.data;
        if (Array.isArray(newData)) {
          setDownloads((prev) => [...prev, ...newData]);
        } else {
          setDownloads((prev) => [...prev, newData]);
        }
      }
      return result;
    },
    [],
  );

  const pause = useCallback(async (downloadId: string) => {
    return pauseDownload(downloadId);
  }, []);

  const resume = useCallback(async (downloadId: string) => {
    return resumeDownload(downloadId);
  }, []);

  const cancel = useCallback(async (downloadId: string) => {
    return cancelDownload(downloadId);
  }, []);

  const clearCompleted = useCallback(async () => {
    const result = await clearCompletedDownloads();
    if (result.success) {
      setDownloads((prev) =>
        prev.filter(
          (d) =>
            d.status !== DownloadStatus.COMPLETED &&
            d.status !== DownloadStatus.CANCELLED &&
            d.status !== DownloadStatus.FAILED,
        ),
      );
    }
    return result;
  }, []);

  const openLocation = useCallback(async (path: string) => {
    return openFileLocation(path);
  }, []);

  const executeFile = useCallback(async (path: string) => {
    return openFile(path);
  }, []);

  // Derived state
  const activeDownloads = downloads.filter(
    (d) =>
      d.status === DownloadStatus.DOWNLOADING ||
      d.status === DownloadStatus.PENDING,
  );
  const completedDownloads = downloads.filter(
    (d) => d.status === DownloadStatus.COMPLETED,
  );
  const failedDownloads = downloads.filter(
    (d) => d.status === DownloadStatus.FAILED,
  );

  return {
    downloads,
    activeDownloads,
    completedDownloads,
    failedDownloads,
    isLoading,
    error,
    addDownload,
    pause,
    resume,
    cancel,
    clearCompleted,
    openLocation,
    executeFile,
  };
}

/**
 * Hook for extracting video info
 */
export function useVideoInfo() {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);
    setVideoInfo(null);

    const result = await extractVideoInfo(url);

    if (result.success && result.data) {
      setVideoInfo(result.data);
    } else {
      setError(result.error || "Failed to extract video info");
    }

    setIsLoading(false);
    return result;
  }, []);

  const reset = useCallback(() => {
    setVideoInfo(null);
    setError(null);
  }, []);

  return {
    videoInfo,
    setVideoInfo,
    isLoading,
    setIsLoading,
    error,
    extract,
    reset,
    setError,
  };
}

/**
 * Hook for video actions
 */
export function useVideoActions() {
  const getInfo = useCallback(async (url: string) => {
    return extractVideoInfo(url);
  }, []);

  const start = useCallback(
    async (videoInfo: VideoInfo | null, options: DownloadOptions) => {
      return startDownload(videoInfo, options);
    },
    [],
  );

  const startDirect = useCallback(async (options: DownloadOptions) => {
    return startDirectDownload(options);
  }, []);

  const detect = useCallback(async (url: string) => {
    return detectLinkType(url);
  }, []);

  return {
    extractVideoInfo: getInfo,
    startDownload: start,
    startDirectDownload: startDirect,
    detectLinkType: detect,
  };
}

// Re-export types
export type {
  VideoInfo,
  DownloadOptions,
  DownloadItem,
  DownloadProgress,
  LinkTypeResult,
};
export { DownloadStatus, DownloadQuality };
