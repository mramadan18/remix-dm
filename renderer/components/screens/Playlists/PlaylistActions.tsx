import { Button } from "@heroui/react";
import { Download } from "lucide-react";
import { PlaylistQualitySelector } from "./PlaylistQualitySelector";

interface PlaylistActionsProps {
  selectedCount: number;
  onDownload: () => void;
  isLoading?: boolean;
  selectedQuality: string;
  onQualityChange: (quality: string) => void;
}

export const PlaylistActions: React.FC<PlaylistActionsProps> = ({
  selectedCount,
  onDownload,
  isLoading,
  selectedQuality,
  onQualityChange,
}) => {
  return (
    <div className="py-4 px-6 flex items-center justify-between bg-default-50/50 rounded-2xl backdrop-blur-md border border-divider shadow-sm">
      <PlaylistQualitySelector
        selectedQuality={selectedQuality}
        onQualityChange={onQualityChange}
        isDisabled={isLoading}
      />
      <Button
        size="lg"
        color="primary"
        className="font-bold shadow-lg h-14 px-8 bg-linear-to-r from-brand-cyan to-brand-purple text-white shadow-brand-cyan/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
        startContent={!isLoading && <Download size={22} />}
        isDisabled={selectedCount === 0 || isLoading}
        onPress={onDownload}
        isLoading={isLoading}
      >
        Download {selectedCount} Videos
      </Button>
    </div>
  );
};
