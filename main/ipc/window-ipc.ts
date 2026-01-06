import { ipcMain, BrowserWindow } from "electron";

export const registerWindowIpc = (mainWindow: BrowserWindow) => {
  ipcMain.on("window-minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.on("window-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on("window-close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.on("get-window-state", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    event.returnValue = win?.isMaximized();
  });

  ipcMain.on("window-reload", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.reload();
  });

  ipcMain.on("window-devtools", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.webContents.toggleDevTools();
  });

  // Listen for window state changes and notify renderer
  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window-maximized", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window-maximized", false);
  });
};
