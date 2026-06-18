<script lang="ts">
  import Input from './ui/Input.svelte'
  import type { CompletionContextOpts, CompletionField } from '../kulala/completion/context'
  import { fetchCompletions } from '../kulala/completion/context'
  import {
    completionDisplay,
    filterCompletionsForUrlField
  } from '../kulala/completion/presentation'

  let {
    value = $bindable(''),
    placeholder = '',
    inputSize = 'md',
    class: className = '',
    field,
    onchange,
    getCompletionOpts
  }: {
    value?: string
    placeholder?: string
    inputSize?: 'sm' | 'md'
    class?: string
    field: CompletionField
    getCompletionOpts?: () => CompletionContextOpts | undefined
    onchange?: () => void
  } = $props()

  let suggestions = $state<
    Array<{ label: string; detail?: string; description?: string; insertText: string }>
  >([])
  let showSuggestions = $state(false)
  let highlightedIndex = $state(0)
  let inputEl = $state<HTMLInputElement | undefined>(undefined)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  async function loadSuggestions(): Promise<void> {
    const opts = getCompletionOpts?.()
    if (!opts) {
      suggestions = []
      showSuggestions = false
      return
    }

    const input = inputEl
    const column = input?.selectionStart ?? value.length
    let items = await fetchCompletions({
      ...opts,
      field: { ...field, column } as CompletionField
    })

    if (field.type === 'url') {
      items = filterCompletionsForUrlField(items, value, column)
    }

    suggestions = items.map((item) => {
      const display = completionDisplay(item, 80)
      return {
        label: display.label,
        detail: display.detail,
        description: display.description,
        insertText: item.insertText ?? item.textEdit?.newText ?? item.label
      }
    })

    showSuggestions = suggestions.length > 0
    highlightedIndex = 0
  }

  function onInput(): void {
    onchange?.()
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void loadSuggestions(), 150)
  }

  function applySuggestion(item: { insertText: string }): void {
    const input = inputEl
    if (!input) return
    const start = input.selectionStart ?? value.length
    const before = value.slice(0, start)
    const inTemplate = /\{\{[^}]*$/.test(before)
    const prefixMatch = before.match(inTemplate ? /[$\w.[\]*'"\s-]+$/ : /[$\w.]+$/)
    const prefixLen = prefixMatch?.[0]?.length ?? 0
    const replaceStart = start - prefixLen
    value = value.slice(0, replaceStart) + item.insertText + value.slice(start)
    showSuggestions = false
    onchange?.()
    queueMicrotask(() => {
      const pos = replaceStart + item.insertText.length
      input.setSelectionRange(pos, pos)
      input.focus()
    })
  }

  function onKeydown(e: KeyboardEvent): void {
    if (!showSuggestions) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      highlightedIndex = Math.max(highlightedIndex - 1, 0)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const item = suggestions[highlightedIndex]
      if (item) applySuggestion(item)
    } else if (e.key === 'Escape') {
      showSuggestions = false
    }
  }
</script>

<div class="complete-input {className}">
  <Input
    bind:value
    {placeholder}
    {inputSize}
    bind:ref={inputEl}
    oninput={onInput}
    onfocus={() => void loadSuggestions()}
    onkeydown={onKeydown}
    onblur={() => setTimeout(() => (showSuggestions = false), 150)}
  />
  {#if showSuggestions}
    <ul class="complete-input-list">
      {#each suggestions as item, idx}
        <li>
          <button
            type="button"
            class="complete-input-item"
            class:highlighted={idx === highlightedIndex}
            onmousedown={(e) => {
              e.preventDefault()
              applySuggestion(item)
            }}
          >
            <span class="complete-input-label">{item.label}</span>
            <span class="complete-input-meta">
              {#if item.detail}
                <span class="complete-input-detail">{item.detail}</span>
              {/if}
              {#if item.description}
                <span class="complete-input-description">{item.description}</span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .complete-input {
    position: relative;
    width: 100%;
  }

  .complete-input-list {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    z-index: 40;
    margin: 0;
    padding: 0.25rem;
    list-style: none;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg-elevated);
    box-shadow: var(--kulala-shadow-lg);
  }

  .complete-input-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.125rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: none;
    border-radius: var(--kulala-radius-sm);
    background: transparent;
    color: var(--kulala-fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .complete-input-item.highlighted,
  .complete-input-item:hover {
    background: var(--kulala-bg-muted);
  }

  .complete-input-label {
    font-weight: 500;
  }

  .complete-input-meta {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    width: 100%;
  }

  .complete-input-detail {
    color: var(--kulala-fg-muted);
    font-size: 0.75rem;
    font-family: var(--kulala-font-mono);
  }

  .complete-input-description {
    color: var(--kulala-fg-muted);
    font-size: 0.75rem;
    line-height: 1.3;
  }
</style>
