/// <reference types="svelte" />
/// <reference types="vite/client" />
import { ElectronAPI } from '@electron-toolkit/preload'
import type { Document } from '../../main/parser/DocumentParser'
import type { LayoutData, SessionState } from '../../main/stateKeeper'

declare global {
  interface Window {
    electron: ElectronAPI
    KulalaApi: {
      getAppVersion: () => Promise<string>
      pickFiles: (cn: string) => Promise<FileInfo[]>
      getCollectionNames: () => Promise<string[]>
      getFilesByCollectionName: (cn: string) => Promise<DBFilesRow[]>
      getFileContent: (fp: string) => Promise<string>
      getDocument: (fp: string) => Promise<Document>
      removeFileFromCollection: (cn: string, fp: string) => Promise<void>
      saveLayout: (layout: { leftSectionWidth: number }) => Promise<void>
      getLayout: () => Promise<LayoutData>
      saveSession: (s: SessionState) => Promise<void>
      getSession: () => Promise<SessionState>
      saveDocumentModel: (doc: Document, fp: string) => Promise<boolean>
    }
  }
}
