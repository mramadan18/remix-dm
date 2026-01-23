import { autoUpdater } from "electron-updater";
import { ipcMain, BrowserWindow } from "electron";
import { updaterLog } from "../utils/logger";

// Configure logging
autoUpdater.logger = updaterLog;

export class UpdateService {
  private static instance: UpdateService;
  private mainWindow: BrowserWindow | null = null;

  private constructor() {
    this.setupListeners();
  }

  public static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  public init(window: BrowserWindow) {
    this.mainWindow = window;

    // Check for updates on startup
    if (process.env.NODE_ENV === "production") {
      autoUpdater.checkForUpdatesAndNotify();
    }
  }

  private setupListeners() {
    autoUpdater.on("checking-for-update", () => {
      this.sendToWindow("update-status", {
        status: "checking",
        message: "Checking for updates...",
      });
    });

    autoUpdater.on("update-available", (info) => {
      this.sendToWindow("update-status", {
        status: "available",
        message: "Update available.",
        version: info.version,
      });
    });

    autoUpdater.on("update-not-available", (info) => {
      this.sendToWindow("update-status", {
        status: "up-to-date",
        message: "Application is up to date.",
        version: info.version,
      });
    });

    autoUpdater.on("error", (err) => {
      this.sendToWindow("update-status", {
        status: "error",
        message: `Update Error: ${err.message}`,
        error: err.message,
      });
    });

    autoUpdater.on("download-progress", (progressObj) => {
      this.sendToWindow("update-progress", progressObj);
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.sendToWindow("update-status", {
        status: "downloaded",
        message: "Update downloaded; will install now.",
        version: info.version,
      });
      // Optionally notify user and wait for restart
      // autoUpdater.quitAndInstall();
    });

    ipcMain.on("check-for-update", () => {
      if (process.env.NODE_ENV !== "production") {
        this.sendToWindow("update-status", {
          status: "error",
          message: "Update check is only available in the production build.",
          error: "Development mode detected",
        });
        return;
      }
      autoUpdater.checkForUpdates();
    });

    ipcMain.on("install-update", () => {
      autoUpdater.quitAndInstall();
    });
  }

  private sendToWindow(channel: string, ...args: any[]) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }
}
