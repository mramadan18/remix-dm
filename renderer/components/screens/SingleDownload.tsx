import React, { useState, useCallback } from "react";
import {
  Input,
  Button,
  Card,
  CardBody,
  Image,
  Select,
  SelectItem,
  Spacer,
  Spinner,
  Progress,
  Chip,
} from "@heroui/react";
import {
  Link2,
  Download,
  Clock,
  HardDrive,
  FileVideo,
  FileText,
  Music,
  Archive,
  Globe,
  AlertCircle,
  CheckCircle2,
  Pause,
  Play,
  X,
  User,
  Eye,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useVideoInfo,
  extractVideoInfo,
  startDownload,
  DownloadStatus,
  DownloadQuality,
  VideoInfo,
} from "../../hooks/useDownload";
import { PLATFORMS } from "../../types/download";

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number | null): string {
  if (!bytes) return "Unknown";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format duration in seconds to readable string
 */
function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format view count
 */
function formatViewCount(views: number | null): string {
  if (!views) return "N/A";
  if (views >= 1000000) return (views / 1000000).toFixed(1) + "M";
  if (views >= 1000) return (views / 1000).toFixed(1) + "K";
  return views.toString();
}

/**
 * Detect platform from URL
 */
function detectPlatform(url: string): { name: string; icon: string } | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace("www.", "");
    for (const platform of Object.values(PLATFORMS)) {
      if (platform.domains.some((d) => hostname.includes(d))) {
        return { name: platform.name, icon: platform.icon };
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}

// Quality options
const QUALITY_OPTIONS = [
  { key: DownloadQuality.BEST, label: "Best Quality (Auto)" },
  { key: DownloadQuality.QUALITY_4K, label: "4K (2160p)" },
  { key: DownloadQuality.QUALITY_1440P, label: "2K (1440p)" },
  { key: DownloadQuality.QUALITY_1080P, label: "Full HD (1080p)" },
  { key: DownloadQuality.QUALITY_720P, label: "HD (720p)" },
  { key: DownloadQuality.QUALITY_480P, label: "SD (480p)" },
  { key: DownloadQuality.QUALITY_360P, label: "Low (360p)" },
  { key: DownloadQuality.AUDIO_ONLY, label: "Audio Only" },
];

// Format options
const FORMAT_OPTIONS = [
  { key: "mp4", label: "MP4 (Recommended)" },
  { key: "mkv", label: "MKV" },
  { key: "webm", label: "WebM" },
];

const AUDIO_FORMAT_OPTIONS = [
  { key: "mp3", label: "MP3" },
  { key: "m4a", label: "M4A (AAC)" },
  { key: "opus", label: "Opus" },
  { key: "flac", label: "FLAC (Lossless)" },
];

const SingleDownload = () => {
  const [url, setUrl] = useState("");
  const [selectedQuality, setSelectedQuality] = useState(DownloadQuality.BEST);
  const [selectedFormat, setSelectedFormat] = useState("mp4");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  const { videoInfo, isLoading, error, extract, reset } = useVideoInfo();

  // Handle URL input
  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setUrl(value);
      reset();
      setDownloadStatus(null);
    },
    [reset]
  );

  // Handle URL fetch
  const handleFetch = useCallback(async () => {
    if (!url.trim()) return;
    await extract(url.trim());
  }, [url, extract]);

  // Handle key press (Enter to fetch)
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleFetch();
      }
    },
    [handleFetch]
  );

  // Handle download
  const handleDownload = useCallback(async () => {
    if (!url.trim()) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStatus("Starting download...");

    try {
      const isAudioOnly = selectedQuality === DownloadQuality.AUDIO_ONLY;

      const result = await startDownload(videoInfo, {
        url: url.trim(),
        outputPath: "", // Will use default
        quality: selectedQuality,
        format: isAudioOnly ? selectedFormat : selectedFormat,
        audioOnly: isAudioOnly,
      });

      if (result.success) {
        setDownloadStatus(
          "Download started! Check Downloads tab for progress."
        );
      } else {
        setDownloadStatus(`Error: ${result.error}`);
      }
    } catch (err) {
      setDownloadStatus(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setIsDownloading(false);
    }
  }, [url, videoInfo, selectedQuality, selectedFormat]);

  const platform = url ? detectPlatform(url) : null;
  const isAudioOnly = selectedQuality === DownloadQuality.AUDIO_ONLY;
  const currentFormats = isAudioOnly ? AUDIO_FORMAT_OPTIONS : FORMAT_OPTIONS;

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-5xl font-black mb-4 bg-linear-to-r from-violet-600 via-fuchsia-500 to-emerald-500 bg-clip-text text-transparent inline-block tracking-tight">
          Download with JokerDL
        </h1>
        <p className="text-default-500 max-w-md mx-auto">
          Paste any video link to start downloading. Supports YouTube, TikTok,
          Instagram, Twitter, and 1000+ more sites.
        </p>
      </div>

      {/* URL Input Card */}
      <Card className="p-4 mb-8 shadow-xl border-none bg-background/50 backdrop-blur-md">
        <CardBody className="flex flex-row gap-4 items-center">
          <Input
            placeholder="Paste video URL here..."
            value={url}
            onChange={handleUrlChange}
            onKeyDown={handleKeyPress}
            startContent={<Link2 className="text-violet-500" />}
            endContent={
              platform && (
                <Chip size="sm" color="secondary" variant="flat">
                  {platform.name}
                </Chip>
              )
            }
            size="lg"
            className="flex-1"
            classNames={{
              input: "text-lg",
              inputWrapper:
                "h-14 bg-default-100/50 hover:bg-default-200/50 transition-colors",
            }}
          />
          <Button
            size="lg"
            isLoading={isLoading}
            isDisabled={!url.trim() || isLoading}
            onPress={handleFetch}
            className="h-14 px-8 font-bold bg-linear-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
            endContent={!isLoading && <Download size={20} />}
          >
            {isLoading ? "Fetching..." : "Fetch Info"}
          </Button>
        </CardBody>
      </Card>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6"
          >
            <Card className="border-danger/30 bg-danger/10">
              <CardBody className="flex flex-row items-center gap-3 py-3">
                <AlertCircle className="text-danger" size={20} />
                <span className="text-danger">{error}</span>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Download Status */}
      <AnimatePresence>
        {downloadStatus && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6"
          >
            <Card
              className={
                downloadStatus.includes("Error")
                  ? "border-danger/30 bg-danger/10"
                  : "border-success/30 bg-success/10"
              }
            >
              <CardBody className="flex flex-row items-center gap-3 py-3">
                {downloadStatus.includes("Error") ? (
                  <AlertCircle className="text-danger" size={20} />
                ) : (
                  <CheckCircle2 className="text-success" size={20} />
                )}
                <span
                  className={
                    downloadStatus.includes("Error")
                      ? "text-danger"
                      : "text-success"
                  }
                >
                  {downloadStatus}
                </span>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Info Card */}
      <AnimatePresence>
        {videoInfo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-none bg-background/60 dark:bg-default-100/50 backdrop-blur-lg">
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Thumbnail Section */}
                  <div className="md:col-span-1">
                    <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg group bg-default-100">
                      {videoInfo.thumbnail ? (
                        <Image
                          alt="Video Thumbnail"
                          src={videoInfo.thumbnail}
                          classNames={{
                            wrapper: "w-full h-full",
                            img: "object-cover w-full h-full transform transition-transform group-hover:scale-105",
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileVideo size={48} className="text-violet-500" />
                        </div>
                      )}
                      {videoInfo.duration && (
                        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded-md font-medium">
                          {formatDuration(videoInfo.duration)}
                        </div>
                      )}
                      {videoInfo.isLive && (
                        <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1">
                          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                          LIVE
                        </div>
                      )}
                    </div>

                    {/* Uploader info */}
                    {videoInfo.uploader && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-default-500">
                        <User size={14} />
                        <span className="truncate">{videoInfo.uploader}</span>
                      </div>
                    )}
                  </div>

                  {/* Info & Options Section */}
                  <div className="md:col-span-2 flex flex-col justify-between py-2">
                    <div>
                      <h3 className="text-2xl font-bold mb-2 line-clamp-2">
                        {videoInfo.title}
                      </h3>
                      <div className="flex flex-wrap gap-4 text-small text-default-500 mb-6">
                        {videoInfo.duration && (
                          <div className="flex items-center gap-1">
                            <Clock size={16} />
                            <span>{formatDuration(videoInfo.duration)}</span>
                          </div>
                        )}
                        {videoInfo.viewCount && (
                          <div className="flex items-center gap-1">
                            <Eye size={16} />
                            <span>
                              {formatViewCount(videoInfo.viewCount)} views
                            </span>
                          </div>
                        )}
                        {videoInfo.formats.length > 0 && (
                          <div className="flex items-center gap-1">
                            <HardDrive size={16} />
                            <span>
                              {formatBytes(
                                videoInfo.formats[0].filesize ||
                                  videoInfo.formats[0].filesizeApprox
                              )}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-primary font-medium">
                          <Globe size={16} />
                          <span>{videoInfo.extractor || "Direct Link"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quality & Format Selectors */}
                    <div className="grid grid-cols-2 gap-4">
                      <Select
                        label="Quality"
                        selectedKeys={[selectedQuality]}
                        onSelectionChange={(keys) => {
                          const value = Array.from(keys)[0] as DownloadQuality;
                          setSelectedQuality(value);
                          // Reset format when switching to/from audio
                          if (value === DownloadQuality.AUDIO_ONLY) {
                            setSelectedFormat("mp3");
                          } else {
                            setSelectedFormat("mp4");
                          }
                        }}
                        size="sm"
                        variant="bordered"
                      >
                        {QUALITY_OPTIONS.map((q) => (
                          <SelectItem key={q.key} className="text-foreground">
                            {q.label}
                          </SelectItem>
                        ))}
                      </Select>

                      <Select
                        label="Format"
                        selectedKeys={[selectedFormat]}
                        onSelectionChange={(keys) =>
                          setSelectedFormat(Array.from(keys)[0] as string)
                        }
                        size="sm"
                        variant="bordered"
                      >
                        {currentFormats.map((f) => (
                          <SelectItem key={f.key} className="text-foreground">
                            {f.label}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>

                    <Spacer y={4} />

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-3">
                      <Button
                        variant="ghost"
                        className="font-medium"
                        onPress={() => {
                          reset();
                          setUrl("");
                          setDownloadStatus(null);
                        }}
                      >
                        Clear
                      </Button>
                      <Button
                        color="primary"
                        isLoading={isDownloading}
                        isDisabled={isDownloading}
                        onPress={handleDownload}
                        className="font-bold bg-linear-to-r from-violet-600 to-fuchsia-600 text-white"
                        startContent={!isDownloading && <Download size={18} />}
                      >
                        {isDownloading ? "Starting..." : "Download Now"}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Available Formats Info */}
                {videoInfo.formats.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-divider">
                    <p className="text-sm text-default-400">
                      {videoInfo.formats.filter((f) => f.hasVideo).length} video
                      formats available •{" "}
                      {
                        videoInfo.formats.filter(
                          (f) => f.hasAudio && !f.hasVideo
                        ).length
                      }{" "}
                      audio formats
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Supported Platforms Info */}
      {!videoInfo && !isLoading && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-12 text-center"
        >
          <p className="text-sm text-default-400 mb-4">Supported platforms:</p>
          <div className="flex justify-center gap-6 flex-wrap">
            {Object.values(PLATFORMS)
              .slice(0, 6)
              .map((p) => (
                <div
                  key={p.name}
                  className="flex items-center gap-2 text-default-500 hover:text-primary transition-colors"
                >
                  <Globe size={16} />
                  <span className="text-sm">{p.name}</span>
                </div>
              ))}
            <span className="text-default-400 text-sm">+1000 more</span>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default SingleDownload;
