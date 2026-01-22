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
    isDirectDownload,

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
    <div className="w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-5xl font-black pb-2 leading-tight bg-linear-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent inline-block tracking-tight">
          Quick Download
        </h1>
        <p className="text-default-500 max-w-md mx-auto">
          Paste any link to start downloading instantly. Supports Videos, Music,
          Documents and more from 1000+ sites.
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
            isDirectDownload={isDirectDownload}
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
