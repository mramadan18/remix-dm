import { useMemo } from "react";
import { Clock } from "lucide-react";
import { HistoryRecord } from "../../../types/history";
import { HistoryItem } from "./HistoryItem";

interface HistoryListProps {
  history: HistoryRecord[];
  onOpenFile: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onDelete: (id: string, deleteFile: boolean) => void;
}

export const HistoryList = ({
  history,
  onOpenFile,
  onOpenFolder,
  onDelete,
}: HistoryListProps) => {
  // Grouping Logic
  const groupedHistory = useMemo(() => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const isSameDay = (d1: Date, d2: Date) =>
      d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear();

    const groups: Record<string, HistoryRecord[]> = {
      Today: [],
      Yesterday: [],
      "Last Week": [],
      Older: [],
    };

    history.forEach((item) => {
      const date = new Date(item.date);
      if (isSameDay(date, today)) {
        groups["Today"].push(item);
      } else if (isSameDay(date, yesterday)) {
        groups["Yesterday"].push(item);
      } else if (today.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
        groups["Last Week"].push(item);
      } else {
        groups["Older"].push(item);
      }
    });

    // Remove empty groups
    return Object.fromEntries(
      Object.entries(groups).filter(([_, items]) => items.length > 0),
    );
  }, [history]);

  return (
    <div className="space-y-8">
      {Object.entries(groupedHistory).map(([group, items]) => (
        <div key={group} className="space-y-3">
          <h2 className="text-lg font-bold text-default-600 flex items-center gap-2 px-2">
            <Clock size={16} />
            {group}
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {items.map((item) => (
              <HistoryItem
                key={item.id}
                item={item}
                onOpenFile={onOpenFile}
                onOpenFolder={onOpenFolder}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
