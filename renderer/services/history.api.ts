import { HistoryRecord } from "../types/history";

export async function getHistory(): Promise<HistoryRecord[]> {
  return (window as any).ipc.invoke("history:get", null);
}

export async function deleteHistoryRecord(
  id: string,
  deleteFile: boolean,
): Promise<void> {
  return (window as any).ipc.invoke("history:delete", { id, deleteFile });
}

export async function clearHistory(): Promise<void> {
  return (window as any).ipc.invoke("history:clear", null);
}

export async function openHistoryFile(path: string): Promise<boolean> {
  return (window as any).ipc.invoke("history:open-file", path);
}

export async function openHistoryFolder(path: string): Promise<boolean> {
  return (window as any).ipc.invoke("history:open-folder", path);
}
