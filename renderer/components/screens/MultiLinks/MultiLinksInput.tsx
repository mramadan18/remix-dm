import { Button, Card, CardBody, Textarea } from "@heroui/react";
import { Plus } from "lucide-react";

interface MultiLinksInputProps {
  urls: string;
  setUrls: (urls: string) => void;
  onParse: () => void;
}

export const MultiLinksInput = ({
  urls,
  setUrls,
  onParse,
}: MultiLinksInputProps) => {
  return (
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
            onPress={onParse}
          >
            Add to Queue
          </Button>
        </CardBody>
      </Card>
    </div>
  );
};
