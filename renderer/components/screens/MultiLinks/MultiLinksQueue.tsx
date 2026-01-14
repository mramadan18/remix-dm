import { Button, ScrollShadow } from "@heroui/react";
import { Layers, Settings2 } from "lucide-react";
import { QueueItem } from "./QueueItem";
import { QueueItemData } from "../../../hooks/useMultiDownload";

interface MultiLinksQueueProps {
  items: QueueItemData[];
  onRemoveItem: (index: number) => void;
  onStartAll: () => void;
}

export const MultiLinksQueue = ({
  items,
  onRemoveItem,
  onStartAll,
}: MultiLinksQueueProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="font-semibold text-lg">Queue ({items.length})</h3>
        <Button size="sm" variant="flat" startContent={<Settings2 size={16} />}>
          Batch Settings
        </Button>
      </div>

      <ScrollShadow className="flex-1 flex flex-col gap-3 pr-2 pb-2">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-default-400 border-2 border-dashed border-default-200 rounded-2xl py-4">
            <Layers size={48} className="mb-4 opacity-50" />
            <p>No links added yet.</p>
          </div>
        ) : (
          items.map((item, idx) => (
            <QueueItem
              key={item.id}
              url={item.url}
              title={item.title}
              size={item.size}
              type={item.type}
              status={item.status}
              error={item.error}
              onRemove={() => onRemoveItem(idx)}
            />
          ))
        )}
      </ScrollShadow>

      {items.length > 0 && (
        <Button
          color="success"
          className="w-full text-white font-bold shadow-lg shadow-success/20"
          size="lg"
          onPress={onStartAll}
        >
          Start All Downloads
        </Button>
      )}
    </div>
  );
};
