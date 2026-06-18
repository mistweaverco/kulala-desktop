<script lang="ts">
  import { computePosition, flip, offset, shift } from '@floating-ui/dom'
  import type { Snippet } from 'svelte'

  let {
    open = $bindable(false),
    x = 0,
    y = 0,
    children
  }: {
    open?: boolean
    x?: number
    y?: number
    children?: Snippet
  } = $props()

  let menuEl = $state<HTMLDivElement | undefined>(undefined)

  $effect(() => {
    if (!open || !menuEl) return

    const virtualEl = {
      getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 })
    }

    void computePosition(virtualEl, menuEl, {
      placement: 'bottom-start',
      middleware: [offset(4), flip(), shift({ padding: 8 })]
    }).then(({ x: nextX, y: nextY }) => {
      menuEl.style.left = `${nextX}px`
      menuEl.style.top = `${nextY}px`
    })
  })

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      open = false
    }
  }

  function onBackdropClick(): void {
    open = false
  }
</script>

<svelte:window onkeydown={open ? onKeyDown : undefined} />

{#if open}
  <div
    class="kulala-context-backdrop"
    onclick={onBackdropClick}
    onkeydown={() => {}}
    role="presentation"
  ></div>
  <div class="kulala-context-menu" bind:this={menuEl} role="menu">
    {@render children?.()}
  </div>
{/if}

<style>
  .kulala-context-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .kulala-context-menu {
    position: fixed;
    z-index: 50;
    min-width: 160px;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg-elevated);
    box-shadow: var(--kulala-shadow-lg);
    padding: 0.25rem;
  }

  :global(.kulala-context-item) {
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

  :global(.kulala-context-item:hover) {
    background: var(--kulala-bg-muted);
  }

  :global(.kulala-context-item--danger) {
    color: var(--kulala-error, #e5484d);
  }
</style>
