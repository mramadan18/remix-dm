/**
 * File Utilities
 * Helper functions for file operations and formatting
 */

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

/**
 * Get the default downloads directory
 */
export function getDefaultDownloadPath(): string {
  return app.getPath("downloads");
}

/**
 * Get a subdirectory in downloads for specific content types
 */
export function getDownloadSubPath(
  subDir: "videos" | "audio" | "playlists"
): string {
  const basePath = getDefaultDownloadPath();
  const subPath = path.join(basePath, "IDM-Clone", subDir);

  // Ensure directory exists
  if (!fs.existsSync(subPath)) {
    fs.mkdirSync(subPath, { recursive: true });
  }

  return subPath;
}

/**
 * Sanitize a filename to remove invalid characters
 */
export function sanitizeFilename(filename: string): string {
  // Characters not allowed in Windows filenames
  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/g;

  // Replace invalid characters with underscore
  let sanitized = filename.replace(invalidChars, "_");

  // Remove leading/trailing spaces and dots
  sanitized = sanitized.trim().replace(/^\.+|\.+$/g, "");

  // Limit filename length (leaving room for extension)
  const maxLength = 200;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Ensure filename is not empty
  if (!sanitized) {
    sanitized = "download";
  }

  return sanitized;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 B";
  if (!bytes || isNaN(bytes)) return "Unknown";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i]
  );
}

/**
 * Format bytes per second to human-readable speed string
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || isNaN(bytesPerSecond)) return "N/A";

  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));

  return (
    parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  );
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || isNaN(seconds)) return "Unknown";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * Format duration in seconds to HH:MM:SS format
 */
export function formatDurationHMS(seconds: number | null): string {
  if (seconds === null || isNaN(seconds)) return "--:--";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Format ETA in seconds to human-readable string
 */
export function formatETA(seconds: number | null): string {
  if (seconds === null || isNaN(seconds)) return "Calculating...";
  if (seconds < 0) return "Calculating...";
  if (seconds === 0) return "Almost done";

  if (seconds < 60) {
    return `${Math.ceil(seconds)}s left`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s left`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m left`;
}

/**
 * Format a number with thousand separators
 */
export function formatNumber(num: number | null): string {
  if (num === null || isNaN(num)) return "N/A";
  return num.toLocaleString();
}

/**
 * Format view count (e.g., 1.2M, 500K)
 */
export function formatViewCount(views: number | null): string {
  if (views === null || isNaN(views)) return "N/A";

  if (views >= 1000000000) {
    return (views / 1000000000).toFixed(1) + "B";
  }
  if (views >= 1000000) {
    return (views / 1000000).toFixed(1) + "M";
  }
  if (views >= 1000) {
    return (views / 1000).toFixed(1) + "K";
  }

  return views.toString();
}

/**
 * Format date to locale string
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return "Unknown";

  // Handle YYYYMMDD format from yt-dlp
  if (/^\d{8}$/.test(dateString)) {
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    const date = new Date(`${year}-${month}-${day}`);
    return date.toLocaleDateString();
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString();
}

/**
 * Get file extension from URL or filename
 */
export function getExtension(urlOrFilename: string): string {
  const url = new URL(urlOrFilename, "http://dummy");
  const pathname = url.pathname;
  const ext = path.extname(pathname);
  return ext.toLowerCase();
}

/**
 * Generate unique filename if file already exists
 */
export function generateUniqueFilename(dir: string, filename: string): string {
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  let counter = 0;
  let newFilename = filename;

  while (fs.existsSync(path.join(dir, newFilename))) {
    counter++;
    newFilename = `${baseName} (${counter})${ext}`;
  }

  return newFilename;
}

/**
 * Check if path is writable
 */
export function isPathWritable(dirPath: string): boolean {
  try {
    const testFile = path.join(dirPath, ".write-test-" + Date.now());
    fs.writeFileSync(testFile, "");
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get free disk space in bytes (simplified check)
 */
export async function getFreeDiskSpace(
  dirPath: string
): Promise<number | null> {
  try {
    // This is a simplified check - for accurate results, use a platform-specific library
    const stats = fs.statfsSync(dirPath);
    return stats.bfree * stats.bsize;
  } catch {
    return null;
  }
}

/**
 * Open file location in system file explorer
 */
export function openFileLocation(filePath: string): void {
  const { shell } = require("electron");
  shell.showItemInFolder(filePath);
}

/**
 * Open file with default application
 */
export function openFile(filePath: string): void {
  const { shell } = require("electron");
  shell.openPath(filePath);
}
