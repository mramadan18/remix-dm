import { useState } from "react";
import {
  extractVideoInfo,
  startDownload,
  startDirectDownload,
  detectLinkType,
  DownloadQuality,
} from "./useDownload";
import { getFilenameFromUrl } from "../utils/formatters";

export interface QueueItemData {
  id: string;
  url: string;
  status: "pending" | "processing" | "added" | "error";
  title?: string;
  size?: number; // حجم الملف بالبايت
  error?: string;
  type?: "video" | "direct"; // نوع التحميل
}

export const useMultiDownload = () => {
  const [urls, setUrls] = useState("");
  const [parsedItems, setParsedItems] = useState<QueueItemData[]>([]);

  const handleParse = async () => {
    const lines = urls.split("\n").filter((line) => line.trim() !== "");
    const newItems: QueueItemData[] = lines.map((line) => {
      const url = line.trim();
      return {
        id: Math.random().toString(36).substr(2, 9),
        url,
        title: getFilenameFromUrl(url) || undefined,
        status: "pending",
      };
    });

    setParsedItems((prev) => [...prev, ...newItems]);
    setUrls(""); // مسح المدخلات

    // بدء فحص الروابط المضافة في الخلفية
    for (const item of newItems) {
      processItemInfo(item.id, item.url);
    }
  };

  const processItemInfo = async (id: string, url: string) => {
    updateItemStatus(id, { status: "processing" });
    try {
      const result = await detectLinkType(url, "direct");
      if (result.success && result.data) {
        const data = result.data;
        updateItemStatus(id, {
          status: "pending", // عودة للحالة الجاهزة ولكن مع بيانات
          title: data.filename || undefined,
          size: data.contentLength,
          type: data.isDirect ? "direct" : "video",
        });
      } else {
        updateItemStatus(id, { status: "pending" }); // فشل الفحص لا يعني فشل التحميل مستقبلاً
      }
    } catch (err) {
      updateItemStatus(id, { status: "pending" });
    }
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
        // 2. Detect link type using HEAD request (Force direct mode)
        const linkTypeResult = await detectLinkType(item.url, "direct");
        const isDirect =
          linkTypeResult.success && linkTypeResult.data?.isDirect;

        if (isDirect) {
          // 3a. Direct download using aria2
          updateItemStatus(item.id, {
            title: linkTypeResult.data?.filename || "Direct Download",
            type: "direct",
          });

          const downloadResult = await startDirectDownload({
            url: item.url,
            outputPath: "", // Default path (will use "direct" folder)
            quality: DownloadQuality.BEST, // Not used for direct downloads
            filename: linkTypeResult.data?.filename,
          });

          if (downloadResult.success) {
            updateItemStatus(item.id, { status: "added" });
          } else {
            updateItemStatus(item.id, {
              status: "error",
              error: downloadResult.error || "Failed to start direct download",
            });
          }
        } else {
          // Handle cases where it's not direct (e.g., video links)
          const reason = linkTypeResult.data?.reason;
          if (reason === "VIDEO_LINK_IN_DIRECT_MODE") {
            updateItemStatus(item.id, {
              status: "error",
              error:
                "This is a video link. Please use it in the Single Download or Playlist section.",
            });
            continue;
          }

          if (reason === "WEB_PAGE_IN_DIRECT_MODE") {
            updateItemStatus(item.id, {
              status: "error",
              error: "This link leads to a web page and not a direct file.",
            });
            continue;
          }

          // Fallback if autodetection failed but we want to try yt-dlp?
          // The request said: "If he enters the multi-file... it downloads through aria."
          // So we should NOT fallback to yt-dlp here if it's not a direct link.
          updateItemStatus(item.id, {
            status: "error",
            error: "This link is not supported for direct download.",
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
