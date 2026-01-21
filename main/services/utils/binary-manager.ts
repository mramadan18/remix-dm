/**
 * Binary Manager
 * Handles downloading and managing the yt-dlp executable using yt-dlp-wrap
 * Also manages ffmpeg for merging video and audio streams
 */

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import YtDlpWrap from "yt-dlp-wrap";

// Import ffmpeg path from @ffmpeg-installer/ffmpeg
// This package bundles ffmpeg binaries for all platforms
let ffmpegPath: string | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpeg = require("@ffmpeg-installer/ffmpeg");
  let resolvedPath = ffmpeg.path;

  // For packaged apps, we MUST use the unpacked path for spawning
  if (
    resolvedPath &&
    resolvedPath.includes("app.asar") &&
    !resolvedPath.includes("app.asar.unpacked")
  ) {
    const unpackedPath = resolvedPath.replace("app.asar", "app.asar.unpacked");
    if (fs.existsSync(unpackedPath)) {
      resolvedPath = unpackedPath;
    }
  }

  ffmpegPath = resolvedPath;
  console.log("[BinaryManager] ffmpeg path:", ffmpegPath);
} catch (error) {
  console.warn("[BinaryManager] ffmpeg-installer not available:", error);
}

// Platform-specific binary names
const BINARY_NAMES: Record<string, string> = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp",
};

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
 * Get an instance of YtDlpWrap configured with the binary path
 */
export function getYtDlpWrap(): YtDlpWrap {
  return new YtDlpWrap(getYtDlpPath());
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
 * Download the latest yt-dlp binary
 */
export async function downloadYtDlp(): Promise<void> {
  const binaryPath = getYtDlpPath();
  console.log(`Downloading yt-dlp to: ${binaryPath}`);

  try {
    await YtDlpWrap.downloadFromGithub(binaryPath);

    // Make executable on Unix systems
    if (process.platform !== "win32") {
      fs.chmodSync(binaryPath, 0o755);
    }

    console.log("yt-dlp downloaded successfully");
  } catch (error) {
    console.error("Failed to download yt-dlp:", error);
    throw error;
  }
}

/**
 * Ensure yt-dlp is available (download if needed)
 */
export async function ensureYtDlp(): Promise<void> {
  if (isBinaryAvailable()) {
    return;
  }
  return downloadYtDlp();
}

/**
 * Get yt-dlp version
 */
export async function getYtDlpVersion(): Promise<string | null> {
  if (!isBinaryAvailable()) {
    return null;
  }
  try {
    const wrap = getYtDlpWrap();
    const version = await wrap.execPromise(["--version"]);
    return version.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get complete binary information
 */
export async function getBinaryInfo(): Promise<{
  path: string;
  version: string | null;
  lastUpdated: Date | null;
}> {
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
 * Update yt-dlp to the latest version
 */
export async function updateYtDlp(): Promise<void> {
  return downloadYtDlp();
}

/**
 * Get the path to the ffmpeg binary
 * Returns null if ffmpeg is not available
 */
export function getFfmpegPath(): string | null {
  return ffmpegPath;
}

/**
 * Check if ffmpeg is available
 */
export function isFfmpegAvailable(): boolean {
  if (!ffmpegPath) {
    return false;
  }

  try {
    return fs.existsSync(ffmpegPath);
  } catch {
    return false;
  }
}
