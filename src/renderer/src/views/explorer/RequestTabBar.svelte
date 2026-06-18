<script lang="ts">
  import type { FileSession, RequestTab } from './session'
  import { tabLabel } from './session'

  let {
    tabs = [],
    activeTabId = '',
    sessions = {},
    dirtyFilepaths = [],
    onactivate,
    onclose
  }: {
    tabs?: RequestTab[]
    activeTabId?: string
    sessions?: Record<string, FileSession>
    dirtyFilepaths?: string[]
    onactivate?: (tabId: string) => void
    onclose?: (tabId: string) => void
  } = $props()

  function isDirty(tab: RequestTab): boolean {
    return dirtyFilepaths.includes(tab.filepath)
  }
</script>

{#if tabs.length > 0}
  <div class="request-tab-bar" role="tablist" aria-label="Open requests">
    {#each tabs as tab (tab.id)}
      {@const session = sessions[tab.filepath]}
      {@const label = tabLabel(session, tab)}
      {@const dirty = isDirty(tab)}
      <div class="request-tab" class:active={activeTabId === tab.id} class:dirty>
        <button
          type="button"
          class="request-tab-select"
          role="tab"
          aria-selected={activeTabId === tab.id}
          onclick={() => onactivate?.(tab.id)}
        >
          {#if dirty}
            <span class="dirty-dot" aria-label="Unsaved changes"></span>
          {/if}
          <span class="request-tab-name">{label}</span>
          {#if session}
            <span class="request-tab-file">{session.fileName}</span>
          {/if}
        </button>
        <button
          type="button"
          class="request-tab-close"
          aria-label="Close {label}"
          onclick={(e) => {
            e.stopPropagation()
            onclose?.(tab.id)
          }}
        >
          <i class="fa fa-times"></i>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .request-tab-bar {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid var(--kulala-border-subtle);
    flex-shrink: 0;
  }

  .request-tab {
    display: flex;
    align-items: stretch;
    max-width: 240px;
    border: 1px solid var(--kulala-border-subtle);
    border-radius: var(--kulala-radius-sm);
    background: var(--kulala-bg-muted);
    flex-shrink: 0;
  }

  .request-tab.active {
    border-color: var(--kulala-accent);
    background: color-mix(in srgb, var(--kulala-accent) 10%, var(--kulala-bg-muted));
  }

  .request-tab-select {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--kulala-fg);
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    text-align: left;
  }

  .request-tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    padding: 0;
    border: none;
    border-left: 1px solid var(--kulala-border-subtle);
    background: transparent;
    color: var(--kulala-fg-muted);
    cursor: pointer;
    flex-shrink: 0;
  }

  .request-tab-close:hover {
    color: var(--kulala-fg);
    background: color-mix(in srgb, var(--kulala-fg) 6%, transparent);
  }

  .dirty-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--kulala-accent);
    flex-shrink: 0;
  }

  .request-tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .request-tab-file {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--kulala-fg-muted);
    font-size: 0.75rem;
  }
</style>
