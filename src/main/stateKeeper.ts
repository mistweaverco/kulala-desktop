import { screen } from 'electron'
import settings from 'electron-settings'
import { debounce } from './utils'

export type LayoutData = {
  leftSectionWidth: number
}

type WindowState = {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

type WindowStateKeeper = WindowState & {
  track: (win: Electron.BrowserWindow) => void
}

export interface SessionState {
  activeCollectionName: string | null
  activeFileFilepath: string | null
  activeRequestIdx: number | null
}

interface SessionStateKeeper {
  saveState: (s: SessionState) => Promise<void>
  getState: () => Promise<SessionState>
}

export const sessionStateKeeper = async (): Promise<SessionStateKeeper> => {
  let sessionState: SessionState
  const hasState = await settings.has('session')
  if (hasState) {
    sessionState = (await settings.get('session')) as unknown as SessionState
  } else {
    sessionState = {
      activeCollectionName: null,
      activeFileFilepath: null,
      activeRequestIdx: null
    }
  }

  const saveState = async (s: SessionState): Promise<void> => {
    await settings.set('session', {
      ...s
    })
  }

  const getState = async (): Promise<SessionState> => {
    return sessionState
  }

  return {
    saveState,
    getState
  }
}

interface LayoutStateKeeper {
  saveState: (s: LayoutData) => Promise<void>
  getLayout: () => Promise<LayoutData>
}

export const layoutStateKeeper = async (): Promise<LayoutStateKeeper> => {
  let layoutState: LayoutData
  const hasState = await settings.has('layout')
  if (hasState) {
    layoutState = (await settings.get('layout')) as unknown as LayoutData
  } else {
    layoutState = {
      leftSectionWidth: 320
    }
  }

  const saveState = async (s: LayoutData): Promise<void> => {
    await settings.set('layout', s)
  }

  const getLayout = async (): Promise<LayoutData> => {
    return layoutState
  }

  return {
    saveState,
    getLayout
  }
}

export const windowStateKeeper = async (windowName: string): Promise<WindowStateKeeper> => {
  let window: Electron.BrowserWindow
  let windowState: WindowState

  const setBounds = async (): Promise<WindowState> => {
    const hasState = await settings.has(`windowState.${windowName}`)
    if (hasState) {
      return (await settings.get(`windowState.${windowName}`)) as unknown as WindowState
    }

    const size = screen.getPrimaryDisplay().workAreaSize

    const width = size.width / 2 > 1024 ? size.width / 2 : 1024
    const height = size.height / 2 > 768 ? size.height / 2 : 768

    return {
      width,
      height,
      isMaximized: false
    }
  }

  const saveState = async (): Promise<void> => {
    const bounds = window.getBounds()
    windowState = {
      ...bounds,
      isMaximized: window.isMaximized()
    }
    await settings.set(`windowState.${windowName}`, windowState)
  }

  const track = async (win: Electron.BrowserWindow): Promise<void> => {
    window = win
    win.on('move', debounce(saveState, 400))
    win.on('resize', debounce(saveState, 400))
    win.on('unmaximize', debounce(saveState, 400))
  }

  windowState = await setBounds()

  return {
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    isMaximized: windowState.isMaximized,
    track
  }
}
