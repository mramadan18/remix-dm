import { BrowserWindow } from "electron";
import { registerWindowIpc } from "./window-ipc";
import { registerShellIpc } from "./shell-ipc";
import { initializeDownloadIpc } from "./download-ipc";
import { initializeHistoryIpc } from "./history-ipc";
import { initializeSettingsIpc } from "./settings-ipc";
import { registerAppIpc } from "./app-ipc";

/**
 * Register all IPC handlers for the application
 */
export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // Register window-specific IPC (minimize, maximize, close)
  registerWindowIpc(mainWindow);

  // Register other IPC handlers
  registerShellIpc();
  registerAppIpc();
  initializeDownloadIpc();
  initializeHistoryIpc();
  initializeSettingsIpc();
}

export * from "./app-ipc";
export * from "./download-ipc";
export * from "./history-ipc";
export * from "./settings-ipc";
export * from "./shell-ipc";
export * from "./window-ipc";
