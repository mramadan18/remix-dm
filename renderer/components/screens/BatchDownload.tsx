import React, { useState } from "react";
import {
  Textarea,
  Button,
  Card,
  CardBody,
  Chip,
  Progress,
  ScrollShadow,
} from "@heroui/react";
import { Layers, Plus, Trash2, Settings2, FileCode } from "lucide-react";

const BatchDownload = () => {
  const [urls, setUrls] = useState("");
  const [parsedItems, setParsedItems] = useState<string[]>([]);

  const handleParse = () => {
    // Mock parse: splitting by newline
    const lines = urls.split("\n").filter((line) => line.trim() !== "");
    setParsedItems(lines);
  };

  const clearAll = () => {
    setUrls("");
    setParsedItems([]);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-4xl font-black bg-clip-text text-transparent bg-linear-to-r from-violet-600 via-fuchsia-500 to-emerald-500">
            JokerDL Batch
          </h1>
          <p className="text-default-500 mt-1">
            Download multiple files at once with JokerDL Smart Queue.
          </p>
        </div>
        <Button
          color="danger"
          variant="light"
          startContent={<Trash2 size={18} />}
          onPress={clearAll}
        >
          Clear All
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Left Side: Input */}
        <div className="flex flex-col gap-4">
          <Card className="flex-1 shadow-sm">
            <CardBody className="p-4 flex flex-col">
              <Textarea
                label="Download Links"
                placeholder="Paste links, one per line (Videos, Software, Zip...)"
                minRows={10}
                maxRows={20}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                classNames={{
                  inputWrapper: "h-full bg-default-50",
                  input: "h-full",
                }}
                className="flex-1"
              />
              <Button
                color="primary"
                className="mt-4 w-full font-semibold"
                size="lg"
                startContent={<Plus size={20} />}
                onPress={handleParse}
              >
                Add to Queue
              </Button>
            </CardBody>
          </Card>
        </div>

        {/* Right Side: Process Queue */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-semibold text-lg">
              Queue ({parsedItems.length})
            </h3>
            <Button
              size="sm"
              variant="flat"
              startContent={<Settings2 size={16} />}
            >
              Batch Settings
            </Button>
          </div>

          <ScrollShadow className="flex-1 flex flex-col gap-3 pr-2 pb-2">
            {parsedItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-default-400 border-2 border-dashed border-default-200 rounded-2xl py-4">
                <Layers size={48} className="mb-4 opacity-50" />
                <p>No links added yet.</p>
              </div>
            ) : (
              parsedItems.map((item, idx) => (
                <Card
                  key={idx}
                  className="w-full flex-none animate-appearance-in"
                >
                  <CardBody className="flex flex-row items-center gap-4 p-3">
                    <div className="w-16 h-12 bg-default-200 rounded-lg flex items-center justify-center text-xs text-default-500">
                      <FileCode size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item || "Unknown Item"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Chip size="sm" variant="flat" color="warning">
                          Pending
                        </Chip>
                        <span className="text-xs text-default-400">
                          Auto-detecting...
                        </span>
                      </div>
                    </div>
                    <Button isIconOnly size="sm" variant="light" color="danger">
                      <Trash2 size={16} />
                    </Button>
                  </CardBody>
                </Card>
              ))
            )}
          </ScrollShadow>

          {parsedItems.length > 0 && (
            <Button
              color="success"
              className="w-full text-white font-bold shadow-lg shadow-success/20"
              size="lg"
            >
              Start All Downloads
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchDownload;
