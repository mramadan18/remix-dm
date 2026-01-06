import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Input,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Chip,
} from "@heroui/react";
import { Search, MoreVertical, FileVideo, Music, File } from "lucide-react";

// Mock Data
const historyItems = [
  {
    id: 1,
    name: "Funny Cat Compilation.mkv",
    date: "2023-10-25",
    size: "450 MB",
    type: "video",
  },
  {
    id: 2,
    name: "Podcast Episode 42.mp3",
    date: "2023-10-24",
    size: "85 MB",
    type: "audio",
  },
  {
    id: 3,
    name: "Project Requirements.pdf",
    date: "2023-10-23",
    size: "2 MB",
    type: "other",
  },
  {
    id: 4,
    name: "Nature 4K.mp4",
    date: "2023-10-20",
    size: "2.1 GB",
    type: "video",
  },
  {
    id: 5,
    name: "React Course Intro.mp4",
    date: "2023-10-18",
    size: "120 MB",
    type: "video",
  },
  {
    id: 6,
    name: "VSCode_Setup.exe",
    date: "2023-10-15",
    size: "95 MB",
    type: "software",
  },
];

const History = () => {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-black bg-linear-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
          JokerDL History
        </h1>
        <div className="flex gap-2 w-full md:w-auto">
          <Input
            placeholder="Search history..."
            startContent={<Search size={16} />}
            className="w-full md:w-64"
          />
          <Button variant="flat">Filter</Button>
        </div>
      </div>

      <Table aria-label="History table">
        <TableHeader>
          <TableColumn>NAME</TableColumn>
          <TableColumn>DATE</TableColumn>
          <TableColumn>SIZE</TableColumn>
          <TableColumn>TYPE</TableColumn>
          <TableColumn align="end">ACTIONS</TableColumn>
        </TableHeader>
        <TableBody>
          {historyItems.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-default-100 text-default-600">
                    {item.type === "video" ? (
                      <FileVideo size={20} />
                    ) : item.type === "audio" ? (
                      <Music size={20} />
                    ) : item.type === "software" ? (
                      <Search size={20} className="text-success" />
                    ) : (
                      <File size={20} />
                    )}
                  </div>
                  <span className="font-medium">{item.name}</span>
                </div>
              </TableCell>
              <TableCell className="text-default-500">{item.date}</TableCell>
              <TableCell className="text-default-500">{item.size}</TableCell>
              <TableCell>
                <Chip
                  size="sm"
                  variant="flat"
                  color={
                    item.type === "video"
                      ? "primary"
                      : item.type === "audio"
                      ? "secondary"
                      : item.type === "software"
                      ? "success"
                      : "default"
                  }
                >
                  {item.type.toUpperCase()}
                </Chip>
              </TableCell>
              <TableCell>
                <div className="relative flex justify-end items-center gap-2">
                  <Dropdown>
                    <DropdownTrigger>
                      <Button isIconOnly size="sm" variant="light">
                        <MoreVertical className="text-default-500" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="History Actions">
                      <DropdownItem key="open">Open File</DropdownItem>
                      <DropdownItem key="folder">Show in Folder</DropdownItem>
                      <DropdownItem key="redownload">Re-download</DropdownItem>
                      <DropdownItem
                        key="delete"
                        className="text-danger"
                        color="danger"
                      >
                        Delete
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default History;
