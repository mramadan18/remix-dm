/**
 * Binary Manager
 * Handles downloading and managing the yt-dlp executable
 */

import { app } from "electron";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

interface BinaryInfo {
  path: string;
  version: string | null;
  lastUpdated: Date | null;
}

interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;

// Platform-specific binary names
const BINARY_NAMES: Record<string, string> = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp",
};

// GitHub release URLs for yt-dlp
const YTDLP_RELEASES_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";

/**
 * Get the binary storage directory
 */
export function getBinaryDirectory(): string {
  const userDataPath = app.getPath("userData");
  const binaryDir = path.join(userDataPath, "binaries");

  // Ensure directory exists
  if (!fs.existsSync(binaryDir)) {
    fs.mkdirSync(binaryDir, { recursive: true });
  }

  return binaryDir;
}

/**
 * Get the path to the yt-dlp binary
 */
export function getYtDlpPath(): string {
  const platform = process.platform;
  const binaryName = BINARY_NAMES[platform] || "yt-dlp";
  return path.join(getBinaryDirectory(), binaryName);
}

/**
 * Check if yt-dlp binary exists and is executable
 */
export function isBinaryAvailable(): boolean {
  const binaryPath = getYtDlpPath();

  if (!fs.existsSync(binaryPath)) {
    return false;
  }

  // On Windows, just check if file exists
  // On Unix, check if executable
  if (process.platform !== "win32") {
    try {
      fs.accessSync(binaryPath, fs.constants.X_OK);
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Get the current yt-dlp version
 */
export async function getYtDlpVersion(): Promise<string | null> {
  if (!isBinaryAvailable()) {
    return null;
  }

  return new Promise((resolve) => {
    const binaryPath = getYtDlpPath();
    const process = spawn(binaryPath, ["--version"]);
    let version = "";

    process.stdout.on("data", (data) => {
      version += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve(version.trim());
      } else {
        resolve(null);
      }
    });

    process.on("error", () => {
      resolve(null);
    });
  });
}

/**
 * Download a file from URL with progress tracking
 */
function downloadFile(
  url: string,
  destPath: string,
  onProgress?: ProgressCallback
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    const followRedirects = (currentUrl: string) => {
      https
        .get(currentUrl, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              followRedirects(redirectUrl);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(
              new Error(`Failed to download: HTTP ${response.statusCode}`)
            );
            return;
          }

          const totalSize = parseInt(
            response.headers["content-length"] || "0",
            10
          );
          let downloadedSize = 0;

          response.on("data", (chunk: Buffer) => {
            downloadedSize += chunk.length;
            if (onProgress && totalSize > 0) {
              onProgress({
                downloaded: downloadedSize,
                total: totalSize,
                percentage: Math.round((downloadedSize / totalSize) * 100),
              });
            }
          });

          response.pipe(file);

          file.on("finish", () => {
            file.close();
            resolve();
          });
        })
        .on("error", (err) => {
          fs.unlink(destPath, () => {}); // Delete incomplete file
          reject(err);
        });
    };

    followRedirects(url);
  });
}

/**
 * Download and install the yt-dlp binary
 */
export async function downloadYtDlp(
  onProgress?: ProgressCallback
): Promise<BinaryInfo> {
  const platform = process.platform;
  const binaryName = BINARY_NAMES[platform] || "yt-dlp";
  const downloadUrl = YTDLP_RELEASES_URL + binaryName;
  const destPath = getYtDlpPath();

  console.log(`Downloading yt-dlp from: ${downloadUrl}`);
  console.log(`Destination: ${destPath}`);

  // Download the binary
  await downloadFile(downloadUrl, destPath, onProgress);

  // Make executable on Unix systems
  if (process.platform !== "win32") {
    fs.chmodSync(destPath, 0o755);
  }

  // Verify and get version
  const version = await getYtDlpVersion();

  if (!version) {
    throw new Error("Downloaded binary is not functional");
  }

  console.log(`yt-dlp installed successfully: version ${version}`);

  return {
    path: destPath,
    version,
    lastUpdated: new Date(),
  };
}

/**
 * Update yt-dlp to the latest version
 */
export async function updateYtDlp(
  onProgress?: ProgressCallback
): Promise<BinaryInfo> {
  // First try using yt-dlp's built-in update
  if (isBinaryAvailable()) {
    try {
      const result = await runYtDlpSelfUpdate();
      if (result) {
        const version = await getYtDlpVersion();
        return {
          path: getYtDlpPath(),
          version,
          lastUpdated: new Date(),
        };
      }
    } catch (error) {
      console.log("Self-update failed, downloading fresh binary...");
    }
  }

  // Fall back to downloading fresh binary
  return downloadYtDlp(onProgress);
}

/**
 * Run yt-dlp's self-update command
 */
async function runYtDlpSelfUpdate(): Promise<boolean> {
  return new Promise((resolve) => {
    const binaryPath = getYtDlpPath();
    const process = spawn(binaryPath, ["-U"]);

    process.on("close", (code) => {
      resolve(code === 0);
    });

    process.on("error", () => {
      resolve(false);
    });
  });
}

/**
 * Get complete binary information
 */
export async function getBinaryInfo(): Promise<BinaryInfo> {
  const binaryPath = getYtDlpPath();
  const exists = isBinaryAvailable();

  if (!exists) {
    return {
      path: binaryPath,
      version: null,
      lastUpdated: null,
    };
  }

  const version = await getYtDlpVersion();
  const stats = fs.statSync(binaryPath);

  return {
    path: binaryPath,
    version,
    lastUpdated: stats.mtime,
  };
}

/**
 * Ensure yt-dlp is available (download if needed)
 */
export async function ensureYtDlp(
  onProgress?: ProgressCallback
): Promise<BinaryInfo> {
  if (isBinaryAvailable()) {
    return getBinaryInfo();
  }

  return downloadYtDlp(onProgress);
}

/**
 * Spawn a yt-dlp process with given arguments
 */
export function spawnYtDlp(args: string[]): ChildProcess {
  const binaryPath = getYtDlpPath();

  if (!isBinaryAvailable()) {
    throw new Error(
      "yt-dlp binary is not available. Please download it first."
    );
  }

  return spawn(binaryPath, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
}
