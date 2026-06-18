<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { monaco } from '../monaco'
  import type { ResponseBodyLanguage } from '../../kulala/response-body'
  import {
    attachResponseViewer,
    parkResponseViewer,
    relayoutResponseViewer,
    takeResponseViewer
  } from '../../kulala/monaco-editor-cache'

  let {
    value = '',
    language = 'plaintext' as ResponseBodyLanguage,
    cacheKey
  }: {
    value?: string
    language?: ResponseBodyLanguage
    cacheKey?: string
  } = $props()

  let container: HTMLElement
  let editor: monaco.editor.IStandaloneCodeEditor | undefined
  let model: monaco.editor.ITextModel | undefined
  let lastValue = $state('')
  let lastLanguage = $state<ResponseBodyLanguage>('plaintext')
  let tokensDisposable: monaco.IDisposable | undefined
  let resizeObserver: ResizeObserver | undefined
  const viewerInstanceId = crypto.randomUUID()
  let mountedCacheKey = $state<string | undefined>(undefined)
  const MONACO_DEBUG = import.meta.env.DEV && import.meta.env.VITE_MONACO_DEBUG === '1'

  function scheduleLayout(): void {
    queueMicrotask(() => {
      if (!editor || !container) return
      relayoutResponseViewer(editor, container)
      requestAnimationFrame(() => {
        if (editor && container) relayoutResponseViewer(editor, container)
      })
    })
  }

  function monacoLanguage(lang: ResponseBodyLanguage): string {
    switch (lang) {
      case 'json':
        return 'json'
      case 'html':
        return 'html'
      case 'xml':
        return 'xml'
      case 'javascript':
        return 'javascript'
      default:
        return 'plaintext'
    }
  }

  function debugLog(event: string, data?: Record<string, unknown>): void {
    if (!MONACO_DEBUG) return
    const rect = container?.getBoundingClientRect?.()
    const size = rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : undefined
    // eslint-disable-next-line no-console
    console.debug(`[monaco] ResponseBodyViewer ${event}`, { language, size, ...data })
  }

  function attachTokenizationProbe(targetModel: monaco.editor.ITextModel): void {
    tokensDisposable?.dispose()
    tokensDisposable = undefined
    if (!MONACO_DEBUG) return

    const startedAt = performance.now()
    let fired = false
    const anyModel = targetModel as unknown as {
      onDidChangeTokens?: (listener: () => void) => monaco.IDisposable
    }
    const subscribe =
      anyModel.onDidChangeTokens?.bind(anyModel) ??
      targetModel.onDidChangeDecorations.bind(targetModel)
    tokensDisposable = subscribe(() => {
      if (fired) return
      fired = true
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
  }

  onMount(() => {
    mountedCacheKey = cacheKey
    void (async () => {
      await tick()
      if (!container) return

      const cached = cacheKey ? takeResponseViewer(cacheKey) : undefined
      if (cached) {
        debugLog('restore_cached')
        editor = cached.editor
        model = cached.model
        attachResponseViewer(cached, container)
        lastValue = model.getValue()
        lastLanguage = language
        if (lastValue !== value) {
          model.setValue(value)
          lastValue = value
        }
        resizeObserver = new ResizeObserver(() => scheduleLayout())
        resizeObserver.observe(container)
        scheduleLayout()
        return
      }

      lastValue = value
      lastLanguage = language
      model = monaco.editor.createModel(
        value,
        monacoLanguage(language),
        monaco.Uri.parse(`kulala://response/${viewerInstanceId}`)
      )
      attachTokenizationProbe(model)
      editor = monaco.editor.create(container, {
        model,
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 12,
        wordWrap: 'on',
        padding: { top: 8, bottom: 8 },
        scrollbar: { vertical: 'auto', horizontal: 'auto' }
      })
      try {
        const mAny = model as unknown as { forceTokenization?: (lineNumber: number) => void }
        const lines = model.getLineCount()
        mAny.forceTokenization?.(Math.min(lines, 200))
      } catch {
        // ignore
      }
      resizeObserver = new ResizeObserver(() => scheduleLayout())
      resizeObserver.observe(container)
      scheduleLayout()
    })()
  })

  onDestroy(() => {
    tokensDisposable?.dispose()
    resizeObserver?.disconnect()
    const key = mountedCacheKey
    if (key && editor && model) {
      parkResponseViewer(key, { editor, model, viewState: editor.saveViewState() })
      editor = undefined
      model = undefined
      if (MONACO_DEBUG) {
        debugLog('parked', { cacheKey: key })
      }
      return
    }
    editor?.dispose()
    model?.dispose()
    if (MONACO_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[monaco] ResponseBodyViewer destroyed', { id: viewerInstanceId })
    }
  })

  $effect(() => {
    if (!editor) return
    if (value !== lastValue) {
      lastValue = value
      const m = editor.getModel()
      if (m && m.getValue() !== value) m.setValue(value)
    }
  })

  $effect(() => {
    if (!editor || language === lastLanguage) return
    lastLanguage = language
    const m = editor.getModel()
    if (!m) return
    const lang = monacoLanguage(language)
    if (m.getLanguageId() !== lang) {
      debugLog('setModelLanguage', { from: m.getLanguageId(), to: lang })
      monaco.editor.setModelLanguage(m, lang)
      attachTokenizationProbe(m)
    }
  })
</script>

<div class="response-body-viewer">
  <div class="viewer-container" bind:this={container}></div>
</div>

<style>
  .response-body-viewer {
    flex: 1;
    width: 100%;
    min-height: 0;
    height: 100%;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg-muted);
    overflow: hidden;
  }

  .viewer-container {
    width: 100%;
    height: 100%;
  }
</style>
