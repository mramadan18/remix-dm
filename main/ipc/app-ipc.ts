import { app, ipcMain } from "electron";
import { rendererLog } from "../utils/logger";

export function registerAppIpc() {
  ipcMain.on("get-app-version", (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.on("message", async (event, arg) => {
    event.reply("message", `${arg} World!`);
  });

  ipcMain.on("renderer-log", (event, { level, message, args }) => {
    const logger = (rendererLog as any)[level] || rendererLog.info;
    logger(message, ...args);
  });
}
