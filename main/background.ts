import path from "path";
import { app } from "electron";
import serve from "electron-serve";
import {
  createWindow,
  registerProtocolClient,
  handleProtocolUrl,
} from "./helpers";
import { registerIpcHandlers } from "./ipc";
import {
  startHistoryRecording,
  UpdateService,
  getFfmpegPath,
  isFfmpegAvailable,
} from "./services";

const isProd = process.env.NODE_ENV === "production";

let mainWindow: any;

// Register protocol handler
registerProtocolClient();

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // In production, if we don't get the lock, we quit.
  // In development, we continue so the new instance can signal the old one to quit.
  if (isProd) {
    app.quit();
  }
} else {
  app.on("second-instance", (event, commandLine) => {
    // If we are in development and a second instance starts,
    // the old instance (this one) should quit.
    if (!isProd) {
      app.exit();
      return;
    }

    // In production, someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Protocol handler for Windows
    const url = commandLine.pop();
    if (url && url.startsWith("remixdm://")) {
      handleProtocolUrl(url, mainWindow);
    }
  });

  if (isProd) {
    serve({ directory: "app" });
  } else {
    app.setPath("userData", `${app.getPath("userData")} (development)`);
  }

  (async () => {
    await app.whenReady();

    mainWindow = createWindow("main", {
      minWidth: 960,
      minHeight: 600,
      width: 1100,
      height: 720,
      titleBarOverlay: true,
      frame: false,
      center: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
      },
    });

    // Initialize Services & IPC
    initializeServices(mainWindow);

    if (isProd) {
      await mainWindow.loadURL("app://./home");
    } else {
      const port = process.argv[2];
      await mainWindow.loadURL(`http://localhost:${port}/home`);
      mainWindow.webContents.openDevTools();
    }

    // Check if app was opened with a protocol link on startup
    const url = process.argv.find((arg) => arg.startsWith("remixdm://"));
    if (url) {
      handleProtocolUrl(url, mainWindow);
    }
  })();
}

app.on("window-all-closed", () => {
  app.quit();
});

function initializeServices(window: any) {
  // Initialize Update Service
  UpdateService.getInstance().init(window);

  // Register IPC handlers
  registerIpcHandlers(window);

  // Start background services
  startHistoryRecording();

  // Check binary status
  logBinaryStatus();
}

function logBinaryStatus() {
  const ffmpegAvailable = isFfmpegAvailable();
  const ffmpegLocation = getFfmpegPath();
  console.log("[Background] ffmpeg available:", ffmpegAvailable);
  console.log("[Background] ffmpeg location:", ffmpegLocation);
}
