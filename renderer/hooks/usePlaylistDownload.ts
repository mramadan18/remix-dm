import { useState, useMemo } from "react";
import { useRouter } from "next/router";
import { useVideoInfo, useDownloads, getDownloadSubPath } from "./useDownload";
import { detectPlatform } from "../utils/formatters";
import { DownloadQuality } from "../types/download";

export interface UsePlaylistDownloadReturn {
  // State
  url: string;
  searchQuery: string;
  selected: string[];
  selectedQuality: string;
  isBulkDownloading: boolean;

  // Video Info State
  videoInfo: ReturnType<typeof useVideoInfo>["videoInfo"];
  isFetching: boolean;
  error: string | null;

  // Computed
  platform: { name: string; icon: string } | null;
  playlistItems: any[];
  filteredItems: any[];
  isAllSelected: boolean;
  selectedCount: number;
  totalCount: number;

  // Handlers
  setUrl: (url: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedQuality: (quality: string) => void;
  handleFetch: () => Promise<void>;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  handleDownloadSelected: () => Promise<void>;
}

export const usePlaylistDownload = (): UsePlaylistDownloadReturn => {
  const [url, setUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<string>(
    DownloadQuality.QUALITY_1080P,
  );
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);

  const { videoInfo, isLoading: isFetching, error, extract } = useVideoInfo();
  const { addDownload } = useDownloads();
  const router = useRouter();

  const playlistItems = videoInfo?.playlist?.videos || [];

  const platform = useMemo(() => detectPlatform(url), [url]);

  const filteredItems = useMemo(() => {
    return playlistItems.filter((item) =>
      item?.title?.toLowerCase()?.includes(searchQuery?.toLowerCase() || ""),
    );
  }, [playlistItems, searchQuery]);

  const isAllSelected = useMemo(() => {
    return (
      filteredItems.length > 0 &&
      filteredItems.every((i) => selected.includes(i.id))
    );
  }, [filteredItems, selected]);

  const handleFetch = async () => {
    if (!url) return;
    const result = await extract(url);
    if (result.success && result.data?.playlist) {
      // Select all by default
      setSelected(result.data.playlist.videos.map((i) => i.id));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleFetch();
    }
  };

  const toggleSelect = (id: string) => {
    if (selected.includes(id)) {
      setSelected(selected.filter((i) => i !== id));
    } else {
      setSelected([...selected, id]);
    }
  };

  const toggleSelectAll = () => {
    const filteredIds = filteredItems.map((i) => i.id);
    const areAllFilteredSelected = filteredIds.every((id) =>
      selected.includes(id),
    );

    if (areAllFilteredSelected) {
      setSelected(selected.filter((id) => !filteredIds.includes(id)));
    } else {
      const newSelected = [...new Set([...selected, ...filteredIds])];
      setSelected(newSelected);
    }
  };

  const handleDownloadSelected = async () => {
    if (selected.length === 0) return;

    setIsBulkDownloading(true);

    const videosToDownload = playlistItems.filter((v) =>
      selected.includes(v.id),
    );

    // Get the base playlists directory
    const playlistsPathRes = await getDownloadSubPath("playlists");
    let playlistPath = playlistsPathRes.success ? playlistsPathRes.data! : "";

    // Add a subfolder with the playlist name
    if (videoInfo?.playlist?.title && playlistPath) {
      const cleanTitle = videoInfo.playlist.title
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .trim();
      playlistPath = `${playlistPath}/${cleanTitle}`;
    }

    // Add each video to the queue
    for (const video of videosToDownload) {
      // Create a minimal videoInfo object so the UI has a title and thumbnail
      const minimalVideoInfo = {
        id: video.id,
        title: video.title,
        thumbnail: video.thumbnail,
        url: video.url,
        webpage_url: video.url,
        duration: video.duration,
      } as any;

      await addDownload(minimalVideoInfo, {
        url: video.url,
        quality: selectedQuality,
        audioOnly: selectedQuality === DownloadQuality.AUDIO_ONLY,
        format: selectedQuality === DownloadQuality.AUDIO_ONLY ? "mp3" : "mp4",
        outputPath: playlistPath,
      });
    }

    setIsBulkDownloading(false);
    router.push("/downloads");
  };

  return {
    url,
    searchQuery,
    selected,
    selectedQuality,
    isBulkDownloading,
    videoInfo,
    isFetching,
    error,
    platform,
    playlistItems,
    filteredItems,
    isAllSelected,
    selectedCount: selected.length,
    totalCount: playlistItems.length,
    setUrl,
    setSearchQuery,
    setSelectedQuality,
    handleFetch,
    handleKeyPress,
    toggleSelect,
    toggleSelectAll,
    handleDownloadSelected,
  };
};
