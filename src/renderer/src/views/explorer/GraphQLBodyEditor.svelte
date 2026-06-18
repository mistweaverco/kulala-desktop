<script lang="ts">
  import { onMount } from 'svelte'
  import CodeEditor from './CodeEditor.svelte'
  import type { CompletionContextOpts } from '../../kulala/completion/context'
  import {
    createGraphQLQueryCompletionConfig,
    createGraphQLVariablesCompletionConfig
  } from '../../kulala/completion/monaco-provider'

  let {
    query = $bindable(''),
    variables = $bindable(''),
    requestTabId = '',
    getCompletionOpts
  }: {
    query?: string
    variables?: string
    requestTabId?: string
    getCompletionOpts?: () => CompletionContextOpts | undefined
  } = $props()

  let queryHeight = $state(55)

  let queryConfig = $derived(
    getCompletionOpts ? createGraphQLQueryCompletionConfig(getCompletionOpts) : undefined
  )
  let variablesConfig = $derived(
    getCompletionOpts ? createGraphQLVariablesCompletionConfig(getCompletionOpts) : undefined
  )

  let splitHandle: HTMLElement
  let containerEl: HTMLElement

  onMount(() => {
    let dragging = false
    let startY = 0
    let startPct = queryHeight

    const onMouseDown = (e: MouseEvent): void => {
      dragging = true
      startY = e.clientY
      startPct = queryHeight
    }
    const onMouseMove = (e: MouseEvent): void => {
      if (!dragging || !containerEl) return
      const h = containerEl.offsetHeight
      const delta = ((e.clientY - startY) / h) * 100
      queryHeight = Math.min(80, Math.max(25, startPct + delta))
    }
    const onMouseUp = (): void => {
      dragging = false
    }

    splitHandle.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      splitHandle.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  })
</script>

<div class="graphql-body" bind:this={containerEl}>
  <div class="graphql-section" style="height: {queryHeight}%">
    <div class="graphql-section-label">Query</div>
    <CodeEditor
      bind:value={query}
      syntax="graphql"
      completionConfig={queryConfig}
      cacheKey={requestTabId ? `${requestTabId}:graphql-query` : undefined}
    />
  </div>
  <div class="graphql-split" bind:this={splitHandle}></div>
  <div class="graphql-section" style="height: {100 - queryHeight}%">
    <div class="graphql-section-label">Variables (JSON)</div>
    <CodeEditor
      bind:value={variables}
      syntax="json"
      completionConfig={variablesConfig}
      cacheKey={requestTabId ? `${requestTabId}:graphql-variables` : undefined}
    />
  </div>
</div>

<style>
  .graphql-body {
    display: flex;
    flex-direction: column;
    height: 280px;
    gap: 0;
  }

  .graphql-section {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .graphql-section-label {
    font-size: 0.75rem;
    color: var(--kulala-fg-muted);
    margin-bottom: 0.25rem;
    font-weight: 500;
  }

  .graphql-split {
    height: 6px;
    flex-shrink: 0;
    cursor: ns-resize;
    background: var(--kulala-border-subtle);
    border-radius: 2px;
    margin: 2px 0;
  }

  .graphql-split:hover {
    background: var(--kulala-accent);
  }
</style>
