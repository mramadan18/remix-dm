import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Sun,
  Moon,
  Minus,
  Square,
  X,
  Copy,
  Settings,
  RefreshCw,
  Terminal,
} from "lucide-react";
import {
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { useWindowControls } from "../../hooks/use-window-controls";

const Topbar = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { isMaximized, minimize, maximize, close, reload, toggleDevTools } =
    useWindowControls();

  // When mounted on client, now we can show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header
      className="h-14 w-full bg-background border-b border-divider flex items-center justify-between px-4 select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {/* Breadcrumb or Title Placeholder - keeping it clean for now */}
        <span className="text-sm font-bold tracking-tight text-foreground">
          JokerDL
        </span>
        <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/10 text-violet-500 rounded font-bold border border-violet-500/20">
          PRO
        </span>
      </div>

      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <Button
              isIconOnly
              variant="light"
              size="sm"
              className="text-default-500 hover:text-foreground"
            >
              <Settings size={18} />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Settings Menu" variant="flat">
            <DropdownItem
              key="reload"
              startContent={<RefreshCw size={16} />}
              onPress={reload}
            >
              Reload App
            </DropdownItem>
            <DropdownItem
              key="devtools"
              startContent={<Terminal size={16} />}
              onPress={toggleDevTools}
            >
              Developer Tools
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>

        <Button
          isIconOnly
          variant="light"
          size="sm"
          onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-default-500 hover:text-foreground"
        >
          {mounted ? (
            theme === "dark" ? (
              <Sun size={18} />
            ) : (
              <Moon size={18} />
            )
          ) : (
            <div className="w-[18px] h-[18px]" />
          )}
        </Button>

        <div className="w-px h-4 bg-divider mx-2" />

        <div className="flex items-center gap-1">
          <button
            onClick={minimize}
            className="p-2 text-default-500 hover:bg-default-100 rounded-md transition-colors focus:outline-none"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={maximize}
            className="p-2 text-default-500 hover:bg-default-100 rounded-md transition-colors focus:outline-none"
          >
            {isMaximized ? <Copy size={12} /> : <Square size={14} />}
          </button>
          <button
            onClick={close}
            className="p-2 text-default-500 hover:bg-danger/10 hover:text-danger rounded-md transition-colors focus:outline-none"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
