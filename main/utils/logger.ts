import log from "electron-log";
import { app } from "electron";
import path from "path";

/**
 * Split logger configuration (Main, Renderer, Updater)
 * Using electron-log v5
 */

const logsPath = app ? path.join(app.getPath("userData"), "logs") : "";

// 1. Main Logger (default)
const mainLog = log.create({ logId: "main" });
mainLog.transports.file.resolvePathFn = () => path.join(logsPath, "main.log");

// 2. Renderer Logger
export const rendererLog = log.create({ logId: "renderer" });
rendererLog.transports.file.resolvePathFn = () =>
  path.join(logsPath, "renderer.log");

// 3. Updater Logger
export const updaterLog = log.create({ logId: "updater" });
updaterLog.transports.file.resolvePathFn = () =>
  path.join(logsPath, "updater.log");

// Common configuration for all loggers
[mainLog, rendererLog, updaterLog].forEach((logger) => {
  logger.transports.file.level = "info";
  logger.transports.console.level = "debug";
  logger.transports.file.format =
    "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

  // Limit file size to 5MB to save user disk space
  logger.transports.file.maxSize = 5 * 1024 * 1024;

  // Simple rotation: Keep only the current log and one .old log
  logger.transports.file.archiveLogFn = (oldFile) => {
    const file = oldFile.toString();
    const info = path.parse(file);
    try {
      const fs = require("fs");
      const oldLogPath = path.join(info.dir, info.name + ".old" + info.ext);
      if (fs.existsSync(file)) {
        if (fs.existsSync(oldLogPath)) {
          fs.unlinkSync(oldLogPath); // Remove the previous .old log
        }
        fs.renameSync(file, oldLogPath);
      }
    } catch (e) {
      console.warn("Could not archive log", e);
    }
  };
});

// Start catching unhandled errors for the main process
try {
  mainLog.errorHandler.startCatching();
} catch (e) {
  // Already started
}

// Log initial app info in main.log
try {
  mainLog.info("-------------------------------------------");
  mainLog.info(
    `App Starting: ${app.name || "remix-dm"} v${app.getVersion()}`,
  );
  mainLog.info(`OS: ${process.platform} (${process.arch})`);
  mainLog.info("-------------------------------------------");
} catch (e) {
  mainLog.info("App starting...");
}

export default mainLog;
