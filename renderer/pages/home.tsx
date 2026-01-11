import { AnimatePresence } from "framer-motion";
import { useSingleDownload } from "../hooks/useSingleDownload";
import {
  StatusMessage,
  VideoInfoCard,
  SupportedPlatforms,
  UrlInputCard,
} from "../components/screens/SingleDownload";

const HomePage = () => {
  const {
    // State
    url,
    selectedQuality,
    selectedFormat,
    isDownloading,
    downloadStatus,

    // Video info state
    videoInfo,
    isLoading,
    error,

    // Computed values
    platform,
    currentFormats,
    availableQualities,

    // Handlers
    handleUrlChange,
    handleFetch,
    handleKeyPress,
    handleDownload,
    handleClear,
    setSelectedQuality,
    setSelectedFormat,
  } = useSingleDownload();

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-5xl font-black pb-2 leading-tight bg-linear-to-r from-violet-600 via-fuchsia-500 to-emerald-500 bg-clip-text text-transparent inline-block tracking-tight">
          Single Video Download
        </h1>
        <p className="text-default-500 max-w-md mx-auto">
          Paste any video link to start downloading. Supports YouTube, TikTok,
          Instagram, Twitter, and 1000+ more sites.
        </p>
      </div>

      {/* URL Input Card */}
      <UrlInputCard
        url={url}
        isLoading={isLoading}
        platform={platform}
        onUrlChange={handleUrlChange}
        onFetch={handleFetch}
        onKeyPress={handleKeyPress}
      />

      {/* Error Message */}
      <AnimatePresence>
        {error && <StatusMessage message={error} type="error" />}
      </AnimatePresence>

      {/* Download Status */}
      <AnimatePresence>
        {downloadStatus && (
          <StatusMessage
            message={downloadStatus}
            type={downloadStatus.includes("Error") ? "error" : "success"}
          />
        )}
      </AnimatePresence>

      {/* Video Info Card */}
      <AnimatePresence>
        {videoInfo && (
          <VideoInfoCard
            selectedQuality={selectedQuality}
            selectedFormat={selectedFormat}
            isDownloading={isDownloading}
            videoInfo={videoInfo}
            currentFormats={currentFormats}
            availableQualities={availableQualities}
            onDownload={handleDownload}
            onClear={handleClear}
            onQualityChange={setSelectedQuality}
            onFormatChange={setSelectedFormat}
          />
        )}
      </AnimatePresence>

      {/* Supported Platforms Info */}
      {!videoInfo && !isLoading && !error && <SupportedPlatforms />}
    </div>
  );
};

export default HomePage;
