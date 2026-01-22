import { useState, useRef } from "react";
import {
  Card,
  CardBody,
  Input,
  Button,
  Chip,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@heroui/react";
import {
  ListVideo,
  Copy,
  Scissors,
  Clipboard,
  Link2,
  Download,
} from "lucide-react";

interface UrlInputCardProps {
  url: string;
  onUrlChange: (url: string) => void;
  onFetch: () => void;
  isLoading?: boolean;
  platform?: { name: string; icon: string } | null;
  onKeyPress?: (e: React.KeyboardEvent) => void;
}

export const UrlInputCard: React.FC<UrlInputCardProps> = ({
  url,
  onUrlChange,
  onFetch,
  isLoading,
  platform,
  onKeyPress,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [offsets, setOffsets] = useState({ x: 0, y: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setOffsets({
        x: e.clientX - rect.left,
        y: e.clientY - (rect.top + rect.height),
      });
      setIsOpen(true);
    }
  };

  const handleCopy = async () => {
    if (inputRef.current) {
      inputRef.current.select();
      try {
        await navigator.clipboard.writeText(url);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
    setIsOpen(false);
  };

  const handleCut = async () => {
    if (inputRef.current) {
      inputRef.current.select();
      try {
        await navigator.clipboard.writeText(url);
        onUrlChange("");
      } catch (err) {
        console.error("Failed to cut:", err);
      }
    }
    setIsOpen(false);
  };

  const handlePaste = async () => {
    if (inputRef.current) {
      inputRef.current.focus();
      try {
        const text = await navigator.clipboard.readText();
        onUrlChange(text);
      } catch (err) {
        console.error("Failed to paste:", err);
      }
    }
    setIsOpen(false);
  };

  return (
    <Card className="p-4 mb-8 shadow-xl border-none bg-background/50 backdrop-blur-md">
      <CardBody className="flex flex-row gap-4 items-start">
        <div className="flex-1 relative">
          <Input
            ref={inputRef}
            placeholder="Paste playlist URL..."
            value={url}
            onValueChange={onUrlChange}
            onKeyDown={onKeyPress}
            onContextMenu={handleContextMenu}
            onClick={() => setIsOpen(false)}
            isReadOnly={isOpen}
            startContent={<ListVideo className="text-primary" />}
            endContent={
              platform && (
                <Chip size="sm" color="secondary" variant="flat">
                  {platform.name}
                </Chip>
              )
            }
            size="lg"
            className="w-full"
            classNames={{
              input: "text-lg",
              inputWrapper:
                "h-14 bg-default-100/50 hover:bg-default-200/50 transition-colors",
            }}
          />

          <Popover
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            placement="bottom-start"
            offset={offsets.y}
            crossOffset={offsets.x}
            showArrow={false}
            classNames={{
              content: "p-0 min-w-[160px]",
            }}
          >
            <PopoverTrigger>
              <div />
            </PopoverTrigger>
            <PopoverContent>
              <div className="py-1.5 overflow-hidden w-full">
                <div
                  className="flex items-center gap-3 px-3 py-2 mx-1.5 rounded-lg cursor-pointer text-foreground transition-colors hover:bg-default-100"
                  onClick={handleCopy}
                >
                  <Copy size={16} className="text-primary" />
                  <span className="text-sm">Copy</span>
                </div>
                <div
                  className="flex items-center gap-3 px-3 py-2 mx-1.5 rounded-lg cursor-pointer text-foreground transition-colors hover:bg-default-100"
                  onClick={handleCut}
                >
                  <Scissors size={16} className="text-primary" />
                  <span className="text-sm">Cut</span>
                </div>
                <div
                  className="flex items-center gap-3 px-3 py-2 mx-1.5 rounded-lg cursor-pointer text-foreground transition-colors hover:bg-default-100"
                  onClick={handlePaste}
                >
                  <Clipboard size={16} className="text-primary" />
                  <span className="text-sm">Paste</span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          color="primary"
          size="lg"
          onPress={onFetch}
          isLoading={isLoading}
          isDisabled={!url.trim() || !url.startsWith("http") || isLoading}
          className="h-14 px-4 font-bold bg-linear-to-r from-brand-cyan to-brand-purple text-white shadow-lg shadow-brand-cyan/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
          endContent={!isLoading && <Download size={20} />}
        >
          {isLoading ? "Fetching..." : "Fetch List"}
        </Button>
      </CardBody>
    </Card>
  );
};
