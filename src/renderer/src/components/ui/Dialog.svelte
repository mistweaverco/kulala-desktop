<script lang="ts">
  import { Dialog } from 'melt/builders'
  import type { Snippet } from 'svelte'
  import Button from './Button.svelte'

  let {
    open = $bindable(false),
    title = '',
    class: className = '',
    priority = 'default',
    onOpenChange,
    children,
    actions
  }: {
    open?: boolean
    title?: string
    class?: string
    priority?: 'default' | 'elevated'
    onOpenChange?: (open: boolean) => void
    children?: Snippet
    actions?: Snippet
  } = $props()

  function setOpen(next: boolean): void {
    onOpenChange?.(next)
    open = next
  }

  const dialog = new Dialog({
    open: () => open,
    onOpenChange: setOpen
  })
</script>

{#if open}
  <div
    class="kulala-dialog-backdrop"
    class:kulala-dialog-backdrop-elevated={priority === 'elevated'}
    {...dialog.overlay}
    onclick={() => setOpen(false)}
    onkeydown={() => {}}
    role="presentation"
  ></div>
  <dialog
    class="kulala-dialog {className}"
    class:kulala-dialog-elevated={priority === 'elevated'}
    open
    {...dialog.content}
  >
    {#if title}
      <h2 class="kulala-dialog-title">{title}</h2>
    {/if}
    <div class="kulala-dialog-body">
      {@render children?.()}
    </div>
    <div class="kulala-dialog-actions">
      {#if actions}
        {@render actions()}
      {:else}
        <Button onclick={() => setOpen(false)}>Close</Button>
      {/if}
    </div>
  </dialog>
{/if}

<style>
  .kulala-dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 40;
  }

  .kulala-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 50;
    margin: 0;
    padding: 1.25rem;
    min-width: 320px;
    max-width: min(90vw, 640px);
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius-lg);
    background: var(--kulala-bg-elevated);
    color: var(--kulala-fg);
    box-shadow: var(--kulala-shadow-lg);
  }

  .kulala-dialog-backdrop-elevated {
    z-index: 60;
  }

  .kulala-dialog-elevated {
    z-index: 70;
  }

  .kulala-dialog-title {
    margin: 0 0 0.75rem;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .kulala-dialog-body {
    margin-bottom: 1rem;
  }

  .kulala-dialog-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>
