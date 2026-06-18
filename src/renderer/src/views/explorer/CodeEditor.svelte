<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { monaco } from '../monaco'
  import {
    attachAutoExpandSuggestDetails,
    defaultEditorOptions,
    graphqlEditorOptions
  } from '../../kulala/completion/monaco-editor-options'
  import {
    bindModelLsp,
    getModelLspRegistrySize,
    updateModelLsp,
    type EditorCompletionConfig
  } from '../../kulala/completion/monaco-provider'
  import {
    attachCodeEditor,
    parkCodeEditor,
    relayoutCodeEditor,
    takeCodeEditor
  } from '../../kulala/monaco-editor-cache'

  export type EditorSyntax =
    'json' | 'text' | 'html' | 'graphql' | 'javascript' | 'typescript' | 'lua'

  let {
    value = $bindable(''),
    syntax = 'json',
    completionConfig,
    getScriptLspContext,
    fullscreenable = false,
    cacheKey,
    onchange
  }: {
    value?: string
    syntax?: EditorSyntax
    completionConfig?: EditorCompletionConfig
    getScriptLspContext?: () =>
      Omit<import('../../kulala/completion/script-lsp').ScriptLspContext, 'content'> | undefined
    fullscreenable?: boolean
    cacheKey?: string
    onchange?: (value: string) => void
  } = $props()

  let container: HTMLElement
  let editor: monaco.editor.IStandaloneCodeEditor | undefined
  let model: monaco.editor.ITextModel | undefined
  let lastExternalValue = value
  let modelLspDisposable: monaco.IDisposable | undefined
  let contentDisposable: monaco.IDisposable | undefined
  let suggestDetailsDisposable: monaco.IDisposable | undefined
  let tokensDisposable: monaco.IDisposable | undefined
  let tokenProbeTimeout: ReturnType<typeof setTimeout> | undefined
  let resizeObserver: ResizeObserver | undefined
  const editorInstanceId = crypto.randomUUID()
  let mountedCacheKey = $state<string | undefined>(undefined)
  let fullscreen = $state(false)
  const MONACO_DEBUG = import.meta.env.DEV && import.meta.env.VITE_MONACO_DEBUG === '1'

  function languageForSyntax(s: string): string {
    switch (s) {
      case 'json':
        return 'json'
      case 'html':
        return 'html'
      case 'graphql':
        return 'graphql'
      case 'javascript':
        return 'javascript'
      case 'typescript':
        return 'typescript'
      case 'lua':
        return 'lua'
      default:
        return 'plaintext'
    }
  }

  function layoutEditor(): void {
    queueMicrotask(() => editor?.layout())
  }

  function debugLog(event: string, data?: Record<string, unknown>): void {
    if (!MONACO_DEBUG) return
    const rect = container?.getBoundingClientRect?.()
    const size = rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : undefined
    // eslint-disable-next-line no-console
    console.debug(`[monaco] CodeEditor ${event}`, { syntax, size, ...data })
  }

  function attachTokenizationProbe(targetModel: monaco.editor.ITextModel): void {
    tokensDisposable?.dispose()
    tokensDisposable = undefined
    if (tokenProbeTimeout) {
      window.clearTimeout(tokenProbeTimeout)
      tokenProbeTimeout = undefined
    }
    if (!MONACO_DEBUG) return

    const startedAt = performance.now()
    let fired = false
    tokenProbeTimeout = window.setTimeout(() => {
      if (fired) return
      const ms = Math.round(performance.now() - startedAt)
      debugLog('tokenization_timeout', { languageId: targetModel.getLanguageId(), ms })
    }, 2500)
    const anyModel = targetModel as unknown as {
      onDidChangeTokens?: (listener: () => void) => monaco.IDisposable
      forceTokenization?: (lineNumber: number) => void
    }
    const subscribe =
      anyModel.onDidChangeTokens?.bind(anyModel) ??
      targetModel.onDidChangeDecorations.bind(targetModel)
    tokensDisposable = subscribe(() => {
      if (fired) return
      fired = true
      if (tokenProbeTimeout) {
        window.clearTimeout(tokenProbeTimeout)
        tokenProbeTimeout = undefined
      }
      const ms = Math.round(performance.now() - startedAt)
      debugLog('first_tokens', { languageId: targetModel.getLanguageId(), ms })
    })
    queueMicrotask(() =>
      debugLog('model_attached', {
        languageId: targetModel.getLanguageId(),
        lines: targetModel.getLineCount(),
        chars: (targetModel as unknown as { getValueLength?: () => number }).getValueLength?.()
      })
    )

    // Encourage tokenization to start immediately (Monaco can otherwise wait for idle).
    try {
      const lines = targetModel.getLineCount()
      anyModel.forceTokenization?.(Math.min(lines, 200))
    } catch {
      // ignore
    }
  }

  function setFullscreen(next: boolean): void {
    fullscreen = next
    layoutEditor()
  }

  function toggleFullscreen(): void {
    setFullscreen(!fullscreen)
  }

  function onFullscreenKeydown(e: KeyboardEvent): void {
    if (fullscreen && e.key === 'Escape') {
      e.preventDefault()
      setFullscreen(false)
    }
  }

  function syncSuggestDetailsAttachment(): void {
    suggestDetailsDisposable?.dispose()
    suggestDetailsDisposable = undefined
    if (editor && completionConfig) {
      suggestDetailsDisposable = attachAutoExpandSuggestDetails(editor)
    }
  }

  function modelLspOpts(): {
    completionConfig?: EditorCompletionConfig
    scriptLspConfig?: { getContext: NonNullable<typeof getScriptLspContext> }
  } {
    if (getScriptLspContext) {
      return { scriptLspConfig: { getContext: getScriptLspContext } }
    }
    if (completionConfig) {
      return { completionConfig }
    }
    return {}
  }

  function syncModelLsp(): void {
    if (!model) return
    updateModelLsp(model, modelLspOpts())
    syncSuggestDetailsAttachment()
  }

  function scheduleLayout(): void {
    queueMicrotask(() => {
      if (!editor || !container) return
      relayoutCodeEditor(editor, container)
      requestAnimationFrame(() => {
        if (editor && container) relayoutCodeEditor(editor, container)
      })
    })
  }

  function setupEditorListeners(): void {
    if (!editor) return
    resizeObserver = new ResizeObserver(() => scheduleLayout())
    resizeObserver.observe(container)
    scheduleLayout()
    contentDisposable = editor.onDidChangeModelContent(() => {
      const next = editor!.getValue()
      lastExternalValue = next
      value = next
      onchange?.(next)
    })
  }

  function teardownEditorListeners(): void {
    modelLspDisposable?.dispose()
    modelLspDisposable = undefined
    contentDisposable?.dispose()
    contentDisposable = undefined
    suggestDetailsDisposable?.dispose()
    suggestDetailsDisposable = undefined
    tokensDisposable?.dispose()
    tokensDisposable = undefined
    if (tokenProbeTimeout) {
      window.clearTimeout(tokenProbeTimeout)
      tokenProbeTimeout = undefined
    }
    resizeObserver?.disconnect()
    resizeObserver = undefined
  }

  onMount(() => {
    mountedCacheKey = cacheKey
    void (async () => {
      await tick()
      if (!container) return

      const cached = cacheKey ? takeCodeEditor(cacheKey) : undefined
      if (cached) {
        debugLog('restore_cached')
        editor = cached.editor
        model = cached.model
        attachCodeEditor(cached, container)
        lastExternalValue = editor.getValue()
        if (lastExternalValue !== value) {
          editor.setValue(value)
          lastExternalValue = value
        }
        modelLspDisposable = bindModelLsp(model, modelLspOpts())
        attachTokenizationProbe(model)
        syncModelLsp()
        setupEditorListeners()
        if (MONACO_DEBUG) {
          debugLog('mounted_cached', { registrySize: getModelLspRegistrySize() })
        }
        return
      }

      const options = syntax === 'graphql' ? graphqlEditorOptions() : defaultEditorOptions()

      debugLog('create_start')
      editor = monaco.editor.create(container, options)
      debugLog('create_done')
      syncSuggestDetailsAttachment()
      model = monaco.editor.createModel(
        value,
        languageForSyntax(syntax),
        monaco.Uri.parse(`kulala://editor/${editorInstanceId}`)
      )
      editor.setModel(model)
      modelLspDisposable = bindModelLsp(model, modelLspOpts())
      attachTokenizationProbe(model)
      syncModelLsp()
      setupEditorListeners()
      if (MONACO_DEBUG) {
        debugLog('mounted', { registrySize: getModelLspRegistrySize() })
      }
    })()
  })

  $effect(() => {
    if (!editor) return
    const lang = languageForSyntax(syntax)
    completionConfig
    getScriptLspContext
    const currentModel = editor.getModel()
    if (currentModel && currentModel.getLanguageId() !== lang) {
      debugLog('setModelLanguage', { from: currentModel.getLanguageId(), to: lang })
      monaco.editor.setModelLanguage(currentModel, lang)
      attachTokenizationProbe(currentModel)
    }
    syncModelLsp()
  })

  onDestroy(() => {
    teardownEditorListeners()
    const key = mountedCacheKey
    if (key && editor && model) {
      parkCodeEditor(key, { editor, model, viewState: editor.saveViewState() })
      editor = undefined
      model = undefined
      if (MONACO_DEBUG) {
        debugLog('parked', { cacheKey: key, registrySize: getModelLspRegistrySize() })
      }
      return
    }
    editor?.dispose()
    model?.dispose()
    if (MONACO_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[monaco] CodeEditor destroyed', {
        id: editorInstanceId,
        registrySize: getModelLspRegistrySize()
      })
    }
  })

  $effect(() => {
    if (!editor || !container) return
    if (value !== lastExternalValue) {
      lastExternalValue = value
      const current = editor.getValue()
      if (current !== value) {
        editor.setValue(value)
      }
    }
  })

  $effect(() => {
    if (fullscreenable && fullscreen) {
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onFullscreenKeydown)
      return () => {
        document.body.style.overflow = previousOverflow
        window.removeEventListener('keydown', onFullscreenKeydown)
      }
    }
    return undefined
  })
</script>

<div class="editor-wrap" class:fullscreen>
  {#if fullscreenable}
    <div class="editor-toolbar">
      <button
        type="button"
        class="fullscreen-btn"
        aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
        onclick={toggleFullscreen}
      >
        <i class="fa {fullscreen ? 'fa-compress' : 'fa-expand'}"></i>
      </button>
    </div>
  {/if}
  <div class="editor-container" bind:this={container}></div>
</div>

<style>
  .editor-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 160px;
    padding: 4px;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg);
  }

  .editor-wrap.fullscreen {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    flex-direction: column;
    min-height: unset;
    padding: 0.75rem;
    border-radius: 0;
    box-shadow: var(--kulala-shadow-lg);
  }

  .editor-toolbar {
    position: absolute;
    top: 0.375rem;
    right: 0.375rem;
    z-index: 1;
  }

  .editor-wrap.fullscreen .editor-toolbar {
    position: static;
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.375rem;
  }

  .fullscreen-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 1px solid var(--kulala-border-subtle);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg-elevated);
    color: var(--kulala-fg-muted);
    cursor: pointer;
  }

  .fullscreen-btn:hover {
    color: var(--kulala-fg);
    background: var(--kulala-bg-muted);
  }

  .editor-container {
    width: 100%;
    height: 100%;
    min-height: 150px;
  }

  .editor-wrap.fullscreen .editor-container {
    flex: 1;
    min-height: 0;
  }
</style>
