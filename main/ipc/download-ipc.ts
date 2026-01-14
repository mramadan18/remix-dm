/**
 * Download IPC Handler
 * Handles IPC communication for download operations between main and renderer
 */

import { ipcMain, BrowserWindow } from "electron";
import {
  DownloadIpcChannels,
  VideoInfo,
  DownloadOptions,
  DownloadItem,
  DownloadProgress,
  ApiResponse,
  DetectionMode,
} from "../services/downloader/types";
import {
  extractVideoInfo,
  extractPlaylistInfo,
  detectPlatform,
  isUrlSupported,
} from "../services/downloader/video/video-info.service";
import { videoDownloader } from "../services/downloader/video/video-download.service";
import {
  directDownloader,
  detectLinkType,
  LinkTypeResult,
} from "../services/downloader/direct";
import {
  ensureYtDlp,
  getBinaryInfo,
  updateYtDlp,
} from "../services/utils/binary-manager";
import {
  getDefaultDownloadPath,
  getDownloadSubPath,
} from "../services/utils/file-utils";

/**
 * Get the main window for sending events
 */
function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

/**
 * Send event to renderer
 */
function sendToRenderer(channel: string, data: unknown): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Initialize Download IPC Handlers
 */
export function initializeDownloadIpc(): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEO INFO HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract video information from URL
   */
  ipcMain.handle(
    DownloadIpcChannels.EXTRACT_VIDEO_INFO,
    async (_, url: string): Promise<ApiResponse<VideoInfo>> => {
      try {
        const result = await videoDownloader.getVideoMetadata(url);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Check if URL is supported
   */
  ipcMain.handle(
    "download:check-url",
    async (
      _,
      url: string
    ): Promise<
      ApiResponse<{ supported: boolean; platform: string | null }>
    > => {
      try {
        const platform = detectPlatform(url);
        const supported = await isUrlSupported(url);
        return {
          success: true,
          data: {
            supported,
            platform: platform?.name || null,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNLOAD HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a new download
   */
  ipcMain.handle(
    DownloadIpcChannels.START_DOWNLOAD,
    async (
      _,
      payload: { videoInfo: VideoInfo | null; options: DownloadOptions }
    ): Promise<ApiResponse<DownloadItem>> => {
      try {
        const { videoInfo, options } = payload;
        const result = await videoDownloader.startDownload(videoInfo, options);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Pause a download
   */
  ipcMain.handle(
    DownloadIpcChannels.PAUSE_DOWNLOAD,
    async (_, downloadId: string): Promise<ApiResponse<boolean>> => {
      try {
        // Try video downloader first
        let success = videoDownloader.pauseDownload(downloadId);

        // If not found or failed, try direct downloader
        if (!success) {
          success = await directDownloader.pauseDownload(downloadId);
        }

        return { success, data: success };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Resume a download
   */
  ipcMain.handle(
    DownloadIpcChannels.RESUME_DOWNLOAD,
    async (_, downloadId: string): Promise<ApiResponse<boolean>> => {
      try {
        // Try video downloader first
        let success = videoDownloader.resumeDownload(downloadId);

        // If not found or failed, try direct downloader
        if (!success) {
          success = await directDownloader.resumeDownload(downloadId);
        }

        return { success, data: success };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Cancel a download
   */
  ipcMain.handle(
    DownloadIpcChannels.CANCEL_DOWNLOAD,
    async (_, downloadId: string): Promise<ApiResponse<boolean>> => {
      try {
        // Try video downloader first
        let success = await videoDownloader.cancelDownload(downloadId);

        // If not found or failed, try direct downloader
        if (!success) {
          success = await directDownloader.cancelDownload(downloadId);
        }

        return { success, data: success };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Get download status
   */
  ipcMain.handle(
    DownloadIpcChannels.GET_DOWNLOAD_STATUS,
    async (
      _,
      downloadId: string
    ): Promise<ApiResponse<DownloadItem | null>> => {
      try {
        // Check video downloads
        let item = videoDownloader.getDownloadStatus(downloadId);

        // If not found, check direct downloads
        if (!item) {
          item = directDownloader.getDownloadStatus(downloadId);
        }

        return { success: true, data: item };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Get all downloads
   */
  ipcMain.handle(
    DownloadIpcChannels.GET_ALL_DOWNLOADS,
    async (): Promise<ApiResponse<DownloadItem[]>> => {
      try {
        const videoItems = videoDownloader.getAllDownloads();
        const directItems = directDownloader.getAllDownloads();

        // Combine all items and sort by creation date (descending)
        const allItems = [...videoItems, ...directItems].sort((a, b) => {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });

        return { success: true, data: allItems };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Clear completed downloads
   */
  ipcMain.handle(
    DownloadIpcChannels.CLEAR_COMPLETED,
    async (): Promise<ApiResponse<number>> => {
      try {
        const videoCount = videoDownloader.clearCompleted();
        const directCount = await directDownloader.clearCompleted();
        return { success: true, data: videoCount + directCount };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // BINARY MANAGEMENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get yt-dlp binary info
   */
  ipcMain.handle(
    "download:get-binary-info",
    async (): Promise<
      ApiResponse<{
        path: string;
        version: string | null;
        lastUpdated: Date | null;
      }>
    > => {
      try {
        const info = await getBinaryInfo();
        return { success: true, data: info };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Ensure yt-dlp is installed
   */
  ipcMain.handle(
    "download:ensure-binary",
    async (): Promise<
      ApiResponse<{ path: string; version: string | null }>
    > => {
      try {
        await ensureYtDlp();
        const info = await getBinaryInfo();
        return {
          success: true,
          data: { path: info.path, version: info.version },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Update yt-dlp
   */
  ipcMain.handle(
    "download:update-binary",
    async (): Promise<
      ApiResponse<{ path: string; version: string | null }>
    > => {
      try {
        await updateYtDlp();
        const info = await getBinaryInfo();
        return {
          success: true,
          data: { path: info.path, version: info.version },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get default download path
   */
  ipcMain.handle(
    "download:get-default-path",
    async (): Promise<ApiResponse<string>> => {
      try {
        const path = getDefaultDownloadPath();
        return { success: true, data: path };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Get download sub-path for specific type
   */
  ipcMain.handle(
    "download:get-sub-path",
    async (
      _,
      type:
        | "videos"
        | "audios"
        | "playlists"
        | "others"
        | "programs"
        | "compressed"
        | "documents"
    ): Promise<ApiResponse<string>> => {
      try {
        const path = getDownloadSubPath(type);
        return { success: true, data: path };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECT DOWNLOAD HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect link type (direct download vs video)
   */
  ipcMain.handle(
    DownloadIpcChannels.DETECT_LINK_TYPE,
    async (
      _,
      payload: { url: string; mode?: DetectionMode } | string
    ): Promise<ApiResponse<LinkTypeResult>> => {
      try {
        const url = typeof payload === "string" ? payload : payload.url;
        const mode = typeof payload === "string" ? "auto" : payload.mode;
        const result = await detectLinkType(url, mode);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Start a direct download (using aria2)
   */
  ipcMain.handle(
    DownloadIpcChannels.START_DIRECT_DOWNLOAD,
    async (_, options: DownloadOptions): Promise<ApiResponse<DownloadItem>> => {
      try {
        const result = await directDownloader.startDownload(options);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Pause a direct download
   */
  ipcMain.handle(
    "download:pause-direct",
    async (_, downloadId: string): Promise<ApiResponse<boolean>> => {
      try {
        const success = await directDownloader.pauseDownload(downloadId);
        return { success, data: success };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Resume a direct download
   */
  ipcMain.handle(
    "download:resume-direct",
    async (_, downloadId: string): Promise<ApiResponse<boolean>> => {
      try {
        const success = await directDownloader.resumeDownload(downloadId);
        return { success, data: success };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Cancel a direct download
   */
  ipcMain.handle(
    "download:cancel-direct",
    async (_, downloadId: string): Promise<ApiResponse<boolean>> => {
      try {
        const success = await directDownloader.cancelDownload(downloadId);
        return { success, data: success };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * Get all direct downloads
   */
  ipcMain.handle(
    "download:get-all-direct",
    async (): Promise<ApiResponse<DownloadItem[]>> => {
      try {
        const items = directDownloader.getAllDownloads();
        return { success: true, data: items };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT FORWARDING
  // ═══════════════════════════════════════════════════════════════════════════

  // Forward video download events to renderer
  videoDownloader.on("progress", (progress: DownloadProgress) => {
    sendToRenderer(DownloadIpcChannels.DOWNLOAD_PROGRESS, progress);
  });

  videoDownloader.on("complete", (item: DownloadItem) => {
    sendToRenderer(DownloadIpcChannels.DOWNLOAD_COMPLETE, item);
  });

  videoDownloader.on("error", (item: DownloadItem, error: string) => {
    sendToRenderer(DownloadIpcChannels.DOWNLOAD_ERROR, { item, error });
  });

  videoDownloader.on("status-changed", (item: DownloadItem) => {
    sendToRenderer(DownloadIpcChannels.DOWNLOAD_STATUS_CHANGED, item);
  });

  videoDownloader.on("item-removed", (downloadId: string) => {
    sendToRenderer(DownloadIpcChannels.DOWNLOAD_REMOVED, downloadId);
  });

  // Forward direct download events to renderer
  directDownloader.on("progress", (progress: DownloadProgress) => {
    sendToRenderer(DownloadIpcChannels.DOWNLOAD_PROGRESS, progress);
  });

  directDownloader.on("complete", (item: DownloadItem) => {
    sendToRenderer(DownloadIpcChannels.DOWNLOAD_COMPLETE, item);
  });

  directDownloader.on("error", (item: DownloadItem, error: string) => {
    sendToRenderer(DownloadIpcChannels.DOWNLOAD_ERROR, { item, error });
  });

  directDownloader.on("status-changed", (item: DownloadItem) => {
    sendToRenderer(DownloadIpcChannels.DOWNLOAD_STATUS_CHANGED, item);
  });

  directDownloader.on("item-removed", (downloadId: string) => {
    sendToRenderer(DownloadIpcChannels.DOWNLOAD_REMOVED, downloadId);
  });

  console.log("Download IPC handlers initialized");
}
