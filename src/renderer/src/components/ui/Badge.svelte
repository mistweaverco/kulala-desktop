<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    variant = 'default',
    class: className = '',
    children
  }: {
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
    class?: string
    children?: Snippet
  } = $props()
</script>

<span class="kulala-badge kulala-badge-{variant} {className}">
  {@render children?.()}
</span>

<style>
  .kulala-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.375rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid var(--kulala-border);
    background: var(--kulala-bg-muted);
    color: var(--kulala-fg-muted);
  }

  .kulala-badge-success {
    border-color: var(--kulala-success);
    color: var(--kulala-success);
  }

  .kulala-badge-error {
    border-color: var(--kulala-error);
    color: var(--kulala-error);
  }

  .kulala-badge-info {
    border-color: var(--kulala-info);
    color: var(--kulala-info);
  }
</style>
