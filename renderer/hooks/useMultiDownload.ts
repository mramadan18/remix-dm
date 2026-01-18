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
      const result = await detectLinkType(url, "auto");
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
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  };

  const startAllDownloads = async () => {
    const pendingItems = parsedItems.filter(
      (item) => item.status === "pending" || item.status === "error",
    );

    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      // 1. Update status to processing
      updateItemStatus(item.id, { status: "processing", error: undefined });

      let directSuccess = false;

      try {
        // 2. Detect link type using HEAD request (Auto mode is smarter)
        const linkTypeResult = await detectLinkType(item.url, "auto");
        const isDirect =
          linkTypeResult.success && linkTypeResult.data?.isDirect;

        if (isDirect) {
          // 3a. Use Direct download (aria2) for files
          updateItemStatus(item.id, {
            title: linkTypeResult.data?.filename || "Direct Download",
            type: "direct",
          });

          const downloadResult = await startDirectDownload({
            url: item.url,
            outputPath: "", // Default path (will use "direct" folder)
            quality: DownloadQuality.BEST,
            filename: linkTypeResult.data?.filename,
          });

          if (downloadResult.success) {
            updateItemStatus(item.id, { status: "added" });
            directSuccess = true;
          }
        }
      } catch (err) {
        console.warn("Detection failed, trying fallback...", err);
      }

      // 4. Fallback to Video/Generic Download (yt-dlp)
      if (!directSuccess) {
        try {
          updateItemStatus(item.id, {
            type: "video",
          });

          // 4a. Validate/Extract video info first
          const infoResult = await extractVideoInfo(item.url);

          if (infoResult.success && infoResult.data) {
            const videoInfo = infoResult.data;

            // Update queue item with real title
            updateItemStatus(item.id, {
              title: videoInfo.title,
            });

            // 4b. Start download with extracted info
            const downloadResult = await startDownload(videoInfo, {
              url: item.url,
              outputPath: "",
              quality: DownloadQuality.BEST_VIDEO,
              audioOnly: false,
            });

            if (downloadResult.success) {
              updateItemStatus(item.id, { status: "added" });
            } else {
              updateItemStatus(item.id, {
                status: "error",
                error:
                  downloadResult.error ||
                  "Failed to start download after extracting info",
              });
            }
          } else {
            // Extraction failed
            updateItemStatus(item.id, {
              status: "error",
              error: infoResult.error || "Failed to extract video info",
            });
          }
        } catch (err) {
          updateItemStatus(item.id, {
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "Unknown error during fallback",
          });
        }
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
