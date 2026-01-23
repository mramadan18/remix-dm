import { ipcMain, shell, app } from "electron";
import path from "path";

export function registerShellIpc(): void {
  /**
   * Open logs folder
   */
  ipcMain.handle("shell:open-logs", async () => {
    try {
      const logsPath = path.join(app.getPath("userData"), "logs");
      const error = await shell.openPath(logsPath);
      return { success: !error, error };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });

  /**
   * Open a file or folder in the default application
   */
  ipcMain.handle("shell:open-path", async (_, path: string) => {
    try {
      const error = await shell.openPath(path);
      return { success: !error, error };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });

  /**
   * Show a file in its containing folder
   */
  ipcMain.handle("shell:show-item-in-folder", async (_, path: string) => {
    try {
      shell.showItemInFolder(path);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });

  /**
   * Open an external URL in the default browser
   */
  ipcMain.handle("shell:open-external", async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });
}
