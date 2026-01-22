import { Card, CardBody } from "@heroui/react";
import { motion } from "framer-motion";
import { VideoThumbnail } from "./VideoThumbnail";
import { VideoMetadata } from "./VideoMetadata";
import { QualityFormatSelectors } from "./QualityFormatSelectors";
import { DownloadActions } from "./DownloadActions";

interface VideoInfoCardProps {
  // State
  selectedQuality: string;
  selectedFormat: string;
  isDownloading: boolean;
  isDirectDownload: boolean;

  // Video info
  videoInfo: any; // We'll type this properly if possible, or use the inferred type

  // Computed
  currentFormats: Array<{ key: string; label: string }>;
  availableQualities: Array<{ key: string; label: string }>;

  // Handlers
  onDownload: () => void;
  onClear: () => void;
  onQualityChange: (quality: any) => void;
  onFormatChange: (format: string) => void;
}

export const VideoInfoCard = ({
  selectedQuality,
  selectedFormat,
  isDownloading,
  isDirectDownload,
  videoInfo,
  currentFormats,
  availableQualities,
  onDownload,
  onClear,
  onQualityChange,
  onFormatChange,
}: VideoInfoCardProps) => {
  return (
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
            <VideoThumbnail {...videoInfo} />

            <div className="md:col-span-2 flex flex-col justify-between py-2">
              <VideoMetadata {...videoInfo} />

              {/* Quality & Format Selectors - Hide for direct downloads */}
              {!isDirectDownload && (
                <QualityFormatSelectors
                  selectedQuality={selectedQuality}
                  selectedFormat={selectedFormat}
                  currentFormats={currentFormats}
                  availableQualities={availableQualities}
                  onQualityChange={onQualityChange}
                  onFormatChange={onFormatChange}
                />
              )}

              {/* Action Buttons */}
              <DownloadActions
                isDownloading={isDownloading}
                onClear={onClear}
                onDownload={onDownload}
              />
            </div>
          </div>

          {/* Available Formats Info */}
          {videoInfo.formats.length > 0 && (
            <div className="mt-6 pt-4 border-t border-divider">
              <p className="text-sm text-default-400">
                {availableQualities.length - 1} quality options available •{" "}
                {videoInfo.formats.filter((f) => f.hasVideo).length} video
                formats •{" "}
                {
                  videoInfo.formats.filter((f) => f.hasAudio && !f.hasVideo)
                    .length
                }{" "}
                audio formats
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
};
