import { IpcHandler } from '../main/preload'

declare global {
  interface Window {
    ipc: IpcHandler & {
      getVersion(): string;
      log(level: string, message: any, ...args: any[]): void;
    }
  }
}
