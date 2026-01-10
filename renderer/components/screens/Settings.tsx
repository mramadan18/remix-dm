import { useState, useEffect, useCallback } from "react";
import {
  Input,
  Button,
  Select,
  SelectItem,
  Switch,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Spinner,
  Chip,
} from "@heroui/react";
import {
  FolderOpen,
  Moon,
  Sun,
  Monitor,
  Download,
  RefreshCw,
  Check,
  AlertCircle,
} from "lucide-react";
import { useTheme } from "next-themes";

const Settings = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // yt-dlp binary state
  const [binaryInfo, setBinaryInfo] = useState<{
    path: string;
    version: string | null;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);

  const fetchBinaryInfo = useCallback(async () => {
    try {
      const result = await window.ipc.invoke("download:get-binary-info", null);
      if (result.success && result.data) {
        setBinaryInfo(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch binary info:", error);
    }
  }, []);

  const handleUpdateYtDlp = async () => {
    setIsUpdating(true);
    setUpdateStatus("idle");
    setUpdateError(null);

    try {
      const result = await window.ipc.invoke("download:update-binary", null);
      if (result.success) {
        setBinaryInfo(result.data);
        setUpdateStatus("success");
        setTimeout(() => setUpdateStatus("idle"), 3000);
      } else {
        setUpdateStatus("error");
        setUpdateError(result.error || "Update failed");
      }
    } catch (error) {
      setUpdateStatus("error");
      setUpdateError(error instanceof Error ? error.message : "Update failed");
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchBinaryInfo();
  }, [fetchBinaryInfo]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="flex flex-col gap-6">
        {/* General Settings */}
        <Card className="shadow-sm">
          <CardHeader className="font-bold text-lg px-6 pt-6">
            General
          </CardHeader>
          <CardBody className="px-6 pb-6 pt-2 flex flex-col gap-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-default-600">
                Download Path
              </label>
              <div className="flex gap-2">
                <Input
                  defaultValue="C:\Users\Admin\Downloads\VideoDownloader"
                  className="flex-1"
                />
                <Button isIconOnly variant="flat">
                  <FolderOpen size={20} />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select label="Default Quality" defaultSelectedKeys={["1080p"]}>
                <SelectItem key="4k">4K (Ultra HD)</SelectItem>
                <SelectItem key="1080p">1080p (Full HD)</SelectItem>
                <SelectItem key="720p">720p (HD)</SelectItem>
              </Select>
              <Select label="Default Format" defaultSelectedKeys={["mp4"]}>
                <SelectItem key="mp4">MP4</SelectItem>
                <SelectItem key="mkv">MKV</SelectItem>
                <SelectItem key="mp3">MP3</SelectItem>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-medium text-sm">
                  Max Concurrent Downloads
                </span>
                <span className="text-xs text-default-400">
                  Limit simultaneous downloads
                </span>
              </div>
              <Input
                type="number"
                defaultValue="3"
                className="w-24"
                min={1}
                max={10}
              />
            </div>
          </CardBody>
        </Card>

        {/* Appearance Settings */}
        <Card className="shadow-sm">
          <CardHeader className="font-bold text-lg px-6 pt-6">
            Appearance
          </CardHeader>
          <CardBody className="px-6 pb-6 pt-2 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-medium text-sm">Theme Mode</span>
                <span className="text-xs text-default-400">
                  Select your interface theme
                </span>
              </div>
              <div className="flex bg-default-100 p-1 rounded-lg">
                <Button
                  size="sm"
                  variant={mounted && theme === "light" ? "solid" : "light"}
                  color={mounted && theme === "light" ? "primary" : "default"}
                  onPress={() => setTheme("light")}
                  isIconOnly
                >
                  <Sun size={16} />
                </Button>
                <Button
                  size="sm"
                  variant={mounted && theme === "system" ? "solid" : "light"}
                  color={mounted && theme === "system" ? "primary" : "default"}
                  onPress={() => setTheme("system")}
                  isIconOnly
                >
                  <Monitor size={16} />
                </Button>
                <Button
                  size="sm"
                  variant={mounted && theme === "dark" ? "solid" : "light"}
                  color={mounted && theme === "dark" ? "primary" : "default"}
                  onPress={() => setTheme("dark")}
                  isIconOnly
                >
                  <Moon size={16} />
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Notification Settings */}
        <Card className="shadow-sm">
          <CardHeader className="font-bold text-lg px-6 pt-6">
            Notifications
          </CardHeader>
          <CardBody className="px-6 pb-6 pt-2 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span>Show completion notification</span>
              <Switch defaultSelected size="sm" />
            </div>
            <Divider />
            <div className="flex items-center justify-between">
              <span>Play sound on completion</span>
              <Switch size="sm" />
            </div>
          </CardBody>
        </Card>

        {/* yt-dlp Binary Settings */}
        <Card className="shadow-sm">
          <CardHeader className="font-bold text-lg px-6 pt-6">
            yt-dlp Engine
          </CardHeader>
          <CardBody className="px-6 pb-6 pt-2 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-sm">yt-dlp Version</span>
                <span className="text-xs text-default-400">
                  The core engine that powers video downloads
                </span>
              </div>
              <div className="flex items-center gap-3">
                {binaryInfo?.version ? (
                  <Chip size="sm" variant="flat" color="success">
                    v{binaryInfo.version}
                  </Chip>
                ) : (
                  <Chip size="sm" variant="flat" color="warning">
                    Not installed
                  </Chip>
                )}
              </div>
            </div>

            <Divider />

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-sm">Update yt-dlp</span>
                <span className="text-xs text-default-400">
                  Download the latest version to fix parsing issues
                </span>
              </div>
              <div className="flex items-center gap-2">
                {updateStatus === "success" && (
                  <Chip
                    size="sm"
                    color="success"
                    variant="flat"
                    startContent={<Check size={14} />}
                  >
                    Updated!
                  </Chip>
                )}
                {updateStatus === "error" && (
                  <Chip
                    size="sm"
                    color="danger"
                    variant="flat"
                    startContent={<AlertCircle size={14} />}
                  >
                    {updateError || "Failed"}
                  </Chip>
                )}
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  onPress={handleUpdateYtDlp}
                  isLoading={isUpdating}
                  startContent={!isUpdating && <RefreshCw size={16} />}
                >
                  {isUpdating ? "Updating..." : "Update Now"}
                </Button>
              </div>
            </div>

            {binaryInfo?.path && (
              <>
                <Divider />
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-default-400">
                    Binary location:
                  </span>
                  <code className="text-xs text-default-500 bg-default-100 px-2 py-1 rounded break-all">
                    {binaryInfo.path}
                  </code>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        {/* About JokerDL */}
        <Card className="shadow-xl bg-linear-to-br from-violet-600/10 to-fuchsia-600/10 border-violet-500/20">
          <CardBody className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-linear-to-br from-violet-600 to-fuchsia-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/20 mb-4">
              <Download className="text-white w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black bg-linear-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
              JokerDL
            </h2>
            <p className="text-xs font-bold text-violet-500/60 tracking-widest uppercase mb-4">
              Version 1.0.0 (Stable)
            </p>
            <p className="text-default-500 max-w-sm mb-6">
              JokerDL is a fast and powerful desktop video downloader built for
              simplicity and performance. Download your favorite content with
              just one click.
            </p>
            <div className="flex gap-4">
              <Button size="sm" variant="flat" color="secondary">
                Website
              </Button>
              <Button size="sm" variant="flat" color="secondary">
                Check Updates
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
