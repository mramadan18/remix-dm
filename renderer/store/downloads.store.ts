/**
 * Downloads Store
 * Global state management for downloads using Zustand
 */

import { create } from "zustand";
import {
  DownloadItem,
  DownloadStatus,
  DownloadProgress,
  DownloadIpcChannels,
} from "../types/download";

interface DownloadsState {
  // State
  downloads: DownloadItem[];
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  // Derived (computed on access)
  getActiveDownloads: () => DownloadItem[];
  getCompletedDownloads: () => DownloadItem[];
  getFailedDownloads: () => DownloadItem[];
  getActiveCount: () => number;

  // Actions
  setDownloads: (downloads: DownloadItem[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateDownloadProgress: (progress: DownloadProgress) => void;
  addOrUpdateDownload: (item: DownloadItem) => void;
  removeDownload: (id: string) => void;
  clearFinishedDownloads: () => void;

  // Initialization
  initializeListeners: () => () => void;
}

export const useDownloadStore = create<DownloadsState>((set, get) => ({
  // Initial state
  downloads: [],
  isLoading: true,
  error: null,
  isInitialized: false,

  // Derived getters
  getActiveDownloads: () => {
    const { downloads } = get();
    return downloads.filter(
      (d) =>
        d.status === DownloadStatus.DOWNLOADING ||
        d.status === DownloadStatus.PENDING,
    );
  },

  getCompletedDownloads: () => {
    const { downloads } = get();
    return downloads.filter((d) => d.status === DownloadStatus.COMPLETED);
  },

  getFailedDownloads: () => {
    const { downloads } = get();
    return downloads.filter((d) => d.status === DownloadStatus.FAILED);
  },

  getActiveCount: () => {
    const { downloads } = get();
    return downloads.filter(
      (d) =>
        d.status === DownloadStatus.DOWNLOADING ||
        d.status === DownloadStatus.PENDING,
    ).length;
  },

  // Actions
  setDownloads: (downloads) => set({ downloads }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  updateDownloadProgress: (prog) => {
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === prog.downloadId
          ? { ...d, progress: prog, status: prog.status }
          : d,
      ),
    }));
  },

  addOrUpdateDownload: (item) => {
    set((state) => {
      const exists = state.downloads.find((d) => d.id === item.id);
      if (exists) {
        return {
          downloads: state.downloads.map((d) => (d.id === item.id ? item : d)),
        };
      }
      return { downloads: [...state.downloads, item] };
    });
  },

  removeDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.filter((d) => d.id !== id),
    }));
  },

  clearFinishedDownloads: () => {
    set((state) => ({
      downloads: state.downloads.filter(
        (d) =>
          d.status !== DownloadStatus.COMPLETED &&
          d.status !== DownloadStatus.CANCELLED &&
          d.status !== DownloadStatus.FAILED,
      ),
    }));
  },

  // Initialize IPC listeners - call once at app start
  initializeListeners: () => {
    const { isInitialized } = get();

    // Prevent double initialization
    if (isInitialized) {
      return () => {};
    }

    set({ isInitialized: true });

    // Load initial downloads
    window.ipc
      .invoke(DownloadIpcChannels.GET_ALL_DOWNLOADS, null)
      .then((result: any) => {
        if (result.success && result.data) {
          set({ downloads: result.data, isLoading: false });
        } else {
          set({
            error: result.error || "Failed to load downloads",
            isLoading: false,
          });
        }
      })
      .catch((err: Error) => {
        set({ error: err.message, isLoading: false });
      });

    // Subscribe to IPC events
    const unsubProgress = window.ipc.on(
      DownloadIpcChannels.DOWNLOAD_PROGRESS,
      (progress) => {
        get().updateDownloadProgress(progress as DownloadProgress);
      },
    );

    const unsubComplete = window.ipc.on(
      DownloadIpcChannels.DOWNLOAD_COMPLETE,
      (item) => {
        get().addOrUpdateDownload(item as DownloadItem);
      },
    );

    const unsubError = window.ipc.on(
      DownloadIpcChannels.DOWNLOAD_ERROR,
      (data) => {
        const { item } = data as { item: DownloadItem; error: string };
        get().addOrUpdateDownload(item);
      },
    );

    const unsubStatusChanged = window.ipc.on(
      DownloadIpcChannels.DOWNLOAD_STATUS_CHANGED,
      (item) => {
        get().addOrUpdateDownload(item as DownloadItem);
      },
    );

    const unsubRemoved = window.ipc.on(
      DownloadIpcChannels.DOWNLOAD_REMOVED,
      (downloadId) => {
        get().removeDownload(downloadId as string);
      },
    );

    // Return cleanup function
    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
      unsubStatusChanged();
      unsubRemoved();
      set({ isInitialized: false });
    };
  },
}));

// Selector hooks for optimized re-renders
export const useActiveCount = () =>
  useDownloadStore((state) => state.getActiveCount());

export const useDownloads = () => useDownloadStore((state) => state.downloads);

export const useDownloadsLoading = () =>
  useDownloadStore((state) => state.isLoading);

export const useDownloadsError = () => useDownloadStore((state) => state.error);
