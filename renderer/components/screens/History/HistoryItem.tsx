import {
  Button,
  Card,
  CardBody,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/react";
import { FolderOpen, MoreVertical, Play, Trash2 } from "lucide-react";
import { HistoryRecord } from "../../../types/history";
import { formatBytes } from "../../../utils/formatters";
import {
  getFileIconProps,
  getFileTypeFromExtension,
} from "../../../utils/file-icons";

interface HistoryItemProps {
  item: HistoryRecord;
  onOpenFile: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onDelete: (id: string, deleteFile: boolean) => void;
}

export const HistoryItem = ({
  item,
  onOpenFile,
  onOpenFolder,
  onDelete,
}: HistoryItemProps) => {
  const handleAction = (key: string | number) => {
    switch (key) {
      case "open":
        onOpenFile(item.path);
        break;
      case "folder":
        onOpenFolder(item.path);
        break;
      case "delete":
        onDelete(item.id, false);
        break;
      case "delete-file":
        onDelete(item.id, true);
        break;
    }
  };

  const getIcon = (filename: string) => {
    const type = getFileTypeFromExtension(filename);
    const { Icon, className } = getFileIconProps(type);
    return <Icon size={20} className={className} />;
  };

  return (
    <Card
      isPressable
      onPress={() => onOpenFile(item.path)}
      className="group border border-default-100 hover:border-primary/50 transition-colors shadow-none hover:shadow-md bg-content1"
    >
      <CardBody className="p-3">
        <div className="flex items-center gap-4">
          {/* Thumbnail / Icon */}
          <div className="relative shrink-0">
            {item.thumbnail ? (
              <div className="w-16 h-12 rounded-lg overflow-hidden bg-black/10 relative">
                <img
                  src={item.thumbnail}
                  alt="thumb"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play size={16} className="text-white fill-current" />
                </div>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-lg bg-default-100 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                {getIcon(item.filename)}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {item.filename}
            </h4>
            <div className="flex items-center gap-3 text-tiny text-default-400 mt-1">
              <span className="bg-default-100 px-1.5 py-0.5 rounded text-default-600 font-medium">
                {item.type.toUpperCase()}
              </span>
              <span>{formatBytes(item.size)}</span>
              <span>•</span>
              <span className={item.exists === false ? "text-danger" : ""}>
                {item.exists === false ? "Deleted" : item.status}
              </span>
              {item.duration && (
                <>
                  <span>•</span>
                  <span>{item.duration}</span>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              isIconOnly
              variant="light"
              size="sm"
              className="text-default-400 hover:text-primary"
              onPress={(e) => {
                e.continuePropagation();
                onOpenFolder(item.path);
              }}
            >
              <FolderOpen size={18} />
            </Button>

            <Dropdown>
              <DropdownTrigger>
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  className="text-default-400 group-hover:text-default-600"
                >
                  <MoreVertical size={18} />
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="Actions" onAction={handleAction}>
                <DropdownItem key="open" startContent={<Play size={16} />}>
                  Open File
                </DropdownItem>
                <DropdownItem
                  key="folder"
                  startContent={<FolderOpen size={16} />}
                >
                  Show in Folder
                </DropdownItem>
                {/* <DropdownItem
                  key="redownload"
                  startContent={<RotateCcw size={16} />}
                >
                  Re-download (Coming Soon)
                </DropdownItem> */}
                <DropdownItem
                  key="delete"
                  className="text-warning"
                  startContent={<Trash2 size={16} />}
                >
                  Remove from History
                </DropdownItem>
                <DropdownItem
                  key="delete-file"
                  className="text-danger"
                  color="danger"
                  startContent={<Trash2 size={16} />}
                >
                  Delete File & Record
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
