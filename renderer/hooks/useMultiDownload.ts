import { useState } from "react";
import {
  extractVideoInfo,
  startDownload,
  DownloadQuality,
} from "./useDownload";

export interface QueueItemData {
  id: string;
  url: string;
  status: "pending" | "processing" | "added" | "error";
  title?: string;
  error?: string;
}

export const useMultiDownload = () => {
  const [urls, setUrls] = useState("");
  const [parsedItems, setParsedItems] = useState<QueueItemData[]>([]);

  const handleParse = () => {
    const lines = urls.split("\n").filter((line) => line.trim() !== "");
    const newItems: QueueItemData[] = lines.map((line) => ({
      id: Math.random().toString(36).substr(2, 9),
      url: line.trim(),
      status: "pending",
    }));
    setParsedItems((prev) => [...prev, ...newItems]);
    setUrls(""); // Clear input after adding
  };

  const clearAll = () => {
    setUrls("");
    setParsedItems([]);
  };

  const handleRemoveItem = (index: number) => {
    setParsedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItemStatus = (id: string, updates: Partial<QueueItemData>) => {
    setParsedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const startAllDownloads = async () => {
    const pendingItems = parsedItems.filter(
      (item) => item.status === "pending" || item.status === "error"
    );

    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      // 1. Update status to processing
      updateItemStatus(item.id, { status: "processing", error: undefined });

      try {
        // 2. Extract Info
        const infoResult = await extractVideoInfo(item.url);

        if (!infoResult.success || !infoResult.data) {
          updateItemStatus(item.id, {
            status: "error",
            error: infoResult.error || "Failed to extract info",
          });
          continue;
        }

        const videoInfo = infoResult.data;
        updateItemStatus(item.id, { title: videoInfo.title });

        // 3. Start Download (Default to Best Quality)
        const downloadResult = await startDownload(videoInfo, {
          url: item.url,
          outputPath: "", // Default path
          quality: DownloadQuality.BEST,
          format: "mp4", // Default format
          audioOnly: false,
        });

        if (downloadResult.success) {
          updateItemStatus(item.id, { status: "added" });
        } else {
          updateItemStatus(item.id, {
            status: "error",
            error: downloadResult.error || "Failed to start download",
          });
        }
      } catch (err) {
        updateItemStatus(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  };

  return {
    urls,
    setUrls,
    parsedItems,
    handleParse,
    clearAll,
    handleRemoveItem,
    startAllDownloads,
  };
};
