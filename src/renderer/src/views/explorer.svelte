<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte'
  import type {
    CollectionIndexItem,
    PromptRequest,
    RequestFormModel,
    ResponseEntry
  } from '../env.d'
  import {
    buildRunContext,
    docToFormModels,
    fingerprintFormModels,
    insertEmptyRequestBlock,
    isSessionDirty,
    loadDocument,
    nativeBlocks,
    removeNativeRequestBlock,
    reorderNativeRequestBlocks,
    saveSessionToFile,
    syncFormIntoModels,
    toPlainDocument,
    toPlainForm
  } from '../kulala/document-model'
  import type { CompletionContextOpts } from '../kulala/completion/context'
  import AppShell from '../components/layout/AppShell.svelte'
  import Dialog from '../components/ui/Dialog.svelte'
  import Button from '../components/ui/Button.svelte'
  import Input from '../components/ui/Input.svelte'
  import Label from '../components/ui/Label.svelte'
  import Select from '../components/ui/Select.svelte'
  import CollectionSidebar from './explorer/CollectionSidebar.svelte'
  import RequestPanel from './explorer/RequestPanel.svelte'
  import ResponsePanel from './explorer/ResponsePanel.svelte'
  import PromptDialog from './explorer/PromptDialog.svelte'
  import RequestTabBar from './explorer/RequestTabBar.svelte'
  import type { FileSession, FormTab, RequestTab, TabResponseState } from './explorer/session'
  import { emptyTabResponseState, parseRequestTabId, requestTabId } from './explorer/session'
  import { evictFilepathEditors, evictTabEditors } from '../kulala/monaco-editor-cache'

  let collectionsIndex = $state<CollectionIndexItem[]>([])
  let sidebarRefreshKey = $state(0)

  let isRunning = $state(false)
  let errorMessage = $state('')
  let showError = $state(false)
  let showLoading = $state(false)
  let showAddFolder = $state(false)
  let folderAttachNotice = $state('')
  let showRemoveCollection = $state(false)
  let showRename = $state(false)
  let showCreateSubcollection = $state(false)
  let showCreateCollection = $state(false)
  let showDetachFolder = $state(false)
  let showCloseTabConfirm = $state(false)
  let pendingCloseTabId = $state<string | undefined>()
  let renameTarget = $state<'collection' | 'file' | 'block'>('file')
  let renameValue = $state('')
  let renameError = $state('')
  let renameCollectionName = $state('')
  let removeCollectionName = $state('')
  let renameFileTarget = $state({ name: '', filepath: '' })
  let renameBlockTarget = $state({ filepath: '', blockIndex: 0, blockName: '' })
  let showDeleteBlockConfirm = $state(false)
  let deleteBlockTarget = $state<{
    file: { name: string; filepath: string }
    blockIndex: number
    blockName: string
  } | null>(null)
  let showDeletePathConfirm = $state(false)
  let deletePathTarget = $state<
    | { kind: 'file'; filepath: string; label: string }
    | { kind: 'folder'; dirPath: string; label: string }
    | null
  >(null)
  let renameInputRef = $state<HTMLInputElement | undefined>(undefined)
  let showInspect = $state(false)
  let inspectContent = $state('')
  let showPasteCurl = $state(false)
  let pasteCurlHttp = $state('')
  let pasteCurlRequestName = $state('')
  let pasteCurlNameError = $state('')
  let showCreateFile = $state(false)
  let showCreateFileFolderPicker = $state(false)
  let createFileDirPath = $state('')
  let createFileName = $state('')
  let createFileError = $state('')
  let createFileInputRef = $state<HTMLInputElement | undefined>(undefined)
  let createFileFolderValue = $state('')
  let createFileFolderOptions = $state<Array<{ value: string; label: string }>>([])
  let createFileFolderSelectRef = $state<HTMLButtonElement | undefined>(undefined)

  let pickCollectionValue = $state('')
  let selectedCollectionName = $state('')

  let createSubcollectionParent = $state('')
  let createSubcollectionName = $state('')
  let createSubcollectionError = $state('')

  let createCollectionName = $state('')
  let createCollectionError = $state('')

  let detachFolderCollection = $state('')
  let detachFolderOptions = $state<string[]>([])

  let selectedFile = $state({ name: '', filepath: '' })
  let explorerSyncSeq = $state(0)
  let explorerSyncTarget = $state<
    { filepath: string; blockIndex: number; seq: number } | undefined
  >(undefined)
  let fileSessions = $state<Record<string, FileSession>>({})
  let openTabs = $state<RequestTab[]>([])
  let activeTabId = $state<string | undefined>()
  let activeForm = $state<RequestFormModel | null>(null)

  let tabResponses = $state<Record<string, TabResponseState>>({})
  let responseUiActiveId = $state<string | undefined>()
  let responseUiViewTab = $state<TabResponseState['viewTab']>('body')
  let responseUiTabId = $state<string | undefined>()
  let promptRequest = $state<PromptRequest | null>(null)

  function getTabResponse(tabId: string | undefined): TabResponseState {
    if (!tabId) return emptyTabResponseState()
    return tabResponses[tabId] ?? emptyTabResponseState()
  }

  function patchTabResponse(tabId: string, patch: Partial<TabResponseState>): void {
    const current = getTabResponse(tabId)
    const next: TabResponseState = { ...current, ...patch }
    if (
      next.entries === current.entries &&
      next.activeId === current.activeId &&
      (next.viewTab ?? 'body') === (current.viewTab ?? 'body')
    ) {
      return
    }
    tabResponses = {
      ...tabResponses,
      [tabId]: next
    }
  }

  function evictTabResponses(tabId: string): void {
    const { [tabId]: _removed, ...rest } = tabResponses
    tabResponses = rest
  }

  function evictFilepathResponses(filepath: string): void {
    const prefix = `${filepath}::`
    tabResponses = Object.fromEntries(
      Object.entries(tabResponses).filter(([key]) => !key.startsWith(prefix))
    )
  }

  function remapTabResponses(filepath: string, remapIndex: (idx: number) => number): void {
    const next: Record<string, TabResponseState> = {}
    for (const [tabId, state] of Object.entries(tabResponses)) {
      const parsed = parseRequestTabId(tabId)
      if (!parsed || parsed.filepath !== filepath) {
        next[tabId] = state
        continue
      }
      const newIndex = remapIndex(parsed.blockIndex)
      if (newIndex < 0) continue
      next[requestTabId(filepath, newIndex)] = state
    }
    tabResponses = next
  }

  function resolveResponseTabId(entry: ResponseEntry): string | undefined {
    if (!activeTabId) return undefined
    const parsed = parseRequestTabId(activeTabId)
    if (!parsed) return activeTabId

    const blockName = entry.blockName?.trim()
    if (!blockName) return activeTabId

    const session = fileSessions[parsed.filepath]
    const form = session?.formModels.find((f) => f.blockName === blockName)
    if (!form) return activeTabId
    return requestTabId(parsed.filepath, form.blockIndex)
  }

  function applyWebSocketEvent(
    entry: ResponseEntry,
    entryId: string,
    event: { type?: string; data?: string; error?: string }
  ): ResponseEntry {
    if (entry.id !== entryId) return entry
    if (event.type === 'ready') {
      return { ...entry, wsConnected: true, body: (entry.body ?? '') + 'Connected\n' }
    }
    if (event.type === 'message') {
      return {
        ...entry,
        body: (entry.body ?? '') + (event.data ?? '') + '\n',
        rawBody: (entry.rawBody ?? '') + (event.data ?? '') + '\n'
      }
    }
    if (event.type === 'error') return { ...entry, error: event.error }
    if (event.type === 'closed') return { ...entry, wsClosed: true, wsConnected: false }
    return entry
  }

  function loadResponseUiForTab(tabId: string | undefined): void {
    if (!tabId) {
      responseUiTabId = undefined
      responseUiActiveId = undefined
      responseUiViewTab = 'body'
      return
    }
    const state = tabResponses[tabId] ?? emptyTabResponseState()
    responseUiTabId = tabId
    responseUiActiveId = state.activeId
    responseUiViewTab = state.viewTab ?? 'body'
  }

  function switchResponseUiTab(nextTabId: string | undefined): void {
    const prevTabId = responseUiTabId
    if (prevTabId && prevTabId !== nextTabId) {
      patchTabResponse(prevTabId, {
        activeId: responseUiActiveId,
        viewTab: responseUiViewTab
      })
    }
    loadResponseUiForTab(nextTabId)
  }

  $effect(() => {
    const nextTabId = activeTabId
    untrack(() => switchResponseUiTab(nextTabId))
  })

  $effect(() => {
    const tabId = activeTabId
    const activeId = responseUiActiveId
    const viewTab = responseUiViewTab
    if (!tabId || tabId !== responseUiTabId) return

    untrack(() => {
      const stored = tabResponses[tabId]
      if (stored?.activeId === activeId && (stored?.viewTab ?? 'body') === viewTab) return
      patchTabResponse(tabId, { activeId, viewTab })
    })
  })
  let activeTab = $derived(openTabs.find((tab) => tab.id === activeTabId))
  let activeSession = $derived(activeTab ? fileSessions[activeTab.filepath] : undefined)
  let activeResponseState = $derived(
    activeTabId ? (tabResponses[activeTabId] ?? emptyTabResponseState()) : emptyTabResponseState()
  )
  let sidebarFormModels = $derived(
    selectedFile.filepath ? (fileSessions[selectedFile.filepath]?.formModels ?? []) : []
  )
  let dirtyFilepaths = $derived(
    Object.values(fileSessions)
      .filter((session) => isSessionDirty(session.formModels, session.savedFingerprint))
      .map((session) => session.filepath)
  )

  type PersistedRequestTab = {
    filepath: string
    blockIndex: number
    formTab: FormTab
    editorSyntax: 'text' | 'json' | 'html'
  }

  type PersistedRequestTabsState = {
    openTabs: PersistedRequestTab[]
    activeTabId?: string
  }

  async function refreshCollectionsIndex(): Promise<void> {
    collectionsIndex = await window.KulalaApi.getCollectionTreeIndex()
    sidebarRefreshKey++
  }

  const showErrorModal = (msg: string): void => {
    errorMessage = msg
    showError = true
  }

  function flushActiveFormToSession(): void {
    if (!activeForm || !activeSession) return
    const nextModels = syncFormIntoModels(activeSession.formModels, activeForm)
    fileSessions = {
      ...fileSessions,
      [activeSession.filepath]: {
        ...activeSession,
        formModels: nextModels
      }
    }
  }

  function syncJqFilterToFormModel(tabId: string, jqFilter: string | undefined): void {
    const parsed = parseRequestTabId(tabId)
    if (!parsed) return
    const session = fileSessions[parsed.filepath]
    if (!session) return

    const nextModels = session.formModels.map((form) =>
      form.blockIndex === parsed.blockIndex ? { ...form, jqFilter } : form
    )
    fileSessions = {
      ...fileSessions,
      [parsed.filepath]: {
        ...session,
        formModels: nextModels
      }
    }
    if (
      activeForm &&
      activeSession?.filepath === parsed.filepath &&
      activeForm.blockIndex === parsed.blockIndex
    ) {
      activeForm = { ...activeForm, jqFilter }
    }
  }

  function persistActiveTabUiState(formTab: FormTab, editorSyntax: 'text' | 'json' | 'html'): void {
    if (!activeTabId) return
    openTabs = openTabs.map((tab) =>
      tab.id === activeTabId ? { ...tab, formTab, editorSyntax } : tab
    )
  }

  async function createSession(
    filepath: string,
    fileName: string
  ): Promise<FileSession | undefined> {
    const result = await loadDocument(filepath)
    if (result.err || !result.doc) {
      showErrorModal(result.err ?? 'Failed to load file')
      return undefined
    }
    const models = docToFormModels(result.doc)
    const session: FileSession = {
      filepath,
      fileName,
      document: toPlainDocument(result.doc),
      fileContent: result.content ?? '',
      formModels: models,
      savedFingerprint: fingerprintFormModels(models),
      selectedEnv: await window.KulalaApi.getSelectedEnv(filepath)
    }
    fileSessions = { ...fileSessions, [filepath]: session }
    return session
  }

  async function ensureSession(
    filepath: string,
    fileName: string
  ): Promise<FileSession | undefined> {
    return fileSessions[filepath] ?? (await createSession(filepath, fileName))
  }

  function loadActiveFormFromTab(tab: RequestTab, session: FileSession): void {
    activeForm =
      session.formModels.find((form) => form.blockIndex === tab.blockIndex) ??
      session.formModels[0] ??
      null
  }

  function requestExplorerSync(filepath: string, blockIndex: number): void {
    explorerSyncSeq += 1
    explorerSyncTarget = { filepath, blockIndex, seq: explorerSyncSeq }
  }

  async function openRequestTab(
    file: { name: string; filepath: string },
    blockIndex = 0
  ): Promise<void> {
    const session = await ensureSession(file.filepath, file.name)
    if (!session) return

    selectedFile = file
    const id = requestTabId(file.filepath, blockIndex)
    const existing = openTabs.find((tab) => tab.id === id)
    if (!existing) {
      openTabs = [
        ...openTabs,
        {
          id,
          filepath: file.filepath,
          blockIndex,
          formTab: 'body',
          editorSyntax: 'json'
        }
      ]
    }
    flushActiveFormToSession()
    activeTabId = id
    loadActiveFormFromTab(
      openTabs.find((tab) => tab.id === id) ?? {
        id,
        filepath: file.filepath,
        blockIndex,
        formTab: 'body',
        editorSyntax: 'json'
      },
      fileSessions[file.filepath] ?? session
    )
  }

  function activateTab(tabId: string): void {
    if (tabId === activeTabId) return
    flushActiveFormToSession()
    activeTabId = tabId
    const tab = openTabs.find((entry) => entry.id === tabId)
    const session = tab ? fileSessions[tab.filepath] : undefined
    if (tab && session) {
      selectedFile = { name: session.fileName, filepath: session.filepath }
      loadActiveFormFromTab(tab, session)
      requestExplorerSync(tab.filepath, tab.blockIndex)
    }
  }

  function closeTab(tabId: string, force = false): void {
    const parsed = parseRequestTabId(tabId)
    if (!parsed) return
    const session = fileSessions[parsed.filepath]
    if (!force && session && isSessionDirty(session.formModels, session.savedFingerprint)) {
      pendingCloseTabId = tabId
      showCloseTabConfirm = true
      return
    }

    openTabs = openTabs.filter((tab) => tab.id !== tabId)
    evictTabEditors(tabId)
    evictTabResponses(tabId)
    if (activeTabId === tabId) {
      const next = openTabs[openTabs.length - 1]
      if (next) {
        activateTab(next.id)
      } else {
        activeTabId = undefined
        activeForm = null
        selectedFile = { name: '', filepath: '' }
      }
    }

    if (openTabs.every((tab) => tab.filepath !== parsed.filepath)) {
      const { [parsed.filepath]: _removed, ...rest } = fileSessions
      fileSessions = rest
    }
  }

  const saveCurrentSession = async (): Promise<boolean> => {
    flushActiveFormToSession()
    const filepath = activeTab?.filepath
    if (!filepath) return false
    const session = fileSessions[filepath]
    if (!session || !activeForm) return false

    const result = await saveSessionToFile(session.document, session.formModels, session.filepath)
    if (result.err || !result.doc || !result.formModels || !result.savedFingerprint) {
      showErrorModal(result.err ?? 'Failed to save')
      return false
    }

    fileSessions = {
      ...fileSessions,
      [session.filepath]: {
        ...session,
        document: toPlainDocument(result.doc),
        fileContent: result.content ?? session.fileContent,
        formModels: result.formModels,
        savedFingerprint: result.savedFingerprint
      }
    }
    activeForm =
      result.formModels.find((form) => form.blockIndex === activeForm!.blockIndex) ??
      result.formModels[0] ??
      null
    return true
  }

  const sendRequest = async (): Promise<void> => {
    if (!activeForm || !activeSession) return
    if (!(await saveCurrentSession())) return
    const session = fileSessions[activeSession.filepath] ?? activeSession
    const ctx = buildRunContext(session.fileContent, session.filepath, session.selectedEnv)
    try {
      await window.KulalaApi.runRequest(ctx, activeForm.blockName)
    } catch (err) {
      isRunning = false
      showErrorModal(err instanceof Error ? err.message : String(err))
    }
  }

  const runAllRequests = async (): Promise<void> => {
    const session = activeSession
    if (!session?.filepath || !session.fileContent) return
    if (activeForm && !(await saveCurrentSession())) return
    const latest = fileSessions[session.filepath] ?? session
    const ctx = buildRunContext(latest.fileContent, latest.filepath, latest.selectedEnv)
    try {
      await window.KulalaApi.runAllRequests(ctx)
    } catch (err) {
      isRunning = false
      showErrorModal(err instanceof Error ? err.message : String(err))
    }
  }

  const cancelRequest = (): void => {
    void window.KulalaApi.cancelRequest()
  }

  const copyAsCurl = async (): Promise<void> => {
    if (!activeForm || !activeSession) return
    if (!(await saveCurrentSession())) return
    const session = fileSessions[activeSession.filepath] ?? activeSession
    const curl = await window.KulalaApi.toCurl(
      session.fileContent,
      session.filepath,
      activeForm.contentStartLine,
      1
    )
    if (curl) await window.KulalaApi.copyToClipboard(curl)
  }

  const pasteFromCurl = async (): Promise<void> => {
    const curl = await window.KulalaApi.readClipboard()
    const http = await window.KulalaApi.fromCurl(curl, selectedFile.filepath)
    if (!http) {
      showErrorModal('Could not parse cURL.')
      return
    }
    pasteCurlHttp = http
    pasteCurlRequestName = ''
    pasteCurlNameError = ''
    showPasteCurl = true
  }

  const pasteCurlCopy = async (): Promise<void> => {
    if (!pasteCurlHttp) return
    await window.KulalaApi.copyToClipboard(pasteCurlHttp)
    showPasteCurl = false
  }

  const pasteCurlInsertAppend = async (): Promise<void> => {
    const filepath = activeSession?.filepath
    if (!filepath || !pasteCurlHttp) return

    const requestName = pasteCurlRequestName.trim()
    if (!requestName) {
      pasteCurlNameError = 'Request name is required.'
      return
    }
    pasteCurlNameError = ''

    const existing = (
      fileSessions[filepath]?.fileContent ??
      activeSession?.fileContent ??
      ''
    ).trimEnd()
    const blockSnippet = `### ${requestName}\n${pasteCurlHttp.trim()}\n`
    const nextContent = `${existing}\n\n${blockSnippet}`

    const parsed = await window.KulalaApi.parseDocument(nextContent, filepath)
    if (parsed.err || !parsed.doc) {
      showErrorModal(parsed.err ?? 'Failed to parse generated request')
      return
    }
    const saved = await window.KulalaApi.saveDocument(parsed.doc, filepath, {
      preserveBodyText: true
    })
    if (saved.err) {
      showErrorModal(saved.err)
      return
    }

    const session = await createSession(filepath, filepath.split(/[/\\\\]/).pop() ?? filepath)
    showPasteCurl = false

    if (session && session.formModels.length > 0) {
      const newBlockIndex = session.formModels.length - 1
      await openRequestTab({ name: session.fileName, filepath }, newBlockIndex)
      requestExplorerSync(filepath, newBlockIndex)
    }
  }

  const inspectRequest = async (): Promise<void> => {
    if (!activeForm || !activeSession) return
    if (!(await saveCurrentSession())) return
    const session = fileSessions[activeSession.filepath] ?? activeSession
    inspectContent =
      (await window.KulalaApi.inspectRequest(
        session.fileContent,
        session.filepath,
        activeForm.contentStartLine,
        1,
        session.selectedEnv
      )) ?? 'No inspect result'
    showInspect = true
  }

  const clearGlobals = async (): Promise<void> => {
    await window.KulalaApi.clearGlobals(selectedFile.filepath)
  }

  const clearResponseHistory = (): void => {
    if (!activeTabId) return
    patchTabResponse(activeTabId, { entries: [], activeId: undefined })
    responseUiActiveId = undefined
    void window.KulalaApi.closeWebSocket()
  }

  const getCompletionOpts = (): CompletionContextOpts | undefined => {
    if (!activeSession?.document || !activeForm) return undefined
    return {
      doc: activeSession.document,
      form: activeForm,
      filepath: activeSession.filepath,
      env: activeSession.selectedEnv,
      field: { type: 'url', column: 0 }
    }
  }

  const onDocumentKeyDown = (e: KeyboardEvent): void => {
    if (isRunning && e.key === 'Escape') {
      cancelRequest()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      void saveCurrentSession()
    }
  }

  function onFormChange(form: RequestFormModel): void {
    activeForm = form
    if (!activeSession) return
    fileSessions = {
      ...fileSessions,
      [activeSession.filepath]: {
        ...activeSession,
        formModels: syncFormIntoModels(activeSession.formModels, form)
      }
    }
  }

  function onSelectedEnvChange(env: string): void {
    if (!activeSession) return
    fileSessions = {
      ...fileSessions,
      [activeSession.filepath]: {
        ...activeSession,
        selectedEnv: env
      }
    }
  }

  function onActiveTabUiChange(formTab: FormTab, editorSyntax: 'text' | 'json' | 'html'): void {
    persistActiveTabUiState(formTab, editorSyntax)
  }

  const appendResponseEntries = (entries: ResponseEntry[]): void => {
    if (entries.length === 0) return

    const grouped = new Map<string, ResponseEntry[]>()
    for (const entry of entries) {
      const tabId = resolveResponseTabId(entry)
      if (!tabId) continue
      const list = grouped.get(tabId) ?? []
      list.push(entry)
      grouped.set(tabId, list)
    }

    let next = { ...tabResponses }
    for (const [tabId, newEntries] of grouped) {
      const current = next[tabId] ?? emptyTabResponseState()
      const latestId = newEntries[newEntries.length - 1]?.id
      next[tabId] = {
        ...current,
        entries: [...current.entries, ...newEntries],
        activeId: latestId ?? current.activeId
      }
      if (tabId === activeTabId && latestId) {
        responseUiActiveId = latestId
      }
    }
    tabResponses = next
  }

  async function restorePersistedRequestTabs(): Promise<void> {
    const settings = await window.KulalaApi.getSettings()
    const raw = settings.uiRequestTabs as PersistedRequestTabsState | undefined
    if (!raw || !Array.isArray(raw.openTabs) || raw.openTabs.length === 0) return

    const restoredTabs: RequestTab[] = []
    for (const t of raw.openTabs) {
      if (!t || typeof t !== 'object') continue
      if (!t.filepath || typeof t.filepath !== 'string') continue
      if (typeof t.blockIndex !== 'number') continue
      const formTab = (t.formTab ?? 'body') as FormTab
      const editorSyntax = (t.editorSyntax ?? 'json') as 'text' | 'json' | 'html'

      // Ensure session exists; if it fails, skip this tab.
      try {
        await ensureSession(t.filepath, t.filepath.split(/[/\\\\]/).pop() ?? t.filepath)
      } catch {
        continue
      }

      restoredTabs.push({
        id: requestTabId(t.filepath, t.blockIndex),
        filepath: t.filepath,
        blockIndex: t.blockIndex,
        formTab,
        editorSyntax
      })
    }

    if (restoredTabs.length === 0) return

    openTabs = restoredTabs
    const desiredActive =
      typeof raw.activeTabId === 'string'
        ? raw.activeTabId
        : restoredTabs[restoredTabs.length - 1]?.id
    const fallback = restoredTabs[restoredTabs.length - 1]?.id
    activeTabId = restoredTabs.some((t) => t.id === desiredActive) ? desiredActive : fallback

    // Hydrate UI selection + active form based on restored active tab.
    const active = restoredTabs.find((t) => t.id === activeTabId)
    const session = active ? fileSessions[active.filepath] : undefined
    if (active && session) {
      selectedFile = { name: session.fileName, filepath: session.filepath }
      loadActiveFormFromTab(active, session)
      requestExplorerSync(active.filepath, active.blockIndex)
    }
  }

  $effect(() => {
    // Persist request tab state (debounced) so we don't spam IPC during typing.
    const snapshot: PersistedRequestTabsState = {
      openTabs: openTabs.map((t) => ({
        filepath: t.filepath,
        blockIndex: t.blockIndex,
        formTab: t.formTab,
        editorSyntax: t.editorSyntax
      })),
      activeTabId
    }
    const handle = setTimeout(() => {
      void window.KulalaApi.setSettings({ uiRequestTabs: snapshot })
    }, 250)
    return () => clearTimeout(handle)
  })

  onMount(async () => {
    await refreshCollectionsIndex()
    await restorePersistedRequestTabs()
    document.addEventListener('keydown', onDocumentKeyDown)

    window.KulalaApi.onResponse((entryOrEntries) => {
      const entries = Array.isArray(entryOrEntries)
        ? (entryOrEntries as ResponseEntry[])
        : [entryOrEntries as ResponseEntry]
      appendResponseEntries(entries)
    })
    window.KulalaApi.onError((msg) => showErrorModal(msg))
    window.KulalaApi.onRunning((running) => {
      isRunning = running
      showLoading = running
    })
    window.KulalaApi.onPrompt((req) => {
      promptRequest = req as PromptRequest
    })
    window.KulalaApi.onWebSocketEvent(({ entryId, event }) => {
      const ev = event as { type?: string; data?: string; error?: string }
      let next = { ...tabResponses }
      let changed = false
      for (const [tabId, state] of Object.entries(tabResponses)) {
        if (!state.entries.some((e) => e.id === entryId)) continue
        next[tabId] = {
          ...state,
          entries: state.entries.map((e) => applyWebSocketEvent(e, entryId, ev))
        }
        changed = true
        break
      }
      if (changed) tabResponses = next
    })
  })

  onDestroy(() => {
    document.removeEventListener('keydown', onDocumentKeyDown)
  })

  async function onCollectionSelect(name: string): Promise<void> {
    selectedCollectionName = name
  }

  async function onFileSelect(file: { name: string; filepath: string }): Promise<void> {
    selectedFile = file
    await ensureSession(file.filepath, file.name)
    await openRequestTab(file, 0)
  }

  function openCreateFileDialog(dirPath: string): void {
    createFileDirPath = dirPath
    createFileName = ''
    createFileError = ''
    showCreateFile = true
  }

  function folderDisplayLabel(path: string): string {
    return path.split(/[/\\]/).filter(Boolean).pop() ?? path
  }

  async function openCreateFileInCollection(collectionName: string): Promise<void> {
    const tree = await window.KulalaApi.getCollectionFileTree(collectionName)
    if (tree.attachedFolders.length === 0) {
      showErrorModal('No folders attached to this collection')
      return
    }
    if (tree.attachedFolders.length === 1) {
      openCreateFileDialog(tree.attachedFolders[0])
      return
    }
    createFileFolderOptions = tree.attachedFolders.map((folderPath) => ({
      value: folderPath,
      label: folderDisplayLabel(folderPath)
    }))
    createFileFolderValue = tree.attachedFolders[0]
    showCreateFileFolderPicker = true
  }

  function submitCreateFileFolderPicker(): void {
    if (!createFileFolderValue) return
    showCreateFileFolderPicker = false
    openCreateFileDialog(createFileFolderValue)
  }

  async function submitCreateFile(): Promise<void> {
    createFileError = ''
    const template = `### Request 1\n` + `GET https://echo.kulala.app/get\n\n`
    const res = await window.KulalaApi.createHttpFile(createFileDirPath, createFileName, template)
    if (!res.ok || !res.filepath) {
      createFileError = res.err ?? 'Failed to create file'
      return
    }
    showCreateFile = false
    await refreshCollectionsIndex()
    await onFileSelect({
      name: res.filepath.split(/[/\\\\]/).pop() ?? res.filepath,
      filepath: res.filepath
    })
    requestExplorerSync(res.filepath, 0)
  }

  async function createNewRequestInFile(file: { name: string; filepath: string }): Promise<void> {
    // Ensure current edits are captured.
    flushActiveFormToSession()

    const session = await ensureSession(file.filepath, file.name)
    if (!session) return

    const afterIndex =
      selectedFile.filepath === file.filepath && activeForm
        ? activeForm.blockIndex
        : session.formModels.length - 1

    const nextDoc = insertEmptyRequestBlock(session.document, Math.max(afterIndex, -1))
    const saved = await window.KulalaApi.saveDocument(toPlainDocument(nextDoc), file.filepath, {
      preserveBodyText: true
    })
    if (saved.err) {
      showErrorModal(saved.err)
      return
    }

    await createSession(file.filepath, file.name)
    selectedFile = file
    const newBlockIndex = afterIndex + 1
    await openRequestTab(file, newBlockIndex)
    requestExplorerSync(file.filepath, newBlockIndex)
  }

  async function reorderBlocksInFile(
    filepath: string,
    fromIndex: number,
    toIndex: number
  ): Promise<void> {
    const session = fileSessions[filepath]
    if (!session) return

    flushActiveFormToSession()

    const nextDoc = reorderNativeRequestBlocks(session.document, fromIndex, toIndex)
    const saved = await window.KulalaApi.saveDocument(toPlainDocument(nextDoc), filepath, {
      preserveBodyText: true
    })
    if (saved.err) {
      showErrorModal(saved.err)
      return
    }

    // Update open tabs to keep pointing at the same logical blocks.
    const remapIndex = (idx: number): number => {
      if (idx === fromIndex) return toIndex
      if (fromIndex < toIndex) {
        // Moving down: [from] removed, indices (from+1..to) shift up by 1
        if (idx > fromIndex && idx <= toIndex) return idx - 1
        return idx
      }
      // Moving up: indices (to..from-1) shift down by 1
      if (idx >= toIndex && idx < fromIndex) return idx + 1
      return idx
    }

    for (const tab of openTabs) {
      if (tab.filepath === filepath) evictTabEditors(tab.id)
    }
    remapTabResponses(filepath, remapIndex)

    const nextTabs = openTabs.map((t) => {
      if (t.filepath !== filepath) return t
      const nextIndex = remapIndex(t.blockIndex)
      return { ...t, blockIndex: nextIndex, id: requestTabId(filepath, nextIndex) }
    })
    const nextActive =
      activeTabId && parseRequestTabId(activeTabId)?.filepath === filepath
        ? requestTabId(filepath, remapIndex(parseRequestTabId(activeTabId)!.blockIndex))
        : activeTabId
    openTabs = nextTabs
    activeTabId = nextActive

    // Reload updated session models from disk.
    await createSession(filepath, session.fileName)
  }

  async function onBlockSelect(form: RequestFormModel): Promise<void> {
    if (!selectedFile.filepath) return
    await openRequestTab(selectedFile, form.blockIndex)
  }

  async function pickFoldersForCollection(collection: string): Promise<void> {
    showAddFolder = false
    const result = await window.KulalaApi.pickFolders(collection)
    if (result.skipped.length > 0 && result.attached.length === 0) {
      folderAttachNotice = 'Selected folder(s) are already attached to this collection.'
      setTimeout(() => {
        folderAttachNotice = ''
      }, 4000)
      return
    }
    await refreshCollectionsIndex()
  }

  async function pickFolders(): Promise<void> {
    if (pickCollectionValue === '') return
    await pickFoldersForCollection(pickCollectionValue)
  }

  function openRemoveCollection(name: string): void {
    removeCollectionName = name
    showRemoveCollection = true
  }

  async function removeCollection(): Promise<void> {
    const name = removeCollectionName
    const { removedFilepaths } = await window.KulalaApi.removeCollection(name)
    await refreshCollectionsIndex()
    showRemoveCollection = false

    openTabs = openTabs.filter((tab) => !removedFilepaths.includes(tab.filepath))
    for (const filepath of removedFilepaths) {
      evictFilepathEditors(filepath)
      evictFilepathResponses(filepath)
    }
    fileSessions = Object.fromEntries(
      Object.entries(fileSessions).filter(([filepath]) => !removedFilepaths.includes(filepath))
    )

    if (selectedCollectionName === name) {
      selectedCollectionName = ''
      selectedFile = { name: '', filepath: '' }
      activeTabId = undefined
      activeForm = null
    } else if (
      activeTabId &&
      removedFilepaths.includes(parseRequestTabId(activeTabId)?.filepath ?? '')
    ) {
      const next = openTabs[openTabs.length - 1]
      if (next) activateTab(next.id)
      else {
        activeTabId = undefined
        activeForm = null
      }
    }
  }

  function openAddFolder(collection?: string): void {
    const target = collection ?? selectedCollectionName ?? ''
    if (target) {
      if (collection) void onCollectionSelect(collection)
      void pickFoldersForCollection(target)
      return
    }
    pickCollectionValue = ''
    showAddFolder = true
  }

  function openRenameCollection(name: string): void {
    renameTarget = 'collection'
    renameCollectionName = name
    renameValue = name
    renameError = ''
    showRename = true
  }

  function openRenameFile(file: { name: string; filepath: string }): void {
    renameTarget = 'file'
    renameFileTarget = file
    renameValue = file.name
    renameError = ''
    showRename = true
  }

  function openRenameBlock(file: { name: string; filepath: string }, form: RequestFormModel): void {
    renameTarget = 'block'
    renameBlockTarget = {
      filepath: file.filepath,
      blockIndex: form.blockIndex,
      blockName: form.blockName
    }
    renameValue = form.blockName
    renameError = ''
    showRename = true
  }

  function openDeleteBlock(file: { name: string; filepath: string }, form: RequestFormModel): void {
    deleteBlockTarget = {
      file,
      blockIndex: form.blockIndex,
      blockName: form.blockName
    }
    showDeleteBlockConfirm = true
  }

  function openDeleteExplorerFile(file: { name: string; filepath: string }): void {
    deletePathTarget = { kind: 'file', filepath: file.filepath, label: file.name }
    showDeletePathConfirm = true
  }

  function openDeleteExplorerFolder(dirPath: string): void {
    const label =
      dirPath
        .split(/[/\\\\]/)
        .filter(Boolean)
        .pop() ?? dirPath
    deletePathTarget = { kind: 'folder', dirPath, label }
    showDeletePathConfirm = true
  }

  function isUnderDir(filepath: string, dirPath: string): boolean {
    const fp = filepath.replace(/\\/g, '/')
    const dir = dirPath.replace(/\\/g, '/').replace(/\/+$/, '')
    return fp === dir || fp.startsWith(`${dir}/`)
  }

  async function deleteExplorerPath(): Promise<void> {
    const target = deletePathTarget
    if (!target) return

    flushActiveFormToSession()

    const pathToDelete = target.kind === 'file' ? target.filepath : target.dirPath
    const res = await window.KulalaApi.deletePath(pathToDelete)
    if (!res.ok) {
      showErrorModal(res.err ?? 'Failed to delete')
      showDeletePathConfirm = false
      deletePathTarget = null
      return
    }

    const shouldRemove = (fp: string): boolean => {
      if (target.kind === 'file') return fp === target.filepath
      return isUnderDir(fp, target.dirPath)
    }

    // Close any open tabs + sessions that point at deleted files.
    const removedFilepaths = new Set<string>(
      [
        ...Object.keys(fileSessions).filter(shouldRemove),
        ...openTabs.map((t) => t.filepath).filter(shouldRemove)
      ].map((p) => p.replace(/\\/g, '/'))
    )

    openTabs = openTabs.filter((t) => !removedFilepaths.has(t.filepath.replace(/\\/g, '/')))
    for (const filepath of removedFilepaths) {
      evictFilepathEditors(filepath)
      evictFilepathResponses(filepath)
    }

    const nextSessions: Record<string, FileSession> = {}
    for (const [fp, sess] of Object.entries(fileSessions)) {
      if (removedFilepaths.has(fp.replace(/\\/g, '/'))) continue
      nextSessions[fp] = sess
    }
    fileSessions = nextSessions

    if (selectedFile.filepath && removedFilepaths.has(selectedFile.filepath.replace(/\\/g, '/'))) {
      selectedFile = { name: '', filepath: '' }
      activeForm = null
    }

    if (activeTabId) {
      const parsed = parseRequestTabId(activeTabId)
      if (parsed && removedFilepaths.has(parsed.filepath.replace(/\\/g, '/'))) {
        const next = openTabs[openTabs.length - 1]
        if (next) {
          activateTab(next.id)
        } else {
          activeTabId = undefined
          activeForm = null
        }
      }
    }

    showDeletePathConfirm = false
    deletePathTarget = null

    await refreshCollectionsIndex()
  }

  async function deleteRequestBlock(): Promise<void> {
    const target = deleteBlockTarget
    if (!target) return

    flushActiveFormToSession()
    const session =
      fileSessions[target.file.filepath] ??
      (await ensureSession(target.file.filepath, target.file.name))
    if (!session) {
      showDeleteBlockConfirm = false
      deleteBlockTarget = null
      return
    }

    if (nativeBlocks(session.document).length <= 1) {
      showErrorModal('Cannot delete the only request in a file.')
      showDeleteBlockConfirm = false
      deleteBlockTarget = null
      return
    }

    const deletedIndex = target.blockIndex
    const nextDoc = removeNativeRequestBlock(session.document, deletedIndex)
    const saved = await window.KulalaApi.saveDocument(
      toPlainDocument(nextDoc),
      target.file.filepath,
      {
        preserveBodyText: true
      }
    )
    if (saved.err) {
      showErrorModal(saved.err)
      showDeleteBlockConfirm = false
      deleteBlockTarget = null
      return
    }

    const remapIndex = (idx: number): number => {
      if (idx === deletedIndex) return -1
      if (idx > deletedIndex) return idx - 1
      return idx
    }

    const filepath = target.file.filepath

    for (const tab of openTabs) {
      if (tab.filepath === filepath) evictTabEditors(tab.id)
    }
    remapTabResponses(filepath, remapIndex)

    const parsedActive = activeTabId ? parseRequestTabId(activeTabId) : null
    const deletedWasActive =
      parsedActive?.filepath === filepath && parsedActive.blockIndex === deletedIndex
    const remappedActiveId =
      parsedActive?.filepath === filepath && !deletedWasActive
        ? (() => {
            const nextIndex = remapIndex(parsedActive.blockIndex)
            return nextIndex >= 0 ? requestTabId(filepath, nextIndex) : undefined
          })()
        : undefined

    openTabs = openTabs
      .map((tab) => {
        if (tab.filepath !== filepath) return tab
        const nextIndex = remapIndex(tab.blockIndex)
        if (nextIndex < 0) return null
        return { ...tab, blockIndex: nextIndex, id: requestTabId(filepath, nextIndex) }
      })
      .filter((tab): tab is RequestTab => tab !== null)

    showDeleteBlockConfirm = false
    deleteBlockTarget = null
    await createSession(filepath, target.file.name)

    if (deletedWasActive) {
      const next = openTabs.find((tab) => tab.filepath === filepath)
      if (next) {
        activateTab(next.id)
      } else {
        activeTabId = undefined
        activeForm = null
      }
      return
    }

    if (remappedActiveId) {
      activeTabId = remappedActiveId
      const tab = openTabs.find((entry) => entry.id === remappedActiveId)
      const refreshed = fileSessions[filepath]
      if (tab && refreshed) {
        loadActiveFormFromTab(tab, refreshed)
      }
    }
  }

  function openCreateSubcollection(parentName: string): void {
    createSubcollectionParent = parentName
    createSubcollectionName = ''
    createSubcollectionError = ''
    showCreateSubcollection = true
  }

  function openCreateCollection(): void {
    createCollectionName = ''
    createCollectionError = ''
    showCreateCollection = true
  }

  async function submitCreateCollection(): Promise<void> {
    createCollectionError = ''
    const result = await window.KulalaApi.createCollection(createCollectionName)
    if (!result.ok) {
      createCollectionError = result.err ?? 'Failed to create collection'
      return
    }
    showCreateCollection = false
    selectedCollectionName = createCollectionName.trim()
    await refreshCollectionsIndex()
  }

  async function submitCreateSubcollection(): Promise<void> {
    createSubcollectionError = ''
    const result = await window.KulalaApi.createSubcollection(
      createSubcollectionParent,
      createSubcollectionName
    )
    if (!result.ok) {
      createSubcollectionError = result.err ?? 'Failed to create subcollection'
      return
    }
    showCreateSubcollection = false
    await refreshCollectionsIndex()
  }

  async function detachFolder(collectionName: string, folderPath: string): Promise<void> {
    await window.KulalaApi.detachFolder(collectionName, folderPath)
    await refreshCollectionsIndex()
  }

  async function openDetachFolderPrompt(collectionName: string): Promise<void> {
    const tree = await window.KulalaApi.getCollectionFileTree(collectionName)
    if (tree.attachedFolders.length === 0) {
      showErrorModal('No folders attached to this collection')
      return
    }
    if (tree.attachedFolders.length === 1) {
      await detachFolder(collectionName, tree.attachedFolders[0])
      return
    }
    detachFolderCollection = collectionName
    detachFolderOptions = tree.attachedFolders
    showDetachFolder = true
  }

  async function submitRename(): Promise<void> {
    renameError = ''
    if (renameTarget === 'collection') {
      const result = await window.KulalaApi.renameCollection(renameCollectionName, renameValue)
      if (!result.ok) {
        renameError = result.err ?? 'Failed to rename collection'
        return
      }
      if (selectedCollectionName === renameCollectionName) {
        selectedCollectionName = renameValue.trim()
      }
      await refreshCollectionsIndex()
      showRename = false
      return
    }

    if (renameTarget === 'block') {
      const name = renameValue.trim()
      if (!name) {
        renameError = 'Request name is required.'
        return
      }

      flushActiveFormToSession()
      const filepath = renameBlockTarget.filepath
      const session =
        fileSessions[filepath] ??
        (await ensureSession(filepath, filepath.split(/[/\\\\]/).pop() ?? filepath))
      if (!session) return

      const form = session.formModels.find((f) => f.blockIndex === renameBlockTarget.blockIndex)
      if (!form) return

      const updatedForm = { ...toPlainForm(form), blockName: name }
      const nextModels = syncFormIntoModels(session.formModels, updatedForm)
      const result = await saveSessionToFile(session.document, nextModels, filepath)
      if (result.err) {
        renameError = result.err
        return
      }

      if (result.doc && result.formModels && result.content && result.savedFingerprint) {
        fileSessions = {
          ...fileSessions,
          [filepath]: {
            ...session,
            document: result.doc,
            formModels: result.formModels,
            fileContent: result.content,
            savedFingerprint: result.savedFingerprint
          }
        }
      }

      const active = openTabs.find(
        (tab) => tab.filepath === filepath && tab.blockIndex === renameBlockTarget.blockIndex
      )
      if (active) {
        const refreshed = fileSessions[filepath]
        const refreshedForm = refreshed?.formModels.find(
          (f) => f.blockIndex === renameBlockTarget.blockIndex
        )
        if (refreshedForm) {
          loadActiveFormFromTab(active, refreshed)
          if (activeTabId === active.id) {
            activeForm = refreshedForm
          }
        }
      }

      showRename = false
      return
    }

    const result = await window.KulalaApi.renameFile(renameFileTarget.filepath, renameValue)
    if (!result.ok) {
      renameError = result.err ?? 'Failed to rename file'
      return
    }
    if (result.newPath) {
      const oldPath = renameFileTarget.filepath
      const newPath = result.newPath
      const newName = newPath.split(/[/\\]/).pop() ?? renameValue
      const oldSession = fileSessions[oldPath]
      if (oldSession) {
        const { [oldPath]: _removed, ...rest } = fileSessions
        fileSessions = {
          ...rest,
          [newPath]: { ...oldSession, filepath: newPath, fileName: newName }
        }
      }
      openTabs = openTabs.map((tab) =>
        tab.filepath === oldPath
          ? { ...tab, id: requestTabId(newPath, tab.blockIndex), filepath: newPath }
          : tab
      )
      if (activeTabId) {
        const parsed = parseRequestTabId(activeTabId)
        if (parsed?.filepath === oldPath) {
          activeTabId = requestTabId(newPath, parsed.blockIndex)
        }
      }
      if (selectedFile.filepath === oldPath) {
        selectedFile = { name: newName, filepath: newPath }
      }
    }
    sidebarRefreshKey++
    showRename = false
  }

  async function onPromptSubmit(inputs: Array<{ id: string; value: string }>): Promise<void> {
    if (!promptRequest) return
    await window.KulalaApi.submitPrompt(promptRequest.id, inputs)
    promptRequest = null
  }

  async function onJqFilter(id: string, filter: string): Promise<void> {
    const tabId = activeTabId
    if (!tabId) return

    const state = getTabResponse(tabId)
    const entry = state.entries.find((r) => r.id === id)
    if (!entry) return

    const trimmed = filter.trim()

    if (!trimmed) {
      const latest = getTabResponse(tabId)
      patchTabResponse(tabId, {
        entries: latest.entries.map((r) =>
          r.id === id
            ? {
                ...r,
                body: r.rawBody ?? r.body,
                jqFilter: undefined
              }
            : r
        ),
        activeId: id
      })
      syncJqFilterToFormModel(tabId, undefined)
      if (tabId === activeTabId) {
        responseUiActiveId = id
      }
      return
    }

    const rawBody = entry.rawBody ?? entry.body
    if (!rawBody) return

    const { entry: updated, err } = await window.KulalaApi.applyJqFilter(
      rawBody,
      trimmed,
      entry.contentType
    )
    if (err) {
      showErrorModal(err)
      return
    }
    if (!updated) return

    const latest = getTabResponse(tabId)
    patchTabResponse(tabId, {
      entries: latest.entries.map((r) =>
        r.id === id
          ? {
              ...r,
              ...updated,
              rawBody: r.rawBody ?? r.body,
              jqFilter: trimmed
            }
          : r
      ),
      activeId: id
    })
    syncJqFilterToFormModel(tabId, trimmed)
    if (tabId === activeTabId) {
      responseUiActiveId = id
    }
  }

  function confirmCloseTab(): void {
    if (pendingCloseTabId) closeTab(pendingCloseTabId, true)
    pendingCloseTabId = undefined
    showCloseTabConfirm = false
  }

  function onRenameFormSubmit(e: Event): void {
    e.preventDefault()
    void submitRename()
  }

  $effect(() => {
    if (!showCreateFileFolderPicker) return undefined
    void tick().then(() => createFileFolderSelectRef?.focus())
  })

  $effect(() => {
    if (!showCreateFile) return undefined
    void tick().then(() => createFileInputRef?.focus())
  })

  $effect(() => {
    if (!showRename) return undefined
    void tick().then(() => renameInputRef?.focus())

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        showRename = false
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  $effect(() => {
    if (!showRemoveCollection) return undefined

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        showRemoveCollection = false
      } else if (e.key === 'Enter') {
        e.preventDefault()
        void removeCollection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
</script>

<PromptDialog bind:request={promptRequest} onsubmit={onPromptSubmit} />

<Dialog bind:open={showLoading} title="Running request">
  <div class="loading-spinner"></div>
</Dialog>

<Dialog bind:open={showError} title="Error">
  <p>{errorMessage}</p>
</Dialog>

<Dialog bind:open={showInspect} title="Inspect request" class="inspect-dialog">
  <pre class="inspect-pre">{inspectContent}</pre>
</Dialog>

<Dialog
  bind:open={showPasteCurl}
  title="Paste from cURL"
  priority="elevated"
  class="inspect-dialog"
>
  <p class="inspect-help">Converted cURL into a .http snippet.</p>
  <label class="inspect-label" for="paste-curl-request-name">Request name</label>
  <Input
    id="paste-curl-request-name"
    bind:value={pasteCurlRequestName}
    placeholder="Name for the new request block"
  />
  {#if pasteCurlNameError}
    <p class="inspect-error">{pasteCurlNameError}</p>
  {/if}
  <pre class="inspect-pre">{pasteCurlHttp}</pre>
  {#snippet actions()}
    <Button variant="ghost" onclick={pasteCurlCopy}>Copy</Button>
    <Button variant="success" onclick={pasteCurlInsertAppend} disabled={!activeSession?.filepath}>
      Insert (append)
    </Button>
    <Button type="button" onclick={() => (showPasteCurl = false)}>Close</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showAddFolder} title="Pick a collection">
  <Input list="collections-list" bind:value={pickCollectionValue} placeholder="Collection name" />
  <datalist id="collections-list">
    {#each collectionsIndex as c}
      <option value={c.name}></option>
    {/each}
  </datalist>
  {#snippet actions()}
    <Button variant="success" onclick={pickFolders}>Pick folders</Button>
    <Button variant="warning" onclick={() => (showAddFolder = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showCreateFileFolderPicker} title="New file" priority="elevated">
  <form
    id="create-file-folder-form"
    onsubmit={(e) => {
      e.preventDefault()
      submitCreateFileFolderPicker()
    }}
  >
    <Label>Folder</Label>
    <Select
      bind:ref={createFileFolderSelectRef}
      bind:value={createFileFolderValue}
      options={createFileFolderOptions}
      class="create-file-folder-select"
    />
  </form>
  {#snippet actions()}
    <Button variant="success" type="submit" form="create-file-folder-form">Continue</Button>
    <Button type="button" onclick={() => (showCreateFileFolderPicker = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showCreateFile} title="New file" priority="elevated">
  <form
    id="create-file-form"
    onsubmit={(e) => {
      e.preventDefault()
      void submitCreateFile()
    }}
  >
    <Input bind:ref={createFileInputRef} bind:value={createFileName} placeholder="filename.http" />
    {#if createFileError}
      <p class="rename-error">{createFileError}</p>
    {/if}
  </form>
  {#snippet actions()}
    <Button variant="success" type="submit" form="create-file-form">Create</Button>
    <Button type="button" onclick={() => (showCreateFile = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showRemoveCollection} title="Remove collection">
  <p>Remove collection "{removeCollectionName}" and all its file references?</p>
  {#snippet actions()}
    <Button variant="warning" onclick={removeCollection}>Remove</Button>
    <Button type="button" onclick={() => (showRemoveCollection = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showCreateCollection} title="Create collection">
  <form
    id="create-collection-form"
    onsubmit={(e) => {
      e.preventDefault()
      void submitCreateCollection()
    }}
  >
    <Input bind:value={createCollectionName} placeholder="Collection name" />
    {#if createCollectionError}
      <p class="rename-error">{createCollectionError}</p>
    {/if}
  </form>
  {#snippet actions()}
    <Button variant="success" type="submit" form="create-collection-form">Create</Button>
    <Button type="button" onclick={() => (showCreateCollection = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showCreateSubcollection} title="Add subcollection">
  <form
    id="create-subcollection-form"
    onsubmit={(e) => {
      e.preventDefault()
      void submitCreateSubcollection()
    }}
  >
    <Input bind:value={createSubcollectionName} placeholder="Subcollection name" />
    {#if createSubcollectionError}
      <p class="rename-error">{createSubcollectionError}</p>
    {/if}
  </form>
  {#snippet actions()}
    <Button variant="success" type="submit" form="create-subcollection-form">Create</Button>
    <Button type="button" onclick={() => (showCreateSubcollection = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showDetachFolder} title="Detach folder">
  <p>Choose a folder to detach from "{detachFolderCollection}":</p>
  <div class="detach-folder-list">
    {#each detachFolderOptions as folderPath}
      <Button
        variant="warning"
        onclick={async () => {
          await detachFolder(detachFolderCollection, folderPath)
          showDetachFolder = false
        }}
      >
        {folderPath.split(/[/\\]/).filter(Boolean).pop() ?? folderPath}
      </Button>
    {/each}
  </div>
  {#snippet actions()}
    <Button type="button" onclick={() => (showDetachFolder = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={showRename}
  title={renameTarget === 'collection'
    ? 'Rename collection'
    : renameTarget === 'block'
      ? 'Rename request'
      : 'Rename file'}
>
  <form id="rename-form" onsubmit={onRenameFormSubmit}>
    <Input bind:ref={renameInputRef} bind:value={renameValue} placeholder="New name" />
    {#if renameError}
      <p class="rename-error">{renameError}</p>
    {/if}
  </form>
  {#snippet actions()}
    <Button variant="success" type="submit" form="rename-form">Rename</Button>
    <Button type="button" onclick={() => (showRename = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showCloseTabConfirm} title="Unsaved changes">
  <p>This request has unsaved changes. Close anyway?</p>
  {#snippet actions()}
    <Button variant="warning" onclick={confirmCloseTab}>Close without saving</Button>
    <Button onclick={() => (showCloseTabConfirm = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showDeleteBlockConfirm} title="Delete request">
  <p>
    Delete request "{deleteBlockTarget?.blockName ?? ''}" from
    {deleteBlockTarget?.file.name ?? 'this file'}?
  </p>
  {#snippet actions()}
    <Button variant="error" onclick={() => void deleteRequestBlock()}>Delete</Button>
    <Button onclick={() => (showDeleteBlockConfirm = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={showDeletePathConfirm}
  title={deletePathTarget?.kind === 'folder' ? 'Delete folder' : 'Delete file'}
>
  {#if deletePathTarget?.kind === 'folder'}
    <p>Delete folder "{deletePathTarget.label}" and everything inside it?</p>
  {:else}
    <p>Delete file "{deletePathTarget?.label ?? ''}"?</p>
  {/if}
  {#snippet actions()}
    <Button variant="error" onclick={() => void deleteExplorerPath()}>Delete</Button>
    <Button onclick={() => (showDeletePathConfirm = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<AppShell>
  {#snippet sidebar()}
    {#if folderAttachNotice}
      <p class="folder-attach-notice">{folderAttachNotice}</p>
    {/if}
    <CollectionSidebar
      collections={collectionsIndex}
      refreshKey={sidebarRefreshKey}
      bind:selectedCollection={selectedCollectionName}
      bind:selectedFile
      formModels={sidebarFormModels}
      bind:activeForm
      {dirtyFilepaths}
      onfileselect={onFileSelect}
      onblockselect={onBlockSelect}
      onaddfolder={openAddFolder}
      oncreatecollection={openCreateCollection}
      oncreatesubcollection={openCreateSubcollection}
      ondetachfolderprompt={openDetachFolderPrompt}
      onrunall={runAllRequests}
      onrenamecollection={openRenameCollection}
      onrenamefile={openRenameFile}
      onrenameblock={openRenameBlock}
      ondeleteblock={openDeleteBlock}
      ondeletefile={openDeleteExplorerFile}
      ondeletefolder={openDeleteExplorerFolder}
      oncreatefile={openCreateFileDialog}
      oncreatefileincollection={openCreateFileInCollection}
      oncreaterequest={createNewRequestInFile}
      onreorderblocks={reorderBlocksInFile}
      onremovecollection={openRemoveCollection}
      syncTarget={explorerSyncTarget}
    />
  {/snippet}

  {#snippet main()}
    <div class="main-panel">
      <RequestTabBar
        tabs={openTabs}
        activeTabId={activeTabId ?? ''}
        sessions={fileSessions}
        {dirtyFilepaths}
        onactivate={activateTab}
        onclose={(tabId) => closeTab(tabId)}
      />
      {#if activeTab && activeSession && activeForm}
        <RequestPanel
          bind:form={activeForm}
          activeTab={activeTab.formTab}
          editorSyntax={activeTab.editorSyntax}
          requestTabId={activeTab.id}
          selectedEnv={activeSession.selectedEnv}
          dirty={dirtyFilepaths.includes(activeSession.filepath)}
          filepath={activeSession.filepath}
          fileName={activeSession.fileName}
          {getCompletionOpts}
          onchange={onFormChange}
          onactiveTabChange={(tab) => onActiveTabUiChange(tab, activeTab?.editorSyntax ?? 'json')}
          oneditorSyntaxChange={(syntax) =>
            onActiveTabUiChange(activeTab?.formTab ?? 'body', syntax)}
          onselectedEnvChange={onSelectedEnvChange}
          onsave={saveCurrentSession}
          onsend={sendRequest}
          oncopyCurl={copyAsCurl}
          onpasteCurl={pasteFromCurl}
          oninspect={inspectRequest}
          onclearGlobals={clearGlobals}
        />
      {:else}
        <div class="empty-state">
          <p>Open a request from the collection tree to get started.</p>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet response()}
    {#key activeTabId ?? ''}
      <ResponsePanel
        entries={activeResponseState.entries}
        bind:activeId={responseUiActiveId}
        bind:viewTab={responseUiViewTab}
        requestTabId={activeTabId ?? ''}
        onclear={clearResponseHistory}
        onjqfilter={onJqFilter}
        onwssend={(msg) => window.KulalaApi.sendWebSocketMessage(msg)}
        onwsclose={() => window.KulalaApi.closeWebSocket()}
      />
    {/key}
  {/snippet}
</AppShell>

<style>
  .main-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--kulala-fg-muted);
  }

  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid var(--kulala-border);
    border-top-color: var(--kulala-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.inspect-dialog) {
    max-width: min(90vw, 720px);
  }

  .inspect-pre {
    background: var(--kulala-bg-muted);
    padding: 0.75rem;
    border-radius: var(--kulala-radius);
    font-size: 0.8125rem;
    max-height: 24rem;
    overflow: auto;
    margin: 0;
  }

  .inspect-label {
    display: block;
    margin: 0.75rem 0 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .inspect-error {
    margin: 0.375rem 0 0;
    color: var(--kulala-error, #e5484d);
    font-size: 0.875rem;
  }

  .rename-error {
    margin: 0.5rem 0 0;
    color: var(--kulala-error, #e5484d);
    font-size: 0.875rem;
  }

  .folder-attach-notice {
    margin: 0 0 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg-muted);
    color: var(--kulala-fg-muted);
    font-size: 0.8125rem;
  }

  .detach-folder-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  :global(.create-file-folder-select) {
    display: block;
    width: 100%;
  }

  :global(.create-file-folder-select .kulala-select-trigger) {
    width: 100%;
    justify-content: space-between;
  }
</style>
