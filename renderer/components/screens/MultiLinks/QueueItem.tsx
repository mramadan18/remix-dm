import { Button, Card, CardBody, Chip } from "@heroui/react";
import { FileCode, Trash2, Video, FileDown } from "lucide-react";

// دالة مساعدة لتنسيق الحجم (يمكن استيرادها من utils إذا كانت موجودة)
const formatBytes = (bytes?: number) => {
  if (!bytes) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

interface QueueItemProps {
  url: string;
  title?: string;
  size?: number;
  type?: "video" | "direct";
  status: "pending" | "processing" | "added" | "error";
  error?: string;
  onRemove?: () => void;
}

export const QueueItem = ({
  url,
  title,
  size,
  type,
  status,
  error,
  onRemove,
}: QueueItemProps) => {
  const getStatusColor = () => {
    switch (status) {
      case "pending":
        return "warning";
      case "processing":
        return "primary";
      case "added":
        return "success";
      case "error":
        return "danger";
      default:
        return "default";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "pending":
        return "Waiting...";
      case "processing":
        return type === "direct" ? "Detecting file..." : "Extracting info...";
      case "added":
        return type === "direct" ? "Download started" : "Added to queue";
      case "error":
        return error || "Failed";
      default:
        return "Unknown";
    }
  };

  const getIcon = () => {
    if (type === "video") return <Video size={20} />;
    if (type === "direct") return <FileDown size={20} />;
    return <FileCode size={20} />;
  };

  return (
    <Card className="w-full flex-none animate-appearance-in">
      <CardBody className="flex flex-row items-center gap-4 p-3">
        <div className="w-16 h-12 bg-default-200 rounded-lg flex items-center justify-center text-xs text-default-500">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">
              {title || url || "Unknown Item"}
            </p>
            {size && (
              <Chip
                size="sm"
                variant="dot"
                color="default"
                className="border-none h-5"
              >
                {formatBytes(size)}
              </Chip>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Chip size="sm" variant="flat" color={getStatusColor()}>
              {status.toUpperCase()}
            </Chip>
            <span className="text-xs text-default-400">
              {getStatusText()}
              {type && <span className="mx-1 opacity-50">•</span>}
              {type === "video"
                ? "Video link"
                : type === "direct"
                ? "Direct file"
                : ""}
            </span>
          </div>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          color="danger"
          onPress={onRemove}
        >
          <Trash2 size={16} />
        </Button>
      </CardBody>
    </Card>
  );
};
