<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  type Variant = 'default' | 'primary' | 'secondary' | 'ghost' | 'success' | 'warning' | 'error' | 'info'
  type Size = 'xs' | 'sm' | 'md'

  let {
    variant = 'default',
    size = 'md',
    class: className = '',
    children,
    ...rest
  }: HTMLButtonAttributes & {
    variant?: Variant
    size?: Size
    class?: string
    children?: Snippet
  } = $props()
</script>

<button class="kulala-btn kulala-btn-{variant} kulala-btn-{size} {className}" {...rest}>
  {@render children?.()}
</button>

<style>
  .kulala-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg-elevated);
    color: var(--kulala-fg);
    font: inherit;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
  }

  .kulala-btn-secondary {
    background: var(--kulala-bg-muted);
    border-color: var(--kulala-accent-hover);
  }

  .kulala-btn:hover:not(:disabled) {
    background: var(--kulala-bg-muted);
    border-color: var(--kulala-fg-subtle);
  }

  .kulala-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .kulala-btn-xs {
    padding: 0.125rem 0.375rem;
    font-size: 0.75rem;
  }

  .kulala-btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
  }

  .kulala-btn-md {
    padding: 0.375rem 0.75rem;
  }

  .kulala-btn-primary {
    background: var(--kulala-accent);
    border-color: var(--kulala-accent);
    color: var(--kulala-accent-fg);
  }

  .kulala-btn-primary:hover:not(:disabled) {
    background: var(--kulala-accent-hover);
    border-color: var(--kulala-accent-hover);
  }

  .kulala-btn-secondary:hover:not(:disabled) {
    background: var(--kulala-accent);
    color: var(--kulala-secondary-fg);
  }

  .kulala-btn-ghost {
    background: transparent;
    border-color: transparent;
  }

  .kulala-btn-ghost:hover:not(:disabled) {
    background: var(--kulala-bg-muted);
  }

  .kulala-btn-success {
    background: var(--kulala-success-bg);
    border-color: var(--kulala-success);
    color: var(--kulala-success);
  }

  .kulala-btn-warning {
    background: var(--kulala-warning-bg);
    border-color: var(--kulala-warning);
    color: var(--kulala-warning);
  }

  .kulala-btn-error {
    background: var(--kulala-error-bg);
    border-color: var(--kulala-error);
    color: var(--kulala-error);
  }

  .kulala-btn-info {
    border-color: var(--kulala-info);
    color: var(--kulala-info);
  }
</style>
