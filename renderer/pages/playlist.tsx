import { useState, useMemo, useEffect } from "react";
import {
  PlaylistHeader,
  UrlInputCard,
  PlaylistToolbar,
  PlaylistVideoList,
  PlaylistFooter,
} from "../components/screens/Playlists";
import {
  useVideoInfo,
  useDownloads,
  getDownloadSubPath,
} from "../hooks/useDownload";
import { detectPlatform } from "../utils/formatters";
import { DownloadQuality } from "../types/download";
import { useRouter } from "next/router";

const PlaylistPage = () => {
  const [url, setUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<string>(
    DownloadQuality.QUALITY_1080P
  );
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);

  const { videoInfo, isLoading: isFetching, error, extract } = useVideoInfo();
  const { addDownload } = useDownloads();
  const router = useRouter();

  const playlistItems = videoInfo?.playlist?.videos || [];
  const platform = useMemo(() => detectPlatform(url), [url]);

  const filteredItems = useMemo(() => {
    return playlistItems.filter((item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [playlistItems, searchQuery]);

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
      selected.includes(id)
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
      selected.includes(v.id)
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

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex flex-col gap-6 mb-6">
        <PlaylistHeader />
        <UrlInputCard
          url={url}
          onUrlChange={setUrl}
          onFetch={handleFetch}
          isLoading={isFetching}
          platform={platform}
          onKeyPress={handleKeyPress}
        />
      </div>

      {error && (
        <div className="p-4 mb-6 bg-danger-50 text-danger rounded-xl border border-danger-100">
          {error}
        </div>
      )}

      {videoInfo && videoInfo.playlist && (
        <div className="flex-1 min-h-0 flex flex-col gap-4 animate-appearance-in">
          <PlaylistToolbar
            selectedCount={
              selected.filter((id) => playlistItems.find((i) => i.id === id))
                .length
            }
            totalCount={playlistItems.length}
            onToggleSelectAll={toggleSelectAll}
            isAllSelected={
              filteredItems.length > 0 &&
              filteredItems.every((i) => selected.includes(i.id))
            }
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          <PlaylistVideoList
            items={filteredItems}
            selectedItems={selected}
            onToggleItem={toggleSelect}
          />

          <PlaylistFooter
            selectedCount={selected.length}
            onDownload={handleDownloadSelected}
            isLoading={isBulkDownloading}
            selectedQuality={selectedQuality}
            onQualityChange={setSelectedQuality}
          />
        </div>
      )}

      {videoInfo && !videoInfo.playlist && !isFetching && (
        <div className="text-center py-12 text-default-500">
          This URL doesn't seem to be a playlist or doesn't have any items.
        </div>
      )}
    </div>
  );
};

export default PlaylistPage;
