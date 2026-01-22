import { Divider, Chip, Button, Accordion, AccordionItem } from "@heroui/react";
import { Check, AlertCircle, RefreshCw, Activity, Power } from "lucide-react";

interface EngineSettingsProps {
  // yt-dlp props
  binaryInfo: { path: string; version: string | null } | null;
  isUpdating: boolean;
  updateStatus: "idle" | "success" | "error";
  updateError: string | null;
  onUpdate: () => void;
  // aria2 props
  aria2Info: {
    path: string | null;
    available: boolean;
    running: boolean;
  } | null;
  isRestartingAria2: boolean;
  onRestartAria2: () => void;
  // ffmpeg props
  ffmpegInfo: {
    path: string | null;
    available: boolean;
  } | null;
}

export const EngineSettings = ({
  binaryInfo,
  isUpdating,
  updateStatus,
  updateError,
  onUpdate,
  aria2Info,
  isRestartingAria2,
  onRestartAria2,
  ffmpegInfo,
}: EngineSettingsProps) => {
  return (
    <Accordion variant="splitted" className="px-0">
      <AccordionItem
        key="engines"
        aria-label="Download Engines"
        title={
          <div className="flex items-center gap-2 font-bold text-lg">
            <Activity size={20} className="text-primary" />
            Download Engines & Binaries
          </div>
        }
        subtitle={
          <span className="text-xs text-default-400">
            Advanced settings for yt-dlp, Aria2, and FFmpeg
          </span>
        }
        className="bg-content1 shadow-sm rounded-xl overflow-hidden px-4"
      >
        <div className="flex flex-col gap-6 pb-6 pt-2">
          {/* yt-dlp Section */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">yt-dlp Engine</span>
                </div>
                <span className="text-xs text-default-400">
                  Core engine for video and media downloads
                </span>
              </div>
              <div className="flex items-center gap-3">
                {binaryInfo?.version ? (
                  <Chip size="sm" variant="flat" color="success">
                    v{binaryInfo.version}
                  </Chip>
                ) : (
                  <Chip size="sm" variant="flat" color="warning">
                    Not installed
                  </Chip>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pl-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Update Engine</span>
                <span className="text-xs text-default-400">
                  Fix parsing issues with latest version
                </span>
              </div>
              <div className="flex items-center gap-2">
                {updateStatus === "success" && (
                  <Chip
                    size="sm"
                    color="success"
                    variant="flat"
                    startContent={<Check size={14} />}
                  >
                    Updated!
                  </Chip>
                )}
                {updateStatus === "error" && (
                  <Chip
                    size="sm"
                    color="danger"
                    variant="flat"
                    startContent={<AlertCircle size={14} />}
                  >
                    {updateError || "Failed"}
                  </Chip>
                )}
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  onPress={onUpdate}
                  isLoading={isUpdating}
                  startContent={!isUpdating && <RefreshCw size={16} />}
                >
                  {isUpdating ? "Updating..." : "Update Now"}
                </Button>
              </div>
            </div>
          </div>

          <Divider />

          {/* Aria2 Section */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-sm">Aria2 Engine</span>
                <span className="text-xs text-default-400">
                  High-speed engine for direct file downloads
                </span>
              </div>
              <div className="flex items-center gap-3">
                {aria2Info?.available ? (
                  <Chip
                    size="sm"
                    variant="flat"
                    color={aria2Info.running ? "success" : "warning"}
                  >
                    {aria2Info.running ? "Running" : "Stopped"}
                  </Chip>
                ) : (
                  <Chip size="sm" variant="flat" color="danger">
                    Unavailable
                  </Chip>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pl-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Restart Daemon</span>
                <span className="text-xs text-default-400">
                  Restart the download engine if it hangs
                </span>
              </div>
              <Button
                size="sm"
                color="secondary"
                variant="flat"
                onPress={onRestartAria2}
                isLoading={isRestartingAria2}
                startContent={!isRestartingAria2 && <Power size={16} />}
              >
                {isRestartingAria2 ? "Restarting..." : "Restart Engine"}
              </Button>
            </div>
          </div>

          <Divider />

          {/* FFmpeg Section */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-sm">FFmpeg Core</span>
                <span className="text-xs text-default-400">
                  Required for merging high-quality video and audio
                </span>
              </div>
              <div className="flex items-center gap-3">
                {ffmpegInfo?.available ? (
                  <Chip size="sm" variant="flat" color="success">
                    Available
                  </Chip>
                ) : (
                  <Chip size="sm" variant="flat" color="danger">
                    Missing
                  </Chip>
                )}
              </div>
            </div>
          </div>

          {/* Binary Paths */}
          {(binaryInfo?.path || aria2Info?.path || ffmpegInfo?.path) && (
            <>
              <Divider />
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-default-600 uppercase">
                  Engine Binary Locations
                </span>
                {binaryInfo?.path && (
                  <div className="flex flex-col gap-1 pl-2">
                    <span className="text-[10px] font-medium text-default-500">
                      yt-dlp:
                    </span>
                    <code className="text-[10px] text-default-400 bg-default-50 px-2 py-1 rounded break-all border border-default-100">
                      {binaryInfo.path}
                    </code>
                  </div>
                )}
                {aria2Info?.path && (
                  <div className="flex flex-col gap-1 pl-2">
                    <span className="text-[10px] font-medium text-default-500">
                      Aria2:
                    </span>
                    <code className="text-[10px] text-default-400 bg-default-50 px-2 py-1 rounded break-all border border-default-100">
                      {aria2Info.path}
                    </code>
                  </div>
                )}
                {ffmpegInfo?.path && (
                  <div className="flex flex-col gap-1 pl-2">
                    <span className="text-[10px] font-medium text-default-500">
                      FFmpeg:
                    </span>
                    <code className="text-[10px] text-default-400 bg-default-50 px-2 py-1 rounded break-all border border-default-100">
                      {ffmpegInfo.path}
                    </code>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </AccordionItem>
    </Accordion>
  );
};
