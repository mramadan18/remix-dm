import Link from "next/link";
import { useRouter } from "next/router";
import {
  Layers,
  Library,
  Download,
  History,
  Settings,
  HardDrive,
} from "lucide-react";
import { Button } from "@heroui/react";

const Sidebar = () => {
  const router = useRouter();

  const menuItems = [
    { label: "Quick Download", icon: Download, path: "/home" },
    { label: "Playlist/Channel", icon: Library, path: "/playlist" },
    { label: "Multiple Links", icon: Layers, path: "/multi" },
    { label: "Downloads", icon: HardDrive, path: "/downloads" },
    { label: "History", icon: History, path: "/history" },
    { label: "Settings", icon: Settings, path: "/settings" },
  ];

  return (
    <aside className="w-full h-full bg-background border-r border-divider flex flex-col justify-between py-6 px-4">
      <div>
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="relative flex items-center justify-center">
            <div className="w-10 h-10 bg-linear-to-br from-violet-600 to-fuchsia-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20 transform rotate-3">
              <Download className="text-white w-6 h-6" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-black tracking-tighter leading-none bg-linear-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
              JokerDL
            </span>
            <span className="text-[10px] font-bold text-default-400 tracking-[0.2em] uppercase">
              Pro Downloader
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          {menuItems.map((item) => {
            const isActive = router.pathname === item.path;
            const Icon = item.icon;

            return (
              <Button
                key={item.path}
                as={Link}
                href={item.path}
                variant={isActive ? "flat" : "light"}
                color={isActive ? "primary" : "default"}
                className={`w-full justify-start gap-4 text-sm font-medium ${
                  isActive ? "bg-primary/10" : "hover:bg-default-100"
                }`}
                size="lg"
                startContent={
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? "text-primary" : "text-default-500"
                    }`}
                  />
                }
              >
                {item.label}
              </Button>
            );
          })}
        </nav>
      </div>

      <div className="px-2">
        <div className="bg-default-50 p-4 rounded-xl border border-default-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-default-500">
              STORAGE
            </span>
            <span className="text-xs text-primary">75%</span>
          </div>
          <div className="w-full h-1.5 bg-default-200 rounded-full overflow-hidden">
            <div className="h-full w-3/4 bg-primary rounded-full" />
          </div>
          <p className="text-xs text-default-400 mt-2">126 GB used of 512 GB</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
