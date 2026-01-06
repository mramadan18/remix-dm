import React, { useState } from "react";
import {
  Input,
  Button,
  Checkbox,
  Card,
  CardBody,
  Image,
  ScrollShadow,
  Divider,
} from "@heroui/react";
import { ListVideo, CheckSquare, Square, Download, Search } from "lucide-react";

const BulkMedia = () => {
  const [url, setUrl] = useState("");
  const [isFetched, setIsFetched] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  // Mock Data
  const playlistItems = Array.from({ length: 15 }).map((_, i) => ({
    id: `vid-${i}`,
    title: `Playlist Video Tutorial #${i + 1} - Advanced Course`,
    duration: "10:24",
    thumbnail: "https://nextui.org/images/hero-card.jpeg",
  }));

  const handleFetch = () => {
    if (!url) return;
    setIsFetched(true);
    // Select all by default
    setSelected(playlistItems.map((i) => i.id));
  };

  const toggleSelect = (id: string) => {
    if (selected.includes(id)) {
      setSelected(selected.filter((i) => i !== id));
    } else {
      setSelected([...selected, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selected.length === playlistItems.length) {
      setSelected([]);
    } else {
      setSelected(playlistItems.map((i) => i.id));
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex flex-col gap-6 mb-6">
        <div className="text-center">
          <h1 className="text-4xl font-black mb-2 bg-linear-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
            JokerDL Bulk Media
          </h1>
          <p className="text-default-500">
            Smart multi-item detection and bulk downloading for videos and
            albums.
          </p>
        </div>

        <Card className="p-2 shadow-sm">
          <CardBody className="flex flex-row gap-3">
            <Input
              placeholder="Paste playlist URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              startContent={<ListVideo className="text-default-400" />}
              size="lg"
              className="flex-1"
            />
            <Button
              color="primary"
              size="lg"
              className="font-semibold"
              onPress={handleFetch}
            >
              Fetch List
            </Button>
          </CardBody>
        </Card>
      </div>

      {isFetched && (
        <div className="flex-1 min-h-0 flex flex-col gap-4 animate-appearance-in">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-4">
              <Button
                size="sm"
                variant="light"
                onPress={toggleSelectAll}
                startContent={
                  selected.length === playlistItems.length ? (
                    <CheckSquare size={18} />
                  ) : (
                    <Square size={18} />
                  )
                }
              >
                {selected.length === playlistItems.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
              <span className="text-small text-default-500">
                {selected.length} / {playlistItems.length} items selected
              </span>
            </div>
            <div>
              <Input
                size="sm"
                placeholder="Filter items..."
                startContent={<Search size={14} />}
                className="w-64"
              />
            </div>
          </div>

          <Card className="flex-1 border-none shadow-sm bg-default-50/50">
            <ScrollShadow className="h-full p-2">
              <div className="grid grid-cols-1 gap-1">
                {playlistItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-4 p-3 rounded-xl transition-colors cursor-pointer ${
                      selected.includes(item.id)
                        ? "bg-primary/10"
                        : "hover:bg-default-200/50"
                    }`}
                    onClick={() => toggleSelect(item.id)}
                  >
                    <Checkbox
                      isSelected={selected.includes(item.id)}
                      onValueChange={() => toggleSelect(item.id)}
                    />
                    <div className="w-24 h-14 bg-black/20 rounded-lg overflow-hidden relative flex-none">
                      <Image
                        src={item.thumbnail}
                        className="object-cover w-full h-full"
                        alt="thumb"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{item.title}</h4>
                      <span className="text-xs text-default-400">
                        {item.duration}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-divider mx-2" />
                    <div className="text-xs font-semibold text-default-500 uppercase">
                      Media
                    </div>
                  </div>
                ))}
              </div>
            </ScrollShadow>
          </Card>

          <div className="py-2 flex justify-end">
            <Button
              size="lg"
              color="primary"
              className="font-bold shadow-lg"
              startContent={<Download />}
              isDisabled={selected.length === 0}
            >
              Download Selected ({selected.length})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkMedia;
