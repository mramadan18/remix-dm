/**
 * Aria2 Manager
 * Handles managing the aria2 executable using @naria2/node
 * Provides centralized access to aria2 functionality
 */

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { ChildProcess, spawn } from "child_process";
import * as net from "net";
import { APP_CONFIG } from "../../../renderer/config/app-config";
import { settingsService } from "../settings.service";

// Get aria2 binary path based on platform
function resolveAria2Binary(): string | null {
  const platform = process.platform;
  const arch = process.arch;

  const mapping: Record<string, string> = {
    "win32-x64": "@naria2/win32-x64",
    "win32-ia32": "@naria2/win32-ia32",
    "darwin-x64": "@naria2/darwin-x64",
    "darwin-arm64": "@naria2/darwin-arm64",
    "linux-x64": "@naria2/linux-x64",
    "linux-arm64": "@naria2/linux-arm64",
  };

  const key = `${platform}-${arch}`;
  const packageName = mapping[key];

  if (!packageName) {
    console.warn(`[Aria2Manager] Unsupported platform: ${key}`);
    return "aria2c";
  }

  const binaryName = platform === "win32" ? "aria2c.exe" : "aria2c";

  // app.getAppPath() returns the path to the app directory or asar file
  const appPath = app.getAppPath();
  const unpackedPath = appPath.replace("app.asar", "app.asar.unpacked");

  const possiblePaths = [
    // 1. Production search: inside app.asar.unpacked (asarUnpack in electron-builder)
    path.join(unpackedPath, "node_modules", packageName, binaryName),
    path.join(unpackedPath, "node_modules", packageName, "bin", binaryName),

    // 2. Development search: relative to current working directory
    path.join(process.cwd(), "node_modules", packageName, binaryName),
    path.join(process.cwd(), "node_modules", packageName, "bin", binaryName),

    // 3. Fallback: try resolution via require
    (() => {
      try {
        const pkgJson = require.resolve(`${packageName}/package.json`);
        return path.join(path.dirname(pkgJson), binaryName);
      } catch {
        return "";
      }
    })(),
    (() => {
      try {
        const pkgJson = require.resolve(`${packageName}/package.json`);
        return path.join(path.dirname(pkgJson), "bin", binaryName);
      } catch {
        return "";
      }
    })(),
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      // For packaged apps, we MUST use the unpacked path for spawning
      const finalPath =
        p.includes("app.asar") && !p.includes("app.asar.unpacked")
          ? p.replace("app.asar", "app.asar.unpacked")
          : p;

      if (fs.existsSync(finalPath)) {
        console.log(`[Aria2Manager] Found aria2 binary at: ${finalPath}`);
        return finalPath;
      }
    }
  }

  console.warn(`[Aria2Manager] aria2 binary not found, using PATH fallback`);
  return "aria2c";
}

// Initialize aria2 path
let aria2Path: string | null = resolveAria2Binary();

// Aria2 RPC configuration
const ARIA2_RPC_PORT = 6800;
const ARIA2_RPC_SECRET = `${APP_CONFIG.name
  .toLowerCase()
  .replace(/\s+/g, "-")}-secret`;

// Global aria2 process reference
let aria2Process: ChildProcess | null = null;

/**
 * Get the path to the aria2 binary
 */
export function getAria2Path(): string | null {
  return aria2Path;
}

/**
 * Check if aria2 binary is available
 */
export function isAria2Available(): boolean {
  if (!aria2Path) {
    return false;
  }

  // If path is just "aria2c", assume it's in PATH (weak check)
  if (aria2Path === "aria2c") {
    return true;
  }

  try {
    return fs.existsSync(aria2Path);
  } catch {
    return false;
  }
}

/**
 * Get the session file path for aria2 resume support
 */
export function getAria2SessionPath(): string {
  const userDataPath = app.getPath("userData");
  const sessionDir = path.join(userDataPath, "aria2");

  // Ensure directory exists
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  return path.join(sessionDir, "aria2.session");
}

/**
 * Wait for the RPC port to be active
 */
async function waitForRPC(port: number, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isPortBusy(port)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for aria2 RPC on port ${port}`);
}

/**
 * Start aria2 RPC server as a child process
 */
export async function startAria2Daemon(): Promise<void> {
  if (!isAria2Available()) {
    throw new Error("aria2 binary not found");
  }

  // If already running, skip
  if (aria2Process && !aria2Process.killed) {
    console.log("[Aria2Manager] aria2 daemon already running");
    return;
  }

  const sessionPath = getAria2SessionPath();
  const userDataPath = app.getPath("userData");

  // Ensure session file exists
  if (!fs.existsSync(sessionPath)) {
    fs.writeFileSync(sessionPath, "");
  }

  // Kill any orphaned aria2 processes before starting a new one
  if (process.platform === "win32") {
    try {
      const { execSync } = require("child_process");
      execSync("taskkill /F /IM aria2c.exe", { stdio: "ignore" });
      console.log("[Aria2Manager] Cleaned up orphaned aria2 processes");
    } catch (e) {
      // Ignore error if no process found
    }
  }

  const args = [
    // RPC settings
    "--enable-rpc",
    `--rpc-listen-port=${ARIA2_RPC_PORT}`,
    `--rpc-secret=${ARIA2_RPC_SECRET}`,
    "--rpc-listen-all=false",
    "--rpc-allow-origin-all=false",
    "--rpc-max-request-size=10M",
    "--rpc-save-upload-metadata=true",

    // Session management
    `--input-file=${sessionPath}`,
    `--save-session=${sessionPath}`,
    "--save-session-interval=10", // Save every 10s for better recovery

    // Download optimization
    `--max-concurrent-downloads=${
      settingsService.getSettings().maxConcurrentDownloads
    }`,
    "--max-connection-per-server=8", // Optimal balance for stability and speed
    "--split=16",
    "--min-split-size=4M",
    "--continue=true",
    "--auto-file-renaming=true",
    "--allow-overwrite=true",
    "--file-allocation=falloc", // Fast allocation on Windows to prevent I/O hangs

    // Connection and retry
    "--connect-timeout=60",
    "--timeout=60",
    "--max-tries=0", // Infinite retries
    "--retry-wait=5",
    "--max-resume-failure-tries=0",

    // Resource management
    "--disk-cache=128M", // Large cache to prevent I/O saturation and hangs

    // Security and logging
    "--check-certificate=false",
    "--enable-color=false",
    "--console-log-level=warn",
    "--summary-interval=0", // Disable auto-save to avoid disk lock intervals

    // DNS
    "--async-dns=true", // Use asynchronous DNS resolution
    "--disable-ipv6=true", // Force IPv4 globally to avoid unreachable network errors
  ];

  return new Promise<void>((resolve, reject) => {
    try {
      aria2Process = spawn(aria2Path!, args, {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      // Prevent Windows from throttling the engine (Efficiency Mode)
      if (process.platform === "win32") {
        const { exec } = require("child_process");
        // Setting high priority prevents the OS from "sleeping" the process
        exec(
          `wmic process where name="aria2c.exe" CALL setpriority "high priority"`,
          { stdio: "ignore" },
        );
      }

      aria2Process.on("error", (error) => {
        console.error("[Aria2Manager] Failed to start aria2:", error);
        aria2Process = null;
        reject(error);
      });

      aria2Process.on("exit", (code, signal) => {
        console.log(
          `[Aria2Manager] aria2 exited with code ${code}, signal ${signal}`,
        );
        aria2Process = null;
      });

      aria2Process.stderr?.on("data", (data) => {
        const message = data.toString();
        console.error("[Aria2Manager] STDERR:", message.trim());
      });

      // Wait for the RPC server to be ready
      waitForRPC(ARIA2_RPC_PORT)
        .then(() => {
          if (aria2Process && !aria2Process.killed) {
            console.log("[Aria2Manager] aria2 daemon started successfully");
            resolve();
          } else {
            reject(new Error("aria2 process terminated unexpectedly"));
          }
        })
        .catch(reject);
    } catch (error) {
      console.error("[Aria2Manager] Error starting aria2:", error);
      reject(error);
    }
  });
}

/**
 * Check if the RPC port is being used
 */
export async function isPortBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Restart aria2 daemon with high reliability
 */
export async function restartAria2Daemon(): Promise<void> {
  console.log("[Aria2Manager] Initiating robust engine restart...");

  // 1. Force Kill with process tree cleanup
  if (process.platform === "win32") {
    try {
      const { execSync } = require("child_process");
      // Use /F (Force) /IM (Image Name) /T (Tree Kill)
      execSync("taskkill /F /IM aria2c.exe /T", { stdio: "ignore" });
      console.log("[Aria2Manager] Existing processes tree-killed.");
    } catch (e) {
      /* ignore */
    }
  } else {
    await stopAria2Daemon();
  }

  // 2. Cooldown period for OS resource release (TIME_WAIT release)
  console.log("[Aria2Manager] Cooldown for 2.5s...");
  await new Promise((r) => setTimeout(r, 2500));

  // 3. Bulletproof Port Check
  let retries = 3;
  while (retries > 0) {
    const busy = await isPortBusy(ARIA2_RPC_PORT);
    if (!busy) break;
    console.warn(
      `[Aria2Manager] Port ${ARIA2_RPC_PORT} still busy, waiting more...`,
    );
    await new Promise((r) => setTimeout(r, 2000));
    retries--;
  }

  // 4. Start fresh
  await startAria2Daemon();
  console.log("[Aria2Manager] Engine restarted successfully.");
}

/**
 * Stop aria2 daemon
 */
export async function stopAria2Daemon(): Promise<void> {
  if (aria2Process && !aria2Process.killed) {
    console.log("[Aria2Manager] Stopping aria2 daemon...");
    aria2Process.kill("SIGTERM");

    // Force kill if it doesn't stop after 2s
    const proc = aria2Process;
    setTimeout(() => {
      if (!proc.killed) proc.kill("SIGKILL");
    }, 2000);

    aria2Process = null;
  }
}

/**
 * Check if aria2 daemon is running
 */
export function isAria2DaemonRunning(): boolean {
  return aria2Process !== null && !aria2Process.killed;
}

/**
 * Ensure aria2 daemon is running
 */
export async function ensureAria2(): Promise<void> {
  if (!isAria2Available()) {
    throw new Error("aria2 binary not available");
  }

  if (!isAria2DaemonRunning()) {
    await startAria2Daemon();
  }
}

/**
 * Get aria2 RPC configuration
 */
export function getAria2RpcConfig(): {
  host: string;
  port: number;
  secret: string;
} {
  return {
    host: "localhost",
    port: ARIA2_RPC_PORT,
    secret: ARIA2_RPC_SECRET,
  };
}

/**
 * Get aria2 RPC URL
 */
export function getAria2RpcUrl(): string {
  return `ws://localhost:${ARIA2_RPC_PORT}/jsonrpc`;
}

/**
 * Get aria2 info
 */
export async function getAria2Info(): Promise<{
  path: string | null;
  available: boolean;
  running: boolean;
}> {
  return {
    path: aria2Path,
    available: isAria2Available(),
    running: isAria2DaemonRunning(),
  };
}
