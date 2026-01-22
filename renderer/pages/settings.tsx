import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import {
  GeneralSettings,
  AppearanceSettings,
  NotificationSettings,
  EngineSettings,
  AboutSettings,
} from "../components/screens/Settings";

const SettingsPage = () => {
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

  // aria2 engine state
  const [aria2Info, setAria2Info] = useState<{
    path: string | null;
    available: boolean;
    running: boolean;
  } | null>(null);
  const [isRestartingAria2, setIsRestartingAria2] = useState(false);

  // ffmpeg engine state
  const [ffmpegInfo, setFfmpegInfo] = useState<{
    path: string | null;
    available: boolean;
  } | null>(null);

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

  const fetchAria2Info = useCallback(async () => {
    try {
      const result = await window.ipc.invoke("download:get-aria2-info", null);
      if (result.success && result.data) {
        setAria2Info(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch aria2 info:", error);
    }
  }, []);

  const fetchFfmpegInfo = useCallback(async () => {
    try {
      const result = await window.ipc.invoke("download:get-ffmpeg-info", null);
      if (result.success && result.data) {
        setFfmpegInfo(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch ffmpeg info:", error);
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

  const handleRestartAria2 = async () => {
    setIsRestartingAria2(true);
    try {
      const result = await window.ipc.invoke("download:restart-aria2", null);
      if (result.success) {
        await fetchAria2Info();
      }
    } catch (error) {
      console.error("Failed to restart aria2:", error);
    } finally {
      setIsRestartingAria2(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchBinaryInfo();
    fetchAria2Info();
    fetchFfmpegInfo();
  }, [fetchBinaryInfo, fetchAria2Info, fetchFfmpegInfo]);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="flex flex-col gap-6">
        <GeneralSettings />

        <AppearanceSettings
          theme={theme}
          setTheme={setTheme}
          mounted={mounted}
        />

        {/* <NotificationSettings /> */}

        <EngineSettings
          binaryInfo={binaryInfo}
          isUpdating={isUpdating}
          updateStatus={updateStatus}
          updateError={updateError}
          onUpdate={handleUpdateYtDlp}
          aria2Info={aria2Info}
          isRestartingAria2={isRestartingAria2}
          onRestartAria2={handleRestartAria2}
          ffmpegInfo={ffmpegInfo}
        />

        <AboutSettings />
      </div>
    </div>
  );
};

export default SettingsPage;
