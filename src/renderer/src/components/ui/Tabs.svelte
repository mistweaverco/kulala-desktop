<script lang="ts">
  import { Tabs } from 'melt/builders'
  import type { Snippet } from 'svelte'

  type TabItem = { value: string; label: string }

  let {
    value = $bindable(''),
    items,
    class: className = '',
    children,
    onvaluechange
  }: {
    value?: string
    items: TabItem[]
    class?: string
    children?: Snippet<[string]>
    onvaluechange?: (value: string) => void
  } = $props()

  const tabs = new Tabs({
    value: () => value,
    onValueChange: (v) => {
      value = v
      onvaluechange?.(v)
    }
  })
</script>

<div class="kulala-tabs {className}">
  <div class="kulala-tabs-list" {...tabs.triggerList}>
    {#each items as item}
      <button type="button" class="kulala-tab" {...tabs.getTrigger(item.value)}>
        {item.label}
      </button>
    {/each}
  </div>
  {#each items as item}
    {#if value === item.value}
      <div
        class="kulala-tab-panel"
        role="tabpanel"
        id={tabs.getContent(item.value).id}
        aria-labelledby={tabs.getContent(item.value)['aria-labelledby']}
        data-active=""
      >
        {@render children?.(item.value)}
      </div>
    {/if}
  {/each}
</div>

<style>
  .kulala-tabs-list {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--kulala-border);
    margin-bottom: 0.75rem;
  }

  .kulala-tab {
    padding: 0.375rem 0.75rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--kulala-fg-muted);
    font: inherit;
    cursor: pointer;
    margin-bottom: -1px;
  }

  .kulala-tab[data-active] {
    color: var(--kulala-fg);
    border-bottom-color: var(--kulala-accent);
  }

  .kulala-tab-panel {
    min-height: 0;
  }
</style>
