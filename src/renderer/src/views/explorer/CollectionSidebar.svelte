<script lang="ts">
  import { tick, untrack } from 'svelte'
  import type { CollectionFileTree, CollectionIndexItem, RequestFormModel } from '../../env.d'
  import type { TreeItem } from 'melt/builders'
  import { Tree } from 'melt/builders'
  import { SvelteSet } from 'svelte/reactivity'
  import Input from '../../components/ui/Input.svelte'
  import ContextMenu from '../../components/ui/ContextMenu.svelte'
  import { fuzzyMatch } from '../../kulala/fuzzy-match'

  type SidebarTreeItem = TreeItem & {
    kind: 'collection' | 'folder' | 'file' | 'block' | 'empty' | 'loading'
    label: string
    collectionName?: string
    file?: { name: string; filepath: string }
    form?: RequestFormModel
  }

  type ContextTarget =
    | { kind: 'collection'; name: string }
    | { kind: 'folder'; dirPath: string }
    | { kind: 'file'; file: { name: string; filepath: string } }
    | { kind: 'block'; file: { name: string; filepath: string }; form: RequestFormModel }
    | { kind: 'background' }

  let {
    collections = [],
    refreshKey = 0,
    selectedCollection = $bindable(''),
    selectedFile = $bindable({ name: '', filepath: '' }),
    formModels = [],
    activeForm = $bindable<RequestFormModel | null>(null),
    onfileselect,
    onblockselect,
    onaddfolder,
    oncreatecollection,
    oncreatesubcollection,
    ondetachfolderprompt,
    onrunall,
    onrenamecollection,
    onrenamefile,
    onrenameblock,
    ondeleteblock,
    ondeletefile,
    ondeletefolder,
    oncreatefile,
    oncreatefileincollection,
    oncreaterequest,
    onreorderblocks,
    onremovecollection,
    dirtyFilepaths = [],
    syncTarget = undefined
  }: {
    collections?: CollectionIndexItem[]
    refreshKey?: number
    selectedCollection?: string
    selectedFile?: { name: string; filepath: string }
    formModels?: RequestFormModel[]
    activeForm?: RequestFormModel | null
    onfileselect?: (file: { name: string; filepath: string }) => void
    onblockselect?: (form: RequestFormModel) => void
    onaddfolder?: (collectionName?: string) => void
    oncreatecollection?: () => void
    oncreatesubcollection?: (parentName: string) => void
    ondetachfolderprompt?: (collectionName: string) => void
    onrunall?: () => void
    onrenamecollection?: (name: string) => void
    onrenamefile?: (file: { name: string; filepath: string }) => void
    onrenameblock?: (file: { name: string; filepath: string }, form: RequestFormModel) => void
    ondeleteblock?: (file: { name: string; filepath: string }, form: RequestFormModel) => void
    ondeletefile?: (file: { name: string; filepath: string }) => void
    ondeletefolder?: (dirPath: string) => void
    oncreatefile?: (dirPath: string) => void
    oncreatefileincollection?: (collectionName: string) => void
    oncreaterequest?: (file: { name: string; filepath: string }) => void
    onreorderblocks?: (filepath: string, fromIndex: number, toIndex: number) => void
    onremovecollection?: (name: string) => void
    dirtyFilepaths?: string[]
    syncTarget?: { filepath: string; blockIndex: number; seq: number } | undefined
  } = $props()

  let fileFilter = $state('')
  let expanded = $state(new SvelteSet<string>())
  let lastExpanded = $state(new SvelteSet<string>())
  let explorerStateReady = $state(false)
  let explorerRestoreStarted = false
  let contextOpen = $state(false)
  let contextX = $state(0)
  let contextY = $state(0)
  let contextTarget = $state<ContextTarget | null>(null)

  let collectionFiles = $state<Record<string, CollectionFileTree | undefined>>({})
  let collectionFilesLoading = $state<Record<string, boolean | undefined>>({})

  type PersistedExplorerExpandedState = {
    expandedIds: string[]
    selectedCollection?: string
  }

  function isPersistableExpandedId(id: string): boolean {
    return (
      id.startsWith('collection:') ||
      id.startsWith('folder:') ||
      id.startsWith('folderRoot:') ||
      id.startsWith('file:')
    )
  }

  function collectionNameFromFolderId(id: string): string | undefined {
    if (id.startsWith('folderRoot:')) {
      const rest = id.slice('folderRoot:'.length)
      const firstColon = rest.indexOf(':')
      if (firstColon < 0) return undefined
      return rest.slice(0, firstColon)
    }
    // folder:${collectionName}:${rootFolderPath}:${subRel}
    if (!id.startsWith('folder:')) return undefined
    const rest = id.slice('folder:'.length)
    const firstColon = rest.indexOf(':')
    if (firstColon < 0) return undefined
    return rest.slice(0, firstColon)
  }

  function blocksForFile(file: { name: string; filepath: string }): SidebarTreeItem[] | undefined {
    if (selectedFile.filepath !== file.filepath || formModels.length === 0) {
      return undefined
    }
    return formModels.map((form) => ({
      id: `block:${file.filepath}:${form.blockIndex}`,
      kind: 'block',
      label: form.blockName,
      form
    }))
  }

  function ensureExpanded(id: string): void {
    if (expanded.has(id)) return
    const next = new SvelteSet(expanded)
    next.add(id)
    expanded = next
    lastExpanded = next
    if (isCollectionId(id)) {
      void window.KulalaApi.setCollectionExpanded(collectionNameFromId(id), true)
    }
  }

  function isCollectionId(id: string): boolean {
    return id.startsWith('collection:')
  }

  function collectionNameFromId(id: string): string {
    return id.slice('collection:'.length)
  }

  async function ensureCollectionFilesLoaded(collectionName: string): Promise<void> {
    if (collectionFiles[collectionName]) return
    if (collectionFilesLoading[collectionName]) return
    collectionFilesLoading = { ...collectionFilesLoading, [collectionName]: true }
    try {
      const tree = await window.KulalaApi.getCollectionFileTree(collectionName)
      collectionFiles = { ...collectionFiles, [collectionName]: tree }
    } finally {
      collectionFilesLoading = { ...collectionFilesLoading, [collectionName]: false }
    }
  }

  function buildCollectionHierarchy(items: CollectionIndexItem[]): Map<string | null, string[]> {
    const byParent = new Map<string | null, string[]>()
    for (const item of items) {
      const key = item.parentName ?? null
      const arr = byParent.get(key) ?? []
      arr.push(item.name)
      byParent.set(key, arr)
    }
    for (const [k, arr] of byParent) {
      arr.sort((a, b) => a.localeCompare(b))
      byParent.set(k, arr)
    }
    return byParent
  }

  function buildFolderNodesForCollection(
    collectionName: string,
    fileTree: CollectionFileTree | undefined
  ): SidebarTreeItem[] {
    if (!fileTree) {
      if (collectionFilesLoading[collectionName]) {
        return [
          {
            id: `loading:${collectionName}`,
            kind: 'loading',
            label: 'Loading…'
          }
        ]
      }
      return [
        {
          id: `empty:${collectionName}`,
          kind: 'empty',
          label: 'No folders attached'
        }
      ]
    }

    const filesByRoot = new Map<string, Array<{ filepath: string; relpath: string }>>()
    for (const entry of fileTree.files) {
      const list = filesByRoot.get(entry.rootFolderPath) ?? []
      list.push({ filepath: entry.filepath, relpath: entry.relpath })
      filesByRoot.set(entry.rootFolderPath, list)
    }

    const rootNodes: SidebarTreeItem[] = []

    for (const rootFolderPath of fileTree.attachedFolders) {
      const files = (filesByRoot.get(rootFolderPath) ?? []).slice()
      files.sort((a, b) => a.relpath.localeCompare(b.relpath))

      type FolderNode = {
        id: string
        label: string
        children: Map<string, FolderNode>
        files: Array<{ id: string; label: string; file: { name: string; filepath: string } }>
      }

      const rootFolder: FolderNode = {
        id: `folderRoot:${collectionName}:${rootFolderPath}`,
        label: rootFolderPath.split(/[/\\]/).filter(Boolean).pop() ?? rootFolderPath,
        children: new Map(),
        files: []
      }

      for (const f of files) {
        const parts = f.relpath.split(/[/\\]/).filter(Boolean)
        const fileName = parts[parts.length - 1] ?? f.relpath
        const matches =
          !fileFilter ||
          fuzzyMatch(fileFilter, fileName) ||
          fuzzyMatch(fileFilter, f.relpath) ||
          f.filepath === selectedFile.filepath

        if (!matches) continue

        let cur = rootFolder
        for (let i = 0; i < parts.length - 1; i++) {
          const folderName = parts[i]
          const subRel = parts.slice(0, i + 1).join('/')
          const folderId = `folder:${collectionName}:${rootFolderPath}:${subRel}`
          let next = cur.children.get(folderId)
          if (!next) {
            next = { id: folderId, label: folderName, children: new Map(), files: [] }
            cur.children.set(folderId, next)
          }
          cur = next
        }

        cur.files.push({
          id: `file:${f.filepath}`,
          label: fileName,
          file: { name: fileName, filepath: f.filepath }
        })
      }

      function toSidebarFileItem(f: {
        id: string
        label: string
        file: { name: string; filepath: string }
      }): SidebarTreeItem {
        return {
          id: f.id,
          kind: 'file',
          label: f.label,
          file: f.file,
          children: blocksForFile(f.file)
        }
      }

      function toSidebarFolderItem(folder: FolderNode): SidebarTreeItem {
        const childFolders = Array.from(folder.children.values()).sort((a, b) =>
          a.label.localeCompare(b.label)
        )
        const folderChildren: SidebarTreeItem[] = [
          ...childFolders.map((c) => toSidebarFolderItem(c)),
          ...folder.files
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((f) => toSidebarFileItem(f))
        ]

        return {
          id: folder.id,
          kind: 'folder',
          label: folder.label,
          collectionName,
          children: folderChildren.length ? folderChildren : undefined
        }
      }

      // Hoist attached folder contents directly under the collection.
      const rootSidebarItem = toSidebarFolderItem(rootFolder)
      if (rootSidebarItem.children?.length) {
        rootNodes.push(...rootSidebarItem.children)
      }
    }

    if (rootNodes.length === 0) {
      return [
        {
          id: `empty:${collectionName}`,
          kind: 'empty',
          label: fileFilter ? `No files match “${fileFilter}”` : ''
        }
      ]
    }

    return rootNodes
  }

  const byParent = $derived(buildCollectionHierarchy(collections))

  function ensureParentCollectionsExpanded(name: string, set: SvelteSet<string>): void {
    const item = collections.find((c) => c.name === name)
    if (!item?.parentName) return
    set.add(`collection:${item.parentName}`)
    ensureParentCollectionsExpanded(item.parentName, set)
  }

  function removeCollectionExpandedIds(set: SvelteSet<string>, collectionName: string): void {
    for (const id of Array.from(set)) {
      if (id === `collection:${collectionName}`) {
        set.delete(id)
        continue
      }
      if (id.startsWith(`folderRoot:${collectionName}:`) || id.startsWith(`folder:${collectionName}:`)) {
        set.delete(id)
      }
    }
  }

  function buildExpandedFromPersisted(ids: string[], hasPersistedUi: boolean): SvelteSet<string> {
    const next = new SvelteSet<string>()

    if (hasPersistedUi) {
      for (const id of ids) {
        if (!isCollectionId(id)) continue
        next.add(id)
        ensureParentCollectionsExpanded(collectionNameFromId(id), next)
      }
      for (const id of ids) {
        if (!isPersistableExpandedId(id) || isCollectionId(id)) continue
        const cn = collectionNameFromFolderId(id)
        if (cn) {
          if (next.has(`collection:${cn}`)) next.add(id)
        } else if (id.startsWith('file:')) {
          next.add(id)
        }
      }
      return next
    }

    for (const c of collections) {
      if (c.expanded) {
        next.add(`collection:${c.name}`)
        ensureParentCollectionsExpanded(c.name, next)
      }
    }
    return next
  }

  function loadFilesForExpandedCollections(set: SvelteSet<string>): void {
    for (const id of set) {
      if (!isCollectionId(id)) continue
      void ensureCollectionFilesLoaded(collectionNameFromId(id))
    }
  }

  function folderIdsForFile(
    collectionName: string,
    entry: { rootFolderPath: string; relpath: string }
  ): string[] {
    const parts = entry.relpath.split(/[/\\]/).filter(Boolean)
    if (parts.length <= 1) return []

    const folderIds: string[] = []
    let acc = ''
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i]
      folderIds.push(`folder:${collectionName}:${entry.rootFolderPath}:${acc}`)
    }
    return folderIds
  }

  async function revealRequestInTree(filepath: string, blockIndex: number): Promise<void> {
    for (const c of collections) {
      await ensureCollectionFilesLoaded(c.name)
      const tree = collectionFiles[c.name]
      const entry = tree?.files.find((f) => f.filepath === filepath)
      if (!entry) continue

      selectedCollection = c.name
      selectedFile = { name: entry.relpath.split(/[/\\]/).pop() ?? filepath, filepath }

      const next = new SvelteSet(expanded)
      next.add(`collection:${c.name}`)
      ensureParentCollectionsExpanded(c.name, next)
      for (const folderId of folderIdsForFile(c.name, entry)) {
        next.add(folderId)
      }
      next.add(`file:${filepath}`)
      expanded = next
      lastExpanded = next

      const form = formModels.find((f) => f.blockIndex === blockIndex)
      if (form) activeForm = form

      await tick()
      const blockId = `block:${filepath}:${blockIndex}`
      document
        .querySelector(`[data-tree-id="${CSS.escape(blockId)}"]`)
        ?.scrollIntoView({ block: 'nearest' })
      return
    }
  }

  function persistExplorerUiState(): void {
    const expandedCollectionIds = new Set(Array.from(expanded).filter(isCollectionId))
    const payload: PersistedExplorerExpandedState = {
      expandedIds: Array.from(expanded).filter((id) => {
        if (!isPersistableExpandedId(id)) return false
        if (isCollectionId(id)) return true
        const cn = collectionNameFromFolderId(id)
        if (cn) return expandedCollectionIds.has(`collection:${cn}`)
        return id.startsWith('file:')
      }),
      selectedCollection: selectedCollection || undefined
    }
    void window.KulalaApi.setSettings({ uiExplorerExpanded: payload })
  }

  function buildCollectionNode(name: string): SidebarTreeItem {
    const childrenCollections = (byParent.get(name) ?? []).map(buildCollectionNode)
    const collectionItem = collections.find((c) => c.name === name)

    const isExpanded = expanded.has(`collection:${name}`)

    let folderChildren: SidebarTreeItem[] | undefined
    if (isExpanded) {
      folderChildren = buildFolderNodesForCollection(name, collectionFiles[name])
    } else if (collectionItem?.hasAttachedFolders) {
      folderChildren = [
        {
          id: `stub:collection:${name}`,
          kind: 'loading',
          label: ''
        }
      ]
    }

    const children = [...childrenCollections, ...(folderChildren ?? [])]
    return {
      id: `collection:${name}`,
      kind: 'collection',
      label: name,
      collectionName: name,
      children: children.length ? children : undefined
    }
  }

  let treeItems = $derived<SidebarTreeItem[]>((byParent.get(null) ?? []).map(buildCollectionNode))

  let selectedTreeId = $derived(
    activeForm && selectedFile.filepath
      ? `block:${selectedFile.filepath}:${activeForm.blockIndex}`
      : selectedFile.filepath
        ? `file:${selectedFile.filepath}`
        : selectedCollection
          ? `collection:${selectedCollection}`
          : undefined
  )

  function handleSelectedChange(id: string | undefined): void {
    if (!id) return
    const item = tree.getItem(id) as SidebarTreeItem | undefined
    if (!item || item.kind === 'empty') return

    if (item.kind === 'collection') {
      const changed = selectedCollection !== item.label
      selectedCollection = item.label
      if (changed) ensureExpanded(id)
      void ensureCollectionFilesLoaded(item.label)
      queueMicrotask(() => persistExplorerUiState())
      return
    }

    if (item.kind === 'file' && item.file) {
      const changed = selectedFile.filepath !== item.file.filepath
      selectedFile = item.file
      onfileselect?.(item.file)
      if (changed) {
        ensureExpanded(id)
        if (selectedCollection) {
          ensureExpanded(`collection:${selectedCollection}`)
        }
      }
      return
    }

    if (item.kind === 'block' && item.form) {
      activeForm = item.form
      onblockselect?.(item.form)
    }
  }

  function openContextMenu(e: MouseEvent, target: ContextTarget): void {
    e.preventDefault()
    e.stopPropagation()
    contextX = e.clientX
    contextY = e.clientY
    contextTarget = target
    contextOpen = true
  }

  function closeContextMenu(): void {
    contextOpen = false
    contextTarget = null
  }

  function runAction(action: (target: ContextTarget) => void): void {
    const target = contextTarget
    closeContextMenu()
    if (target) action(target)
  }

  function folderDirFromId(id: string): string | undefined {
    if (id.startsWith('folderRoot:')) {
      const rest = id.slice('folderRoot:'.length)
      const firstColon = rest.indexOf(':')
      if (firstColon < 0) return undefined
      return rest.slice(firstColon + 1)
    }

    // folder:${collectionName}:${rootFolderPath}:${subRel}
    if (!id.startsWith('folder:')) return undefined
    const rest = id.slice('folder:'.length)
    const parts: string[] = []
    let cur = ''
    let colons = 0
    for (const ch of rest) {
      if (ch === ':' && colons < 2) {
        parts.push(cur)
        cur = ''
        colons++
      } else {
        cur += ch
      }
    }
    parts.push(cur)
    if (parts.length < 3) return undefined
    const rootFolderPath = parts[1]
    const subRel = parts.slice(2).join(':')
    if (!subRel) return rootFolderPath
    return `${rootFolderPath.replace(/[\\\\/]+$/, '')}/${subRel}`
  }

  function expandedSetsEqual(a: SvelteSet<string>, b: SvelteSet<string>): boolean {
    if (a.size !== b.size) return false
    for (const id of a) {
      if (!b.has(id)) return false
    }
    return true
  }

  function parseBlockId(id: string): { filepath: string; blockIndex: number } | null {
    if (!id.startsWith('block:')) return null
    const rest = id.slice('block:'.length)
    const lastColon = rest.lastIndexOf(':')
    if (lastColon < 0) return null
    const filepath = rest.slice(0, lastColon)
    const idx = Number(rest.slice(lastColon + 1))
    if (!filepath || !Number.isFinite(idx)) return null
    return { filepath, blockIndex: idx }
  }

  function reloadExpandedCollectionFiles(expandedNames: string[]): void {
    if (expandedNames.length === 0) {
      collectionFiles = {}
      collectionFilesLoading = {}
      return
    }

    const nextFiles = { ...collectionFiles }
    const nextLoading = { ...collectionFilesLoading }
    for (const name of expandedNames) {
      delete nextFiles[name]
      delete nextLoading[name]
    }
    collectionFiles = nextFiles
    collectionFilesLoading = nextLoading

    for (const name of expandedNames) {
      void ensureCollectionFilesLoaded(name)
    }
  }

  let lastHandledRefreshKey = -1

  const tree = new Tree<SidebarTreeItem>({
    items: () => treeItems,
    selected: () => selectedTreeId,
    onSelectedChange: handleSelectedChange,
    expanded: () => expanded,
    onExpandedChange: (value) => {
      const next = new SvelteSet(value)
      const prev = expanded

      const prevCollections = new Set(Array.from(prev).filter(isCollectionId))
      const nextCollections = new Set(Array.from(next).filter(isCollectionId))

      for (const id of prevCollections) {
        if (!nextCollections.has(id)) {
          const name = collectionNameFromId(id)
          removeCollectionExpandedIds(next, name)
          void window.KulalaApi.setCollectionExpanded(name, false)
        }
      }
      for (const id of nextCollections) {
        if (!prevCollections.has(id)) {
          const name = collectionNameFromId(id)
          void window.KulalaApi.setCollectionExpanded(name, true)
          void ensureCollectionFilesLoaded(name)
        }
      }

      lastExpanded = next
      expanded = next

      // Persist explorer expanded state (folders/files) for UI restore.
      queueMicrotask(() => persistExplorerUiState())
    },
    expandOnClick: true
  })

  $effect(() => {
    if (collections.length === 0) return

    if (!explorerStateReady) {
      if (explorerRestoreStarted) return
      explorerRestoreStarted = true
      void (async () => {
        const settings = await window.KulalaApi.getSettings()
        const raw = settings.uiExplorerExpanded as PersistedExplorerExpandedState | undefined
        const hasPersistedUi = raw != null && typeof raw === 'object'
        const ids = Array.isArray(raw?.expandedIds) ? raw.expandedIds : []

        const next = buildExpandedFromPersisted(ids, hasPersistedUi)

        const restoredSelection =
          typeof raw?.selectedCollection === 'string' ? raw.selectedCollection.trim() : ''
        if (restoredSelection && collections.some((c) => c.name === restoredSelection)) {
          selectedCollection = restoredSelection
        }

        if (!expandedSetsEqual(expanded, next)) {
          expanded = next
          lastExpanded = next
        }

        loadFilesForExpandedCollections(next)
        explorerStateReady = true
      })()
      return
    }
  })

  $effect(() => {
    if (!explorerStateReady) return

    const key = refreshKey
    if (key === lastHandledRefreshKey) return
    lastHandledRefreshKey = key

    const expandedNames = untrack(() =>
      Array.from(expanded)
        .filter(isCollectionId)
        .map(collectionNameFromId)
    )

    // Run outside the effect body so ensureCollectionFilesLoaded does not
    // reactively read collectionFiles while this effect is writing them.
    queueMicrotask(() => reloadExpandedCollectionFiles(expandedNames))
  })

  $effect(() => {
    const target = syncTarget
    if (!target) return
    void revealRequestInTree(target.filepath, target.blockIndex)
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="sidebar"
  oncontextmenu={(e) => {
    if ((e.target as HTMLElement).closest('.tree-item')) return
    openContextMenu(e, { kind: 'background' })
  }}
>
  <div class="sidebar-header">
    <span class="sidebar-title">Collections</span>
  </div>

  {#if selectedCollection}
    <div class="file-filter">
      <Input
        inputSize="sm"
        placeholder="Filter files…"
        bind:value={fileFilter}
        aria-label="Filter collection files"
      />
    </div>
  {/if}

  {#if collections.length === 0}
    <p class="sidebar-empty">No collections yet. Right-click here to create a collection.</p>
  {:else}
    <div class="collection-tree" {...tree.root}>
      {@render renderTree(tree.children, 0)}
    </div>
  {/if}
</div>

<ContextMenu bind:open={contextOpen} x={contextX} y={contextY}>
  {#if contextTarget?.kind === 'collection'}
    {#if collections.find((c) => c.name === contextTarget.name)?.hasAttachedFolders}
      <button
        type="button"
        class="kulala-context-item"
        onclick={() =>
          runAction((target) => {
            if (target.kind === 'collection') oncreatefileincollection?.(target.name)
          })}
      >
        New file…
      </button>
    {/if}
    <button
      type="button"
      class="kulala-context-item"
      onclick={() =>
        runAction((target) =>
          onaddfolder?.(target.kind === 'collection' ? target.name : undefined)
        )}
    >
      Add folder…
    </button>
    <button
      type="button"
      class="kulala-context-item"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'collection') oncreatesubcollection?.(target.name)
        })}
    >
      Add subcollection…
    </button>
    <button
      type="button"
      class="kulala-context-item"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'collection') ondetachfolderprompt?.(target.name)
        })}
    >
      Detach folder…
    </button>
    <button
      type="button"
      class="kulala-context-item"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'collection') onrenamecollection?.(target.name)
        })}
    >
      Rename…
    </button>
    <button
      type="button"
      class="kulala-context-item kulala-context-item--danger"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'collection') onremovecollection?.(target.name)
        })}
    >
      Remove collection
    </button>
  {:else if contextTarget?.kind === 'file'}
    <button type="button" class="kulala-context-item" onclick={() => runAction(() => onrunall?.())}>
      Run all
    </button>
    <button
      type="button"
      class="kulala-context-item"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'file') oncreaterequest?.(target.file)
        })}
    >
      New request…
    </button>
    <button
      type="button"
      class="kulala-context-item"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'file') onrenamefile?.(target.file)
        })}
    >
      Rename…
    </button>
    <button
      type="button"
      class="kulala-context-item kulala-context-item--danger"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'file') ondeletefile?.(target.file)
        })}
    >
      Delete file…
    </button>
  {:else if contextTarget?.kind === 'folder'}
    <button
      type="button"
      class="kulala-context-item"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'folder') oncreatefile?.(target.dirPath)
        })}
    >
      New file…
    </button>
    <button
      type="button"
      class="kulala-context-item kulala-context-item--danger"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'folder') ondeletefolder?.(target.dirPath)
        })}
    >
      Delete folder…
    </button>
  {:else if contextTarget?.kind === 'block'}
    <button
      type="button"
      class="kulala-context-item"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'block') onrenameblock?.(target.file, target.form)
        })}
    >
      Rename…
    </button>
    <button
      type="button"
      class="kulala-context-item kulala-context-item--danger"
      onclick={() =>
        runAction((target) => {
          if (target.kind === 'block') ondeleteblock?.(target.file, target.form)
        })}
    >
      Delete request
    </button>
  {:else if contextTarget?.kind === 'background'}
    <button
      type="button"
      class="kulala-context-item"
      onclick={() => runAction(() => oncreatecollection?.())}
    >
      Create collection…
    </button>
    <button
      type="button"
      class="kulala-context-item"
      onclick={() => runAction(() => onaddfolder?.())}
    >
      Add folder…
    </button>
  {/if}
</ContextMenu>

{#snippet renderTree(nodes: (typeof tree.children)[number][], depth: number)}
  {#each nodes as node (node.id)}
    {#if node.item.kind === 'empty'}
      <div class="tree-item tree-item--empty" style:--depth={depth}>
        <span class="tree-chevron-spacer" aria-hidden="true"></span>
        <span class="tree-icon-spacer" aria-hidden="true"></span>
        <span class="tree-label">{node.item.label}</span>
      </div>
    {:else}
      <div
        class="select-none tree-item tree-item--{node.item.kind}"
        class:selected={node.selected}
        class:expanded={node.expanded}
        style:--depth={depth}
        data-tree-id={node.id}
        draggable={node.item.kind === 'block'}
        {...node.attrs}
        ondragstart={(e) => {
          if (node.item.kind !== 'block') return
          const parsed = parseBlockId(node.item.id)
          if (!parsed) return
          e.dataTransfer?.setData(
            'application/x-kulala-block-move',
            JSON.stringify({ filepath: parsed.filepath, blockIndex: parsed.blockIndex })
          )
          e.dataTransfer?.setData('text/plain', node.item.id)
          e.dataTransfer?.setDragImage((e.currentTarget as HTMLElement) ?? new Image(), 0, 0)
        }}
        ondragover={(e) => {
          if (node.item.kind !== 'block') return
          e.preventDefault()
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        }}
        ondrop={(e) => {
          if (node.item.kind !== 'block') return
          e.preventDefault()
          const parsedTarget = parseBlockId(node.item.id)
          if (!parsedTarget) return
          const raw = e.dataTransfer?.getData('application/x-kulala-block-move') ?? ''
          try {
            const moved = JSON.parse(raw) as { filepath?: string; blockIndex?: number }
            if (
              moved.filepath &&
              typeof moved.filepath === 'string' &&
              typeof moved.blockIndex === 'number' &&
              moved.filepath === parsedTarget.filepath
            ) {
              onreorderblocks?.(moved.filepath, moved.blockIndex, parsedTarget.blockIndex)
            }
          } catch {
            return
          }
        }}
        oncontextmenu={(e) => {
          if (node.item.kind === 'collection') {
            openContextMenu(e, { kind: 'collection', name: node.item.label })
          } else if (node.item.kind === 'folder') {
            const dir = folderDirFromId(node.item.id)
            if (dir) openContextMenu(e, { kind: 'folder', dirPath: dir })
          } else if (node.item.kind === 'file' && node.item.file) {
            selectedFile = node.item.file
            onfileselect?.(node.item.file)
            openContextMenu(e, { kind: 'file', file: node.item.file })
          } else if (node.item.kind === 'block' && node.item.form) {
            activeForm = node.item.form
            onblockselect?.(node.item.form)
            openContextMenu(e, {
              kind: 'block',
              file: selectedFile,
              form: node.item.form
            })
          }
        }}
      >
        {#if node.canExpand}
          <button
            type="button"
            class="tree-chevron-btn"
            aria-label={node.expanded ? 'Collapse' : 'Expand'}
            aria-expanded={node.expanded}
            onclick={(e) => {
              e.stopPropagation()
              node.toggleExpand()
            }}
          >
            <i class="fa fa-chevron-right tree-chevron" class:open={node.expanded}></i>
          </button>
        {:else}
          <span class="tree-chevron-spacer" aria-hidden="true"></span>
        {/if}

        {#if node.item.kind === 'collection'}
          <i class="fa fa-layer-group tree-icon" aria-hidden="true"></i>
        {:else if node.item.kind === 'folder'}
          <i class="fa fa-folder tree-icon" aria-hidden="true"></i>
        {:else if node.item.kind === 'file'}
          <i class="fa fa-file-code tree-icon" aria-hidden="true"></i>
        {:else if node.item.kind === 'block'}
          <i class="fa fa-cube tree-icon" aria-hidden="true"></i>
        {:else}
          <span class="tree-icon-spacer" aria-hidden="true"></span>
        {/if}

        <span
          class="tree-label"
          class:dirty={node.item.kind === 'file' &&
            node.item.file &&
            dirtyFilepaths.includes(node.item.file.filepath)}
        >
          {node.item.label}
        </span>
      </div>
    {/if}

    {#if node.expanded && node.children?.length}
      <div class="tree-group" {...tree.group}>
        {@render renderTree(node.children, depth + 1)}
      </div>
    {/if}
  {/each}
{/snippet}

<style>
  .sidebar {
    padding: 0.75rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    flex-shrink: 0;
  }

  .sidebar-title {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--kulala-fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sidebar-empty {
    color: var(--kulala-fg-muted);
    font-size: 0.875rem;
  }

  .file-filter {
    margin-bottom: 0.5rem;
    flex-shrink: 0;
  }

  .collection-tree {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .tree-group {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    padding-left: calc(0.5rem + var(--depth) * 0.75rem);
    border: none;
    border-radius: var(--kulala-radius-sm);
    background: transparent;
    color: var(--kulala-fg);
    font: inherit;
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
  }

  .tree-item:hover {
    background: var(--kulala-bg-muted);
  }

  .tree-item.selected {
    background: color-mix(in srgb, var(--kulala-accent) 18%, transparent);
    color: var(--kulala-fg);
  }

  .tree-item--block.selected {
    background: var(--kulala-accent);
    color: var(--kulala-accent-fg);
  }

  .tree-item--empty {
    cursor: default;
    color: var(--kulala-fg-muted);
    font-size: 0.75rem;
    font-style: italic;
  }

  .tree-item--empty:hover {
    background: transparent;
  }

  .tree-chevron-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    padding: 0;
    border: none;
    border-radius: var(--kulala-radius-sm);
    background: transparent;
    color: inherit;
    cursor: pointer;
    flex-shrink: 0;
  }

  .tree-chevron-btn:hover {
    background: color-mix(in srgb, var(--kulala-fg) 8%, transparent);
  }

  .tree-chevron {
    width: 0.625rem;
    font-size: 0.625rem;
    opacity: 0.6;
    transition: transform 0.15s;
    flex-shrink: 0;
  }

  .tree-chevron.open {
    transform: rotate(90deg);
  }

  .tree-chevron-spacer,
  .tree-icon-spacer {
    width: 0.625rem;
    flex-shrink: 0;
  }

  .tree-icon {
    width: 0.875rem;
    font-size: 0.75rem;
    opacity: 0.75;
    flex-shrink: 0;
    text-align: center;
  }

  .tree-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tree-label.dirty {
    font-style: italic;
  }

  .tree-label.dirty::after {
    content: ' •';
    color: var(--kulala-accent);
    font-style: normal;
  }
</style>
