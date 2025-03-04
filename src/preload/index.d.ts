import { ElectronAPI } from '@electron-toolkit/preload'

type IceServer = {
  urls: string
  username?: string
  credential?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    KulalaApi: {
      getAppVersion: () => Promise<string>
      pickFiles: () => Promise<FileInfo[]>
      sendRequest: (
        block: Block,
        requestSeparatorText: string
      ) => Promise<{ success: boolean; responseBody: string }>
    }
  }
}
