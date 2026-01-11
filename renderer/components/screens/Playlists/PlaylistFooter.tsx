import { Button } from "@heroui/react";
import { Download } from "lucide-react";
import { PlaylistQualitySelector } from "./PlaylistQualitySelector";

interface PlaylistFooterProps {
  selectedCount: number;
  onDownload: () => void;
  isLoading?: boolean;
  selectedQuality: string;
  onQualityChange: (quality: string) => void;
}

export const PlaylistFooter: React.FC<PlaylistFooterProps> = ({
  selectedCount,
  onDownload,
  isLoading,
  selectedQuality,
  onQualityChange,
}) => {
  return (
    <div className="py-4 border-t border-divider mt-4 flex items-center justify-between bg-default-50/50 -mx-6 -mb-6 px-8 rounded-b-2xl backdrop-blur-md">
      <PlaylistQualitySelector
        selectedQuality={selectedQuality}
        onQualityChange={onQualityChange}
        isDisabled={isLoading}
      />
      <Button
        size="lg"
        color="primary"
        className="font-bold shadow-lg h-14 px-8 bg-linear-to-r from-violet-600 to-fuchsia-600 text-white shadow-violet-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
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
