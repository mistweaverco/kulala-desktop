<script lang="ts">
  import { Popover } from 'melt/builders'
  import type { Snippet } from 'svelte'

  let {
    children,
    content
  }: {
    children?: Snippet
    content?: Snippet
  } = $props()

  const popover = new Popover()
</script>

<div class="kulala-menu">
  <button type="button" class="kulala-menu-trigger" {...popover.trigger}>
    {@render children?.()}
  </button>
  <div class="kulala-menu-content" {...popover.content}>
    {@render content?.()}
  </div>
</div>

<style>
  .kulala-menu {
    position: relative;
    display: inline-block;
  }

  .kulala-menu-trigger {
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0;
    color: inherit;
  }

  .kulala-menu-content {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 30;
    min-width: 160px;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg-elevated);
    box-shadow: var(--kulala-shadow-lg);
    padding: 0.25rem;
  }

  .kulala-menu-content:not([data-open]) {
    display: none;
  }

  :global(.kulala-menu-item) {
    display: block;
    width: 100%;
    padding: 0.375rem 0.625rem;
    border: none;
    border-radius: var(--kulala-radius-sm);
    background: transparent;
    color: var(--kulala-fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  :global(.kulala-menu-item:hover) {
    background: var(--kulala-bg-muted);
  }
</style>
