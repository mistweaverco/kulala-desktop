<script lang="ts">
  import type { ScriptFormEntry } from '../../env.d'
  import type { CompletionContextOpts } from '../../kulala/completion/context'
  import {
    scriptFilepathForLsp,
    scriptFormLangToFiletype
  } from '../../kulala/completion/script-lsp'
  import Dialog from '../../components/ui/Dialog.svelte'
  import Button from '../../components/ui/Button.svelte'
  import Input from '../../components/ui/Input.svelte'
  import Select from '../../components/ui/Select.svelte'
  import CodeEditor, { type EditorSyntax } from './CodeEditor.svelte'

  let {
    scripts = $bindable<ScriptFormEntry[]>([]),
    scriptKind = 'pre-request' as 'pre-request' | 'post-request',
    requestTabId = '',
    getCompletionOpts,
    onchange
  }: {
    scripts?: ScriptFormEntry[]
    scriptKind?: 'pre-request' | 'post-request'
    requestTabId?: string
    getCompletionOpts?: () => CompletionContextOpts | undefined
    onchange?: (scripts: ScriptFormEntry[]) => void
  } = $props()

  let dragIndex = $state<number | null>(null)

  let showFileEditor = $state(false)
  let fileEditorIndex = $state<number | null>(null)
  let fileEditorPath = $state('')
  let fileEditorSyntax = $state<EditorSyntax>('javascript')
  let fileEditorContent = $state('')
  let fileEditorSavedContent = $state('')
  let fileEditorError = $state('')
  let showDeleteFileConfirm = $state(false)
  let deleteFileConfirmError = $state('')

  const scriptLspRevision = $derived(
    JSON.stringify(scripts.map((s) => [s.source, s.lang, s.filepath ?? '']))
  )

  const scriptSlotCount = $derived(scripts.length)

  let scriptLspContextGetters = $state<
    Array<
      | (() =>
          | Omit<import('../../kulala/completion/script-lsp').ScriptLspContext, 'content'>
          | undefined)
      | undefined
    >
  >([])

  $effect(() => {
    scriptLspRevision
    scriptSlotCount
    getCompletionOpts
    if (!getCompletionOpts) {
      scriptLspContextGetters = Array.from({ length: scriptSlotCount }, () => undefined)
      return
    }
    scriptLspContextGetters = Array.from({ length: scriptSlotCount }, (_, index) => () => {
      const opts = getCompletionOpts()
      const script = scripts[index]
      if (!opts || !script || script.source !== 'inline') return undefined
      return {
        filepath: scriptFilepathForLsp(opts.filepath, script),
        env: opts.env,
        filetype: scriptFormLangToFiletype(script.lang)
      }
    })
  })

  function emit(next: ScriptFormEntry[]): void {
    scripts = next
    onchange?.(next)
  }

  function updateScript(index: number, partial: Partial<ScriptFormEntry>): void {
    emit(scripts.map((s, i) => (i === index ? { ...s, ...partial } : s)))
  }

  function removeScript(index: number): void {
    emit(scripts.filter((_, i) => i !== index))
  }

  function addInlineScript(): void {
    emit([...scripts, { source: 'inline', lang: 'js', content: '' }])
  }

  function addFileScript(): void {
    emit([...scripts, { source: 'file', lang: 'js', content: '', filepath: '' }])
  }

  async function browseScriptFile(index: number): Promise<void> {
    const picked = await window.KulalaApi.pickScriptFile()
    if (picked) {
      updateScript(index, { filepath: picked, source: 'file' })
    }
  }

  function onLangChange(index: number, lang: string): void {
    updateScript(index, {
      lang: lang as ScriptFormEntry['lang'],
      langExplicit: true
    })
  }

  function onDragStart(index: number, e: DragEvent): void {
    dragIndex = index
    e.dataTransfer?.setData('text/plain', String(index))
    e.dataTransfer!.effectAllowed = 'move'
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'
  }

  function onDrop(index: number, e: DragEvent): void {
    e.preventDefault()
    const from = dragIndex ?? Number(e.dataTransfer?.getData('text/plain'))
    dragIndex = null
    if (Number.isNaN(from) || from === index) return
    const next = [...scripts]
    const [moved] = next.splice(from, 1)
    next.splice(index, 0, moved)
    emit(next)
  }

  function editorSyntax(lang: ScriptFormEntry['lang']): EditorSyntax {
    switch (lang) {
      case 'js':
        return 'javascript'
      case 'ts':
        return 'typescript'
      case 'lua':
        return 'lua'
    }
  }

  function relativePath(filepath: string): string {
    return filepath.replace(/\\/g, '/')
  }

  function fileEditorDirty(): boolean {
    return fileEditorContent !== fileEditorSavedContent
  }

  async function openExternalFileEditor(index: number): Promise<void> {
    const script = scripts[index]
    if (!script || script.source !== 'file' || !script.filepath) return
    fileEditorError = ''
    fileEditorIndex = index
    fileEditorPath = script.filepath
    fileEditorSyntax = editorSyntax(script.lang)
    try {
      const base = getCompletionOpts?.()?.filepath
      const content = await window.KulalaApi.getFileContent(script.filepath, base)
      fileEditorContent = content ?? ''
      fileEditorSavedContent = content ?? ''
      showFileEditor = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      fileEditorError = msg
      showFileEditor = true
    }
  }

  async function saveExternalFile(): Promise<void> {
    if (!fileEditorPath) return
    fileEditorError = ''
    const base = getCompletionOpts?.()?.filepath
    const res = await window.KulalaApi.writeFileContent(fileEditorPath, fileEditorContent, base)
    if (!res.ok) {
      fileEditorError = res.err ?? 'Failed to save file'
      return
    }
    fileEditorSavedContent = fileEditorContent
  }

  function requestDeleteExternalFile(): void {
    deleteFileConfirmError = ''
    showDeleteFileConfirm = true
  }

  async function confirmDeleteExternalFile(): Promise<void> {
    if (!fileEditorPath) return
    deleteFileConfirmError = ''
    fileEditorError = ''
    const base = getCompletionOpts?.()?.filepath
    const res = await window.KulalaApi.deleteFile(fileEditorPath, base)
    if (!res.ok) {
      const msg = res.err ?? 'Failed to delete file'
      fileEditorError = msg
      deleteFileConfirmError = msg
      return
    }

    // After deleting, detach it from the request (different from the trash icon, which only detaches).
    const idx = fileEditorIndex
    if (idx != null && scripts[idx] && scripts[idx].source === 'file') {
      updateScript(idx, { filepath: '' })
    }

    showDeleteFileConfirm = false
    showFileEditor = false
    fileEditorIndex = null
    fileEditorPath = ''
    fileEditorContent = ''
    fileEditorSavedContent = ''
  }

  function scriptCacheKey(index: number): string | undefined {
    if (!requestTabId) return undefined
    return `${requestTabId}:${scriptKind}:${index}`
  }

  function externalScriptCacheKey(): string | undefined {
    if (!requestTabId || fileEditorIndex == null) return undefined
    return `${requestTabId}:external-script:${fileEditorIndex}`
  }

  function scriptFileEditorLspContext():
    | (() =>
        Omit<import('../../kulala/completion/script-lsp').ScriptLspContext, 'content'> | undefined)
    | undefined {
    if (fileEditorIndex == null) return undefined
    const script = scripts[fileEditorIndex]
    if (!script || script.source !== 'file' || !script.filepath) return undefined
    return () => {
      const opts = getCompletionOpts?.()
      return {
        filepath: script.filepath,
        env: opts?.env,
        filetype: scriptFormLangToFiletype(script.lang)
      }
    }
  }
</script>

<div class="script-list" role="list">
  {#if scripts.length === 0}
    <p class="script-empty">No scripts yet.</p>
  {/if}

  {#each scripts as script, idx (idx)}
    <div class="script-row" role="listitem" ondragover={onDragOver} ondrop={(e) => onDrop(idx, e)}>
      <button
        type="button"
        class="drag-handle"
        draggable="true"
        aria-label="Reorder script"
        ondragstart={(e) => onDragStart(idx, e)}
        ondragend={() => (dragIndex = null)}
      >
        <i class="fa fa-grip-vertical"></i>
      </button>

      <div class="script-fields">
        <div class="script-meta">
          <Select
            size="sm"
            value={script.source}
            options={[
              { value: 'inline', label: 'Inline' },
              { value: 'file', label: 'External file' }
            ]}
            onchange={(value) => updateScript(idx, { source: value as ScriptFormEntry['source'] })}
          />
          <Select
            size="sm"
            value={script.lang}
            options={[
              { value: 'js', label: 'JavaScript' },
              { value: 'ts', label: 'TypeScript' }
            ]}
            onchange={(value) => onLangChange(idx, value)}
          />
          <Button variant="error" size="xs" onclick={() => removeScript(idx)}>
            <i class="fa fa-trash"></i>
          </Button>
        </div>

        {#if script.source === 'inline'}
          <div class="script-editor">
            <CodeEditor
              value={script.content}
              syntax={editorSyntax(script.lang)}
              getScriptLspContext={scriptLspContextGetters[idx]}
              fullscreenable
              cacheKey={scriptCacheKey(idx)}
              onchange={(content) => updateScript(idx, { content })}
            />
          </div>
        {:else}
          <div class="script-file-row">
            <Input
              inputSize="sm"
              value={script.filepath ?? ''}
              placeholder="./scripts/pre-request.js"
              oninput={(e) => updateScript(idx, { filepath: (e.target as HTMLInputElement).value })}
            />
            <Button size="xs" onclick={() => browseScriptFile(idx)}>Browse…</Button>
            <Button
              size="xs"
              onclick={() => openExternalFileEditor(idx)}
              disabled={!script.filepath}
            >
              Edit…
            </Button>
          </div>
          {#if script.filepath}
            <p class="script-file-hint">{relativePath(script.filepath)}</p>
          {/if}
        {/if}
      </div>
    </div>
  {/each}

  <div class="script-actions">
    <Button variant="success" size="sm" onclick={addInlineScript}>
      <i class="fa fa-plus"></i> Add inline script
    </Button>
    <Button variant="success" size="sm" onclick={addFileScript}>
      <i class="fa fa-plus"></i> Add file script
    </Button>
  </div>
</div>

<Dialog
  bind:open={showFileEditor}
  title="Edit external script"
  priority="elevated"
  class="script-editor-dialog"
>
  <div class="file-editor-meta">
    <p class="file-editor-path">{relativePath(fileEditorPath)}</p>
    <p class="file-editor-hint">Search: Ctrl+F • Replace: Ctrl+H</p>
  </div>
  {#if fileEditorError}
    <p class="file-editor-error">{fileEditorError}</p>
  {/if}
  <div class="file-editor-editor">
    <CodeEditor
      value={fileEditorContent}
      syntax={fileEditorSyntax}
      getScriptLspContext={scriptFileEditorLspContext()}
      fullscreenable
      cacheKey={externalScriptCacheKey()}
      onchange={(content) => (fileEditorContent = content)}
    />
  </div>
  {#snippet actions()}
    <Button variant="error" onclick={requestDeleteExternalFile} disabled={!fileEditorPath}>
      Delete file…
    </Button>
    <Button variant="success" onclick={() => void saveExternalFile()} disabled={!fileEditorDirty()}>
      Save
    </Button>
    <Button type="button" onclick={() => (showFileEditor = false)}>Close</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showDeleteFileConfirm} title="Delete script file">
  <p>Delete this script file from disk?</p>
  <p class="file-editor-path">{relativePath(fileEditorPath)}</p>
  {#if deleteFileConfirmError}
    <p class="file-editor-error">{deleteFileConfirmError}</p>
  {/if}
  {#snippet actions()}
    <Button type="button" variant="error" onclick={() => void confirmDeleteExternalFile()}
      >Delete</Button
    >
    <Button type="button" onclick={() => (showDeleteFileConfirm = false)}>Cancel</Button>
  {/snippet}
</Dialog>

<style>
  .script-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .script-empty {
    color: var(--kulala-fg-muted);
    font-size: 0.875rem;
    margin: 0;
  }

  .script-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    padding: 0.5rem;
    border: 1px solid var(--kulala-border-subtle);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg-muted);
  }

  .drag-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    padding: 0.25rem 0;
    border: none;
    background: transparent;
    color: var(--kulala-fg-muted);
    cursor: grab;
    flex-shrink: 0;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .script-fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .script-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
  }

  .script-editor {
    min-height: 160px;
  }

  .script-file-row {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }

  .script-file-row :global(input) {
    flex: 1;
  }

  .script-file-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--kulala-fg-muted);
    word-break: break-all;
  }

  .script-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  :global(dialog.kulala-dialog.script-editor-dialog) {
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    max-width: 100vw !important;
    max-height: 100vh !important;
    min-width: 100vw !important;
    min-height: 100vh !important;
    margin: 0 !important;
    transform: none !important;
    border-radius: 0 !important;
    padding: 0.75rem !important;
    display: flex !important;
    flex-direction: column !important;
  }

  :global(.script-editor-dialog .kulala-dialog-body) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  :global(.script-editor-dialog .kulala-dialog-actions) {
    flex-shrink: 0;
  }

  .file-editor-meta {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin-bottom: 0.5rem;
  }

  .file-editor-path {
    margin: 0;
    font-size: 0.875rem;
    color: var(--kulala-fg);
    word-break: break-all;
  }

  .file-editor-hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--kulala-fg-muted);
  }

  .file-editor-error {
    margin: 0.5rem 0;
    color: var(--kulala-error, #e5484d);
    font-size: 0.875rem;
  }

  .file-editor-editor {
    flex: 1;
    min-height: 0;
  }
</style>
