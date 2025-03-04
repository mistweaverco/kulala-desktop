import { ipcRenderer } from 'electron'
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { LayoutData, SessionState } from '../main/stateKeeper'
import { Block } from '../main/parser/DocumentParser'

type DBFilesRow = {
  collection: string
  filepath: string
}

type FileInfo = {
  name: string
  fullPath: string
  content: string
}

const KulalaApi = {
  getAppVersion: async (): Promise<string> => {
    return await ipcRenderer.invoke('getAppVersion')
  },
  pickFiles: async (cn: string): Promise<FileInfo[]> => {
    return await ipcRenderer.invoke('pickFiles', cn)
  },
  getCollectionNames: async (): Promise<string[]> => {
    return await ipcRenderer.invoke('getCollectionNames')
  },
  getFilesByCollectionName: async (cn: string): Promise<DBFilesRow[]> => {
    return await ipcRenderer.invoke('getFilesByCollectionName', cn)
  },
  getFileContent: async (fp: string): Promise<string> => {
    return await ipcRenderer.invoke('getFileContent', fp)
  },
  getDocument: async (fp: string): Promise<Document> => {
    return await ipcRenderer.invoke('getDocument', fp)
  },
  removeFileFromCollection: async (cn: string, fp: string): Promise<void> => {
    await ipcRenderer.invoke('removeFileFromCollection', cn, fp)
  },
  saveLayout: async (layout: { leftSectionWidth: number }): Promise<void> => {
    await ipcRenderer.invoke('saveLayout', layout)
  },
  getLayout: async (): Promise<LayoutData> => {
    return await ipcRenderer.invoke('getLayout')
  },
  saveSession: async (s: SessionState): Promise<void> => {
    await ipcRenderer.invoke('saveSession', s)
  },
  getSession: async (): Promise<SessionState> => {
    return await ipcRenderer.invoke('getSession')
  },
  saveDocumentModel: async (doc: Document, fp: string): Promise<boolean> => {
    return await ipcRenderer.invoke('saveDocumentModel', doc, fp)
  },
  sendRequest: async (block: Block): Promise<{ success: boolean; responseBody: string }> => {
    return await ipcRenderer.invoke('sendRequest', block)
  }
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('KulalaApi', KulalaApi)
} catch (error) {
  console.error(error)
}
