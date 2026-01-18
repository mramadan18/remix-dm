/**
 * URL Detection Service
 * Detects whether a URL is a direct download or requires yt-dlp processing
 * Uses HEAD requests to analyze Content-Type headers
 */

import * as http from "http";
import * as https from "https";
import * as net from "net";
import { promises as dns } from "dns";
import { URL } from "url";
import * as path from "path";
import { DetectionMode } from "../types";

/**
 * Result of link type detection
 */
export interface LinkTypeResult {
  isDirect: boolean;
  contentType?: string;
  contentLength?: number;
  filename?: string;
  reason: string;
}

/**
 * Content types that indicate direct downloads (use aria2)
 */
const DIRECT_DOWNLOAD_CONTENT_TYPES = [
  // Archives
  "application/zip",
  "application/x-zip",
  "application/x-zip-compressed",
  "application/x-rar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-gzip",
  "application/x-bzip2",
  "application/x-xz",

  // General binary
  "application/octet-stream",

  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument",

  // Executables & Installers
  "application/x-msdownload",
  "application/x-msi",
  "application/x-deb",
  "application/x-rpm",
  "application/x-apple-diskimage",

  // Images (large files that might be downloaded)
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/tiff",
  "image/bmp",

  // Direct video/audio files (not streaming pages)
  "video/mp4",
  "video/x-msvideo",
  "video/x-matroska",
  "video/quicktime",
  "video/x-flv",
  "video/webm",
  "video/3gpp",
  "video/mpeg",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/flac",
  "audio/aac",
  "audio/ogg",
  "audio/x-m4a",
  "audio/webm",

  // ISO/Disk images
  "application/x-iso9660-image",
];

/**
 * Content types that indicate web pages (use yt-dlp)
 */
const WEB_PAGE_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/xml",
  "application/xml",
];

/**
 * Video platform hostnames (always use yt-dlp)
 */
const VIDEO_PLATFORM_HOSTNAMES = [
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "tiktok.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "fb.watch",
  "vimeo.com",
  "dailymotion.com",
  "dai.ly",
  "twitch.tv",
  "soundcloud.com",
  "bandcamp.com",
  "vk.com",
  "bilibili.com",
  "nicovideo.jp",
];

/**
 * File extensions that are typically direct downloads
 */
const DIRECT_DOWNLOAD_EXTENSIONS = [
  // Archives
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".tgz",

  // Executables
  ".exe",
  ".msi",
  ".deb",
  ".rpm",
  ".dmg",
  ".pkg",
  ".appimage",
  ".vspackage",
  ".vsix",

  // Documents
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",

  // Media files (when accessed directly)
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".ogg",
  ".m4a",

  // Images
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".tiff",

  // ISO/Disk images
  ".iso",
  ".img",
];

/**
 * Extract filename from Content-Disposition header
 */
function extractFilenameFromHeader(
  contentDisposition: string | undefined,
): string | undefined {
  if (!contentDisposition) return undefined;

  try {
    // Try RFC 5987 format first: filename*=UTF-8''encoded-filename
    const rfc5987Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (rfc5987Match) {
      try {
        return decodeURIComponent(rfc5987Match[1]);
      } catch {
        // If decoding fails, return as-is
        return rfc5987Match[1];
      }
    }

    // Try standard format: filename="example.zip" or filename=example.zip
    const standardMatch = contentDisposition.match(
      /filename\s*=\s*["']?([^"';]+)["']?/i,
    );
    if (standardMatch) {
      const filename = standardMatch[1].trim();
      // Remove quotes if present
      const cleaned = filename.replace(/^["']|["']$/g, "");
      try {
        return decodeURIComponent(cleaned);
      } catch {
        return cleaned;
      }
    }
  } catch (error) {
    console.warn(
      "[URLDetection] Failed to extract filename from header:",
      error,
    );
  }

  return undefined;
}

/**
 * Extract filename from URL path
 */
function getFilenameFromUrl(url: string): string | undefined {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = path.basename(pathname);
    if (filename && filename.includes(".") && filename.length > 3) {
      try {
        return decodeURIComponent(filename);
      } catch {
        return filename;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Check if hostname is a known video platform
 */
function isVideoPlatform(hostname: string): boolean {
  if (!hostname) return false;
  const normalizedHostname = hostname.toLowerCase().replace(/^www\./, "");

  return VIDEO_PLATFORM_HOSTNAMES.some((platform) => {
    // Exact match or subdomain match only (e.g., m.youtube.com)
    return (
      normalizedHostname === platform ||
      normalizedHostname.endsWith("." + platform)
    );
  });
}

/**
 * Check if URL points to a private/internal network (SSRF protection)
 */
async function isPrivateUrl(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Check for localhost variations
    if (
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "0.0.0.0"
    ) {
      return true;
    }

    let ip = hostname;

    // If hostname is not an IP literal, resolve it
    if (!net.isIP(hostname)) {
      try {
        const result = await dns.lookup(hostname);
        ip = result.address;
      } catch {
        // If DNS lookup fails, invalid domain
        return false;
      }
    } else {
      // If it looks like an IP but net.isIP says 0 (invalid) it might be decimal/hex
      // But net.isIP returns 4 or 6.
      // We should normalize it.
      // Actually, dns.lookup handles IP literals too and normalizes them!
      // So we can just call dns.lookup on everything.
      try {
        const result = await dns.lookup(hostname);
        ip = result.address;
      } catch {
        return true; // Suspicious if it looked like an IP but failed
      }
    }

    // Now check the IP
    // IPv4
    if (net.isIPv4(ip)) {
      const parts = ip.split(".").map(Number);
      const [a, b, c, d] = parts;

      // 127.0.0.0/8 (loopback)
      if (a === 127) return true;

      // 10.0.0.0/8 (private)
      if (a === 10) return true;

      // 172.16.0.0/12 (private)
      if (a === 172 && b >= 16 && b <= 31) return true;

      // 192.168.0.0/16 (private)
      if (a === 192 && b === 168) return true;

      // 169.254.0.0/16 (link-local)
      if (a === 169 && b === 254) return true;

      // 0.0.0.0/8 (current network)
      if (a === 0) return true;
    }

    // IPv6
    if (net.isIPv6(ip)) {
      // ::1 (loopback)
      if (ip === "::1") return true;
      // fe80::/10 (link-local)
      if (ip.toLowerCase().startsWith("fe80:")) return true;
      // fc00::/7 (unique local)
      if (
        ip.toLowerCase().startsWith("fc") ||
        ip.toLowerCase().startsWith("fd")
      )
        return true;
    }

    return false;
  } catch {
    return true; // If URL parsing fails, treat as unsafe
  }
}

/**
 * Validate URL protocol (only allow http/https)
 */
function isValidProtocol(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Get file extension from URL path
 */
function getExtensionFromUrl(url: string): string | undefined {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const lastDot = pathname.lastIndexOf(".");
    if (lastDot !== -1 && lastDot > pathname.lastIndexOf("/")) {
      return pathname.substring(lastDot).toLowerCase();
    }
  } catch {
    // Invalid URL
  }
  return undefined;
}

/**
 * Check if content type indicates a direct download
 */
function isDirectDownloadContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const normalizedType = contentType.toLowerCase().split(";")[0].trim();
  return DIRECT_DOWNLOAD_CONTENT_TYPES.some(
    (type) => normalizedType === type || normalizedType.startsWith(type + "/"),
  );
}

/**
 * Check if content type indicates a web page
 */
function isWebPageContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const normalizedType = contentType.toLowerCase().split(";")[0].trim();
  return WEB_PAGE_CONTENT_TYPES.some(
    (type) => normalizedType === type || normalizedType.startsWith(type),
  );
}

/**
 * Perform HEAD request to detect link type
 */
async function performHeadRequest(
  url: string,
  maxRedirects: number = 5,
): Promise<{
  contentType?: string;
  contentLength?: number;
  contentDisposition?: string;
  finalUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === "https:" ? https : http;

    const options = {
      method: "HEAD",
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        Referer: url, // Many sites require the URL itself as referer to return headers
      },
      timeout: 5000,
      rejectUnauthorized: false,
    };

    const req = protocol.request(options, async (res) => {
      try {
        // Handle redirects
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (maxRedirects <= 0) {
            reject(new Error("Too many redirects"));
            return;
          }

          // Resolve relative URLs
          const redirectUrl = new URL(res.headers.location, url).toString();

          // SSRF Protection: Block redirects to private/internal networks
          if (!isValidProtocol(redirectUrl)) {
            reject(new Error("Redirect to invalid protocol blocked"));
            return;
          }

          if (await isPrivateUrl(redirectUrl)) {
            reject(
              new Error(
                "Redirect to private network blocked (SSRF protection)",
              ),
            );
            return;
          }

          performHeadRequest(redirectUrl, maxRedirects - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        resolve({
          contentType: res.headers["content-type"],
          contentLength: res.headers["content-length"]
            ? parseInt(res.headers["content-length"], 10)
            : undefined,
          contentDisposition: res.headers["content-disposition"],
          finalUrl: url,
        });
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.end();
  });
}

/**
 * Detect link type using HEAD request and fallback logic
 * @param url The URL to analyze
 * @param mode Force detection mode (auto, direct, or video)
 * @returns LinkTypeResult with detection result
 */
export async function detectLinkType(
  url: string,
  mode: DetectionMode = "auto",
): Promise<LinkTypeResult> {
  try {
    // 0. If mode is forced to video, return non-direct immediately
    if (mode === "video") {
      return {
        isDirect: false,
        reason: "Forced video mode",
      };
    }

    // Validate URL format and protocol
    if (!isValidProtocol(url)) {
      return {
        isDirect: false,
        reason: "Only HTTP and HTTPS protocols are supported",
      };
    }

    // SSRF Protection: Block private/internal network URLs
    if (await isPrivateUrl(url)) {
      return {
        isDirect: false,
        reason:
          "Private/internal network URLs are not allowed (SSRF protection)",
      };
    }

    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // 1. First check if it's a known video platform
    if (isVideoPlatform(hostname)) {
      const extension = getExtensionFromUrl(url);

      // Allow known direct file extensions to bypass the early rejection
      const isLikelyDirectFile =
        extension && DIRECT_DOWNLOAD_EXTENSIONS.includes(extension);

      if (!isLikelyDirectFile && mode === "direct") {
        // If it's a known video platform AND we don't have a direct extension,
        // it's likely a watch page, so we reject it in direct mode.
        return {
          isDirect: false,
          reason: "VIDEO_LINK_IN_DIRECT_MODE",
        };
      }

      // In auto/video mode, if it's a known platform, we assume it's a video
      // unless it clearly looks like a file extension we want to check via HEAD.
      if (!isLikelyDirectFile) {
        return {
          isDirect: false,
          reason: "Known video platform",
        };
      }
    }
    // If it's NOT a known video platform, we ALWAYS proceed to step 2 (HEAD request)
    // This allows sites like visualstudio.com to be handled correctly regardless of URL path.

    // 2. Try HEAD request for accurate detection
    try {
      let headResult;
      try {
        headResult = await performHeadRequest(url);
      } catch (err) {
        // Retry logic for timeout
        if (
          err instanceof Error &&
          (err.message === "Request timeout" ||
            err.message.includes("ETIMEDOUT"))
        ) {
          console.log("[URLDetection] Timeout, retrying HEAD request...");
          headResult = await performHeadRequest(url);
        } else {
          throw err;
        }
      }

      // Check Content-Type
      if (headResult.contentType) {
        const isWebPage = isWebPageContentType(headResult.contentType);
        const isDirectDownload = isDirectDownloadContentType(
          headResult.contentType,
        );

        if (isWebPage) {
          if (mode === "direct") {
            return {
              isDirect: false,
              reason: "WEB_PAGE_IN_DIRECT_MODE",
            };
          }
          return {
            isDirect: false,
            contentType: headResult.contentType,
            reason: "Content-Type indicates web page",
          };
        }

        if (isDirectDownload) {
          return {
            isDirect: true,
            contentType: headResult.contentType,
            contentLength: headResult.contentLength,
            filename:
              extractFilenameFromHeader(headResult.contentDisposition) ||
              getFilenameFromUrl(url),
            reason: "Content-Type indicates direct download",
          };
        }
      }

      // If Content-Disposition has filename, likely direct download
      if (headResult.contentDisposition) {
        const filename = extractFilenameFromHeader(
          headResult.contentDisposition,
        );
        if (filename) {
          return {
            isDirect: true,
            contentType: headResult.contentType,
            contentLength: headResult.contentLength,
            filename,
            reason: "Content-Disposition header indicates file download",
          };
        }
      }
    } catch (headError) {
      // Some servers block HEAD with 401/403/404; treat as normal fallback without noisy logs
      const message =
        headError instanceof Error ? headError.message : String(headError);
      const silentCodes = [
        "HTTP 401",
        "HTTP 403",
        "HTTP 404",
        "Request timeout",
      ];
      const shouldLog = !silentCodes.some((code) => message.includes(code));
      if (shouldLog) {
        console.warn(
          "[URLDetection] HEAD request failed, using fallback:",
          headError,
        );
      }
      // Continue to fallback logic
    }

    // 3. Fallback: Check URL extension
    const extension = getExtensionFromUrl(url);
    if (extension && DIRECT_DOWNLOAD_EXTENSIONS.includes(extension)) {
      return {
        isDirect: true,
        filename: getFilenameFromUrl(url),
        reason: `File extension ${extension} indicates direct download`,
      };
    }

    // 4. Default Decision
    if (mode === "direct") {
      return {
        isDirect: true,
        reason:
          "Defaulting to direct download for unknown link type in direct mode",
      };
    }

    // Default for auto/video: Assume yt-dlp can handle it (safer default for video extraction)
    return {
      isDirect: false,
      reason: "Unknown link type, defaulting to yt-dlp",
    };
  } catch (error) {
    console.error("[URLDetection] Error detecting link type:", error);
    // On error, default to yt-dlp as it can handle more cases
    return {
      isDirect: false,
      reason: `Detection error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

/**
 * Batch detect multiple URLs
 * @param urls Array of URLs to analyze
 * @returns Map of URL to LinkTypeResult
 */
export async function detectMultipleLinkTypes(
  urls: string[],
): Promise<Map<string, LinkTypeResult>> {
  const results = new Map<string, LinkTypeResult>();

  // Process in parallel with concurrency limit
  const concurrencyLimit = 5;
  const chunks: string[][] = [];

  for (let i = 0; i < urls.length; i += concurrencyLimit) {
    chunks.push(urls.slice(i, i + concurrencyLimit));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(async (url) => {
        const result = await detectLinkType(url);
        return { url, result };
      }),
    );

    for (const { url, result } of chunkResults) {
      results.set(url, result);
    }
  }

  return results;
}
