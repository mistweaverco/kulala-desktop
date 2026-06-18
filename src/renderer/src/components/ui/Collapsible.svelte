<script lang="ts">
  import { Collapsible } from 'melt/builders'
  import type { Snippet } from 'svelte'

  let {
    open = $bindable(false),
    title,
    class: className = '',
    onOpenChange,
    children
  }: {
    open?: boolean
    title: string
    class?: string
    onOpenChange?: (open: boolean) => void
    children?: Snippet
  } = $props()

  const collapsible = new Collapsible({
    open: () => open,
    onOpenChange: (v) => {
      open = v
      onOpenChange?.(v)
    }
  })
</script>

<div class="kulala-collapsible {className}">
  <button type="button" class="kulala-collapsible-trigger" {...collapsible.trigger}>
    <i class="fa fa-chevron-right kulala-collapsible-icon" class:open></i>
    <span>{title}</span>
  </button>
  {#if open}
    <div class="kulala-collapsible-content" {...collapsible.content}>
      {@render children?.()}
    </div>
  {/if}
</div>

<style>
  .kulala-collapsible {
    border: 1px solid var(--kulala-border-subtle);
    border-radius: var(--kulala-radius);
    overflow: hidden;
  }

  .kulala-collapsible-trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    border: none;
    background: var(--kulala-bg-elevated);
    color: var(--kulala-fg);
    font: inherit;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }

  .kulala-collapsible-trigger:hover {
    background: var(--kulala-bg-muted);
  }

  .kulala-collapsible-icon {
    font-size: 0.625rem;
    transition: transform 0.15s;
    opacity: 0.6;
  }

  .kulala-collapsible-icon.open {
    transform: rotate(90deg);
  }

  .kulala-collapsible-content {
    padding: 0.375rem 0.5rem 0.5rem;
    background: var(--kulala-bg);
  }
</style>
