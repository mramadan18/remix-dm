import Link from "next/link";
import { useRouter } from "next/router";
import {
  Layers,
  ListMusic,
  Download,
  History,
  Settings,
  HardDrive,
  Home,
} from "lucide-react";
import { APP_CONFIG } from "../../config/app-config";
import Image from "next/image";

const Sidebar = () => {
  const router = useRouter();

  const menuItems = [
    { label: "Quick DL", icon: Home, path: "/home" },
    { label: "Playlist", icon: ListMusic, path: "/playlist" },
    { label: "Multiple", icon: Layers, path: "/multi" },
    { label: "Downloads", icon: Download, path: "/downloads" },
    { label: "History", icon: History, path: "/history" },
  ];

  const settingsItem = { label: "Settings", icon: Settings, path: "/settings" };

  const renderItem = (item: any) => {
    const isActive = router.pathname === item.path;
    const Icon = item.icon;

    return (
      <Link
        key={item.path}
        href={item.path}
        className={`relative flex flex-col items-center justify-center gap-2 py-4 transition-all duration-300 group w-full`}
        style={{
          borderLeftColor: isActive ? "var(--brand-cyan)" : "transparent",
          borderRightColor: isActive ? "var(--brand-purple)" : "transparent",
        }}
      >
        <Icon
          className={`w-7 h-7 transition-all duration-300 ${
            isActive
              ? "text-brand-cyan drop-shadow-[0_0_8px_rgba(0,242,255,0.5)]"
              : "text-default-400 group-hover:text-default-600"
          }`}
        />
        <span
          className={`text-[11px] font-semibold tracking-wide transition-colors duration-300 ${
            isActive
              ? "text-white"
              : "text-default-400 group-hover:text-default-600"
          }`}
        >
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <aside className="w-full h-full bg-background/60 backdrop-blur-xl border-r border-divider flex flex-col items-center overflow-hidden">
      {/* Fixed Logo Section */}
      <div className="py-6 flex flex-col items-center gap-2 group cursor-pointer shrink-0 w-full bg-background/10 backdrop-blur-md z-10 border-b border-divider/50">
        <div className="relative p-1">
          <div className="absolute -inset-1 bg-linear-to-r from-brand-cyan to-brand-purple rounded-full opacity-25"></div>
          <Image
            src="/images/logo.png"
            alt="Logo"
            width={40}
            height={40}
            className="relative w-10 h-10 object-contain"
          />
        </div>
        <span className="text-xs font-black tracking-[0.15em] bg-linear-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent uppercase text-center leading-tight mt-2">
          {APP_CONFIG.name}
        </span>
      </div>

      {/* Scrollable Navigation */}
      <nav className="flex flex-col w-full overflow-y-auto overflow-x-hidden scrollbar-hide flex-1">
        {menuItems.map(renderItem)}
      </nav>

      {/* Fixed Settings Section at Bottom */}
      <div className="w-full shrink-0 border-t border-divider/50 bg-background/10 backdrop-blur-md">
        {renderItem(settingsItem)}
      </div>
    </aside>
  );
};

export default Sidebar;
