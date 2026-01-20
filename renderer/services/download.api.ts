import {
  VideoInfo,
  DownloadOptions,
  DownloadItem,
  ApiResponse,
  DownloadIpcChannels,
} from "../types/download";

/**
 * Extract video information from URL
 */
export async function extractVideoInfo(
  url: string,
): Promise<ApiResponse<VideoInfo>> {
  try {
    const result = await (window as any).ipc.invoke(
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
    const result = await (window as any).ipc.invoke(
      DownloadIpcChannels.START_DOWNLOAD,
      {
        videoInfo,
        options,
      },
    );
    return result as ApiResponse<DownloadItem | DownloadItem[]>;
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
  return (window as any).ipc.invoke(
    DownloadIpcChannels.PAUSE_DOWNLOAD,
    downloadId,
  );
}

/**
 * Resume a download
 */
export async function resumeDownload(
  downloadId: string,
): Promise<ApiResponse<boolean>> {
  return (window as any).ipc.invoke(
    DownloadIpcChannels.RESUME_DOWNLOAD,
    downloadId,
  );
}

/**
 * Cancel a download
 */
export async function cancelDownload(
  downloadId: string,
): Promise<ApiResponse<boolean>> {
  return (window as any).ipc.invoke(
    DownloadIpcChannels.CANCEL_DOWNLOAD,
    downloadId,
  );
}

/**
 * Get all downloads
 */
export async function getAllDownloads(): Promise<ApiResponse<DownloadItem[]>> {
  return (window as any).ipc.invoke(DownloadIpcChannels.GET_ALL_DOWNLOADS);
}

/**
 * Clear completed downloads
 */
export async function clearCompletedDownloads(): Promise<ApiResponse<number>> {
  return (window as any).ipc.invoke(DownloadIpcChannels.CLEAR_COMPLETED);
}

/**
 * Open download location in file explorer
 */
export async function openDownloadLocation(filePath: string): Promise<void> {
  return (window as any).ipc.send("shell:open-path", filePath);
}

/**
 * Execute/Open a file
 */
export async function executeFile(filePath: string): Promise<void> {
  return (window as any).ipc.send("shell:execute-file", filePath);
}
