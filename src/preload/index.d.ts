import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: ElectronAPI;
    KulalaApi: {
      getAppVersion: () => Promise<string>;
      pickFolders: (collectionName: string) => Promise<void>;
      createCollection: (name: string) => Promise<{ ok: boolean; err?: string }>;
    };
  }
}
