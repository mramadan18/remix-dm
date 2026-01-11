import { Button, Card, CardBody, Chip } from "@heroui/react";
import { FileCode, Trash2 } from "lucide-react";

interface QueueItemProps {
  url: string;
  title?: string;
  status: "pending" | "processing" | "added" | "error";
  error?: string;
  onRemove?: () => void;
}

export const QueueItem = ({
  url,
  title,
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
        return "Extracting info...";
      case "added":
        return "Added to downloads";
      case "error":
        return error || "Failed";
      default:
        return "Unknown";
    }
  };

  return (
    <Card className="w-full flex-none animate-appearance-in">
      <CardBody className="flex flex-row items-center gap-4 p-3">
        <div className="w-16 h-12 bg-default-200 rounded-lg flex items-center justify-center text-xs text-default-500">
          <FileCode size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {title || url || "Unknown Item"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Chip size="sm" variant="flat" color={getStatusColor()}>
              {status.toUpperCase()}
            </Chip>
            <span className="text-xs text-default-400">{getStatusText()}</span>
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
