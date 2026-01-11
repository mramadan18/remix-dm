import {
  PlaylistHeader,
  UrlInputCard,
  PlaylistToolbar,
  PlaylistVideoList,
  PlaylistFooter,
} from "../components/screens/Playlists";
import { usePlaylistDownload } from "../hooks/usePlaylistDownload";

const PlaylistPage = () => {
  const {
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
    selectedCount,
    totalCount,
    setUrl,
    setSearchQuery,
    setSelectedQuality,
    handleFetch,
    handleKeyPress,
    toggleSelect,
    toggleSelectAll,
    handleDownloadSelected,
  } = usePlaylistDownload();

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
            selectedCount={selectedCount}
            totalCount={totalCount}
            onToggleSelectAll={toggleSelectAll}
            isAllSelected={isAllSelected}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          <PlaylistVideoList
            items={filteredItems}
            selectedItems={selected}
            onToggleItem={toggleSelect}
          />

          <PlaylistFooter
            selectedCount={selectedCount}
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
