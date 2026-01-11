import React from "react";
import { Select, SelectItem } from "@heroui/react";
import { Settings2 } from "lucide-react";
import { QUALITY_OPTIONS } from "../../../utils/formatters";

interface PlaylistQualitySelectorProps {
  selectedQuality: string;
  onQualityChange: (quality: string) => void;
  isDisabled?: boolean;
}

export const PlaylistQualitySelector: React.FC<
  PlaylistQualitySelectorProps
> = ({ selectedQuality, onQualityChange, isDisabled }) => {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 bg-primary/10 rounded-lg text-primary">
        <Settings2 size={18} />
      </div>
      <Select
        label="Download Quality"
        placeholder="Select quality"
        size="sm"
        className="w-64"
        selectedKeys={[selectedQuality]}
        onSelectionChange={(keys) => {
          const firstKey = Array.from(keys)[0] as string;
          if (firstKey) onQualityChange(firstKey);
        }}
        isDisabled={isDisabled}
        variant="bordered"
      >
        {QUALITY_OPTIONS.map((option) => (
          <SelectItem key={option.key} textValue={option.label}>
            {option.label}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
};
