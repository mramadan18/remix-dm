export interface AppSettings {
  downloadPath: string;
  maxConcurrentDownloads: number;
  onFileExists: "overwrite" | "skip" | "rename";
  defaultQuality: string;
  defaultFormat: string;
}

export async function getSettings(): Promise<AppSettings> {
  return (window as any).ipc.invoke("settings:get");
}

export async function updateSettings(
  newSettings: Partial<AppSettings>,
): Promise<AppSettings> {
  return (window as any).ipc.invoke("settings:update", newSettings);
}

export async function getDefaultSettings(): Promise<AppSettings> {
  return (window as any).ipc.invoke("settings:get-defaults");
}

export async function selectDirectory(): Promise<string | null> {
  return (window as any).ipc.invoke("settings:select-directory");
}
