import { useState, useEffect } from "react";
import {
  Card,
  CardBody,
  Progress,
  Button,
  Chip,
  Tabs,
  Tab,
  Spinner,
  Image,
} from "@heroui/react";
import {
  Pause,
  Play,
  X,
  FileVideo,
  FileText,
  Music,
  Package,
  AlertCircle,
  CheckCircle2,
  FileCode,
  Clock,
  Zap,
  FolderOpen,
  Trash2,
  RefreshCw,
  Download,
  Layers,
} from "lucide-react";
import {
  useDownloads,
  DownloadStatus,
  DownloadItem,
} from "../../hooks/useDownload";

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number | null): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Get status color for chips and progress
 */
function getStatusColor(
  status: DownloadStatus
): "primary" | "success" | "warning" | "danger" | "default" {
  switch (status) {
    case DownloadStatus.DOWNLOADING:
    case DownloadStatus.MERGING:
      return "primary";
    case DownloadStatus.COMPLETED:
      return "success";
    case DownloadStatus.PAUSED:
    case DownloadStatus.PENDING:
      return "warning";
    case DownloadStatus.FAILED:
    case DownloadStatus.CANCELLED:
      return "danger";
    default:
      return "default";
  }
}

/**
 * Get human-readable status label
 */
function getStatusLabel(status: DownloadStatus): string {
  switch (status) {
    case DownloadStatus.PENDING:
      return "Pending";
    case DownloadStatus.EXTRACTING:
      return "Extracting...";
    case DownloadStatus.DOWNLOADING:
      return "Downloading";
    case DownloadStatus.MERGING:
      return "Merging...";
    case DownloadStatus.CONVERTING:
      return "Converting...";
    case DownloadStatus.COMPLETED:
      return "Completed";
    case DownloadStatus.PAUSED:
      return "Paused";
    case DownloadStatus.FAILED:
      return "Failed";
    case DownloadStatus.CANCELLED:
      return "Cancelled";
    default:
      return status;
  }
}

/**
 * Get status icon
 */
function getStatusIcon(status: DownloadStatus) {
  switch (status) {
    case DownloadStatus.COMPLETED:
      return <CheckCircle2 size={12} />;
    case DownloadStatus.FAILED:
    case DownloadStatus.CANCELLED:
      return <AlertCircle size={12} />;
    case DownloadStatus.PAUSED:
      return <Pause size={12} />;
    case DownloadStatus.PENDING:
      return <Clock size={12} />;
    default:
      return null;
  }
}

/**
 * Single download item card component
 */
function DownloadCard({
  item,
  onPause,
  onResume,
  onCancel,
}: {
  item: DownloadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const isActive =
    item.status === DownloadStatus.DOWNLOADING ||
    item.status === DownloadStatus.MERGING ||
    item.status === DownloadStatus.EXTRACTING ||
    item.status === DownloadStatus.CONVERTING;

  const isPausable = item.status === DownloadStatus.DOWNLOADING;
  const isResumable =
    item.status === DownloadStatus.PAUSED ||
    item.status === DownloadStatus.FAILED;
  const isCancellable =
    item.status !== DownloadStatus.COMPLETED &&
    item.status !== DownloadStatus.CANCELLED;

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow animate-appearance-in">
      <CardBody className="p-4">
        <div className="flex items-start gap-4">
          {/* Thumbnail */}
          <div className="w-20 h-14 bg-default-100 rounded-lg overflow-hidden shrink-0">
            {item.videoInfo?.thumbnail ? (
              <Image
                alt="Thumbnail"
                src={item.videoInfo.thumbnail}
                classNames={{
                  wrapper: "w-full h-full",
                  img: "object-cover w-full h-full",
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-primary">
                <FileVideo size={24} />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2 mb-2">
              <h3 className="font-semibold truncate text-sm">
                {item.videoInfo?.title || item.filename || "Downloading..."}
              </h3>
              <div className="flex items-center gap-2 shrink-0 text-xs text-default-500">
                {item.progress.speedString && isActive && (
                  <>
                    <Zap size={12} className="text-warning" />
                    <span>{item.progress.speedString}</span>
                    <span className="text-default-300">|</span>
                  </>
                )}
                {item.progress.etaString && isActive && (
                  <>
                    <Clock size={12} />
                    <span>{item.progress.etaString}</span>
                    <span className="text-default-300">|</span>
                  </>
                )}
                <span>
                  {formatBytes(item.progress.downloadedBytes)}
                  {item.progress.totalBytes &&
                    ` / ${formatBytes(item.progress.totalBytes)}`}
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <Progress
              size="sm"
              value={item.progress.progress}
              color={getStatusColor(item.status)}
              className="max-w-full mb-2"
              isIndeterminate={
                item.status === DownloadStatus.EXTRACTING ||
                item.status === DownloadStatus.MERGING ||
                (item.status === DownloadStatus.DOWNLOADING &&
                  item.progress.progress === 0)
              }
            />

            {/* Status and Actions */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2 items-center">
                <Chip
                  size="sm"
                  color={getStatusColor(item.status)}
                  variant="flat"
                  startContent={getStatusIcon(item.status)}
                >
                  {getStatusLabel(item.status)}
                  {isActive && ` ${Math.round(item.progress.progress)}%`}
                </Chip>

                {item.videoInfo?.uploader && (
                  <span className="text-xs text-default-400">
                    {item.videoInfo.uploader}
                  </span>
                )}
              </div>

              <div className="flex gap-1">
                {isPausable && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="warning"
                    onPress={() => onPause(item.id)}
                  >
                    <Pause size={16} />
                  </Button>
                )}
                {isResumable && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="success"
                    onPress={() => onResume(item.id)}
                  >
                    <Play size={16} />
                  </Button>
                )}
                {item.status === DownloadStatus.COMPLETED && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="primary"
                    onPress={() => {
                      // Open file location - would need IPC call
                      console.log("Open file location:", item.outputPath);
                    }}
                  >
                    <FolderOpen size={16} />
                  </Button>
                )}
                {isCancellable && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={() => onCancel(item.id)}
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>
            </div>

            {/* Error message */}
            {item.error && item.status === DownloadStatus.FAILED && (
              <p className="text-xs text-danger mt-2 truncate">{item.error}</p>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Empty state component
 */
function EmptyState({ type }: { type: "active" | "completed" | "failed" }) {
  const config = {
    active: {
      icon: <Download size={48} className="opacity-50" />,
      title: "No active downloads",
      description: "Start a new download from the home page",
    },
    completed: {
      icon: <CheckCircle2 size={48} className="opacity-50" />,
      title: "No completed downloads",
      description: "Completed downloads will appear here",
    },
    failed: {
      icon: <AlertCircle size={48} className="opacity-50" />,
      title: "No failed downloads",
      description: "Failed downloads will appear here for retry",
    },
  };

  const { icon, title, description } = config[type];

  return (
    <div className="flex flex-col items-center justify-center py-16 text-default-400">
      {icon}
      <p className="mt-4 font-medium">{title}</p>
      <p className="text-sm">{description}</p>
    </div>
  );
}

/**
 * Downloads screen component
 */
const Downloads = () => {
  const [selectedTab, setSelectedTab] = useState("active");
  const {
    downloads,
    activeDownloads,
    completedDownloads,
    failedDownloads,
    isLoading,
    error,
    pause,
    resume,
    cancel,
    clearCompleted,
  } = useDownloads();

  // Get displays based on selected tab
  const getDisplayedDownloads = () => {
    switch (selectedTab) {
      case "active":
        return downloads.filter(
          (d) =>
            d.status === DownloadStatus.DOWNLOADING ||
            d.status === DownloadStatus.PENDING ||
            d.status === DownloadStatus.PAUSED ||
            d.status === DownloadStatus.MERGING ||
            d.status === DownloadStatus.EXTRACTING ||
            d.status === DownloadStatus.CONVERTING
        );
      case "completed":
        return completedDownloads;
      case "failed":
        return failedDownloads;
      default:
        return downloads;
    }
  };

  const displayedDownloads = getDisplayedDownloads();

  const handlePauseAll = async () => {
    for (const download of activeDownloads) {
      if (download.status === DownloadStatus.DOWNLOADING) {
        await pause(download.id);
      }
    }
  };

  const handleResumeAll = async () => {
    for (const download of downloads) {
      if (download.status === DownloadStatus.PAUSED) {
        await resume(download.id);
      }
    }
  };

  const handleClearCompleted = async () => {
    await clearCompleted();
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto flex items-center justify-center py-20">
        <Spinner size="lg" color="primary" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black bg-linear-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            JokerDL Downloads
          </h1>
          <p className="text-default-500 text-sm mt-1">
            {downloads.length} total • {activeDownloads.length} active •{" "}
            {completedDownloads.length} completed
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            color="warning"
            variant="flat"
            size="sm"
            startContent={<Pause size={14} />}
            isDisabled={activeDownloads.length === 0}
            onPress={handlePauseAll}
          >
            Pause All
          </Button>
          <Button
            color="success"
            variant="flat"
            size="sm"
            startContent={<Play size={14} />}
            isDisabled={
              !downloads.some((d) => d.status === DownloadStatus.PAUSED)
            }
            onPress={handleResumeAll}
          >
            Resume All
          </Button>
          <Button
            color="default"
            variant="flat"
            size="sm"
            startContent={<Trash2 size={14} />}
            isDisabled={completedDownloads.length === 0}
            onPress={handleClearCompleted}
          >
            Clear Done
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="mb-4 border-danger/30 bg-danger/10">
          <CardBody className="flex flex-row items-center gap-3 py-3">
            <AlertCircle className="text-danger" size={20} />
            <span className="text-danger">{error}</span>
          </CardBody>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(key as string)}
        className="mb-6"
        color="primary"
        variant="underlined"
      >
        <Tab
          key="active"
          title={
            <div className="flex items-center gap-2">
              <Layers size={16} />
              <span>Active</span>
              {activeDownloads.length > 0 && (
                <Chip size="sm" color="primary" variant="flat">
                  {activeDownloads.length}
                </Chip>
              )}
            </div>
          }
        />
        <Tab
          key="completed"
          title={
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>Completed</span>
              {completedDownloads.length > 0 && (
                <Chip size="sm" color="success" variant="flat">
                  {completedDownloads.length}
                </Chip>
              )}
            </div>
          }
        />
        <Tab
          key="failed"
          title={
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>Failed</span>
              {failedDownloads.length > 0 && (
                <Chip size="sm" color="danger" variant="flat">
                  {failedDownloads.length}
                </Chip>
              )}
            </div>
          }
        />
      </Tabs>

      {/* Download List */}
      <div className="flex flex-col gap-3">
        {displayedDownloads.length === 0 ? (
          <EmptyState type={selectedTab as "active" | "completed" | "failed"} />
        ) : (
          displayedDownloads.map((item) => (
            <DownloadCard
              key={item.id}
              item={item}
              onPause={pause}
              onResume={resume}
              onCancel={cancel}
            />
          ))
        )}
      </div>

      {/* Stats Footer */}
      {downloads.length > 0 && (
        <div className="mt-8 pt-4 border-t border-divider">
          <div className="flex justify-between text-sm text-default-400">
            <span>
              Total downloaded:{" "}
              {formatBytes(
                downloads.reduce(
                  (acc, d) => acc + (d.progress.downloadedBytes || 0),
                  0
                )
              )}
            </span>
            <span>{completedDownloads.length} files completed</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Downloads;
