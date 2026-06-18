<script lang="ts">
  import type { Snippet } from 'svelte'

  let { children, class: className = '' }: { children?: Snippet; class?: string } = $props()
</script>

<label class="kulala-label {className}">
  {@render children?.()}
</label>

<style>
  .kulala-label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.8125rem;
    color: var(--kulala-fg-muted);
    font-weight: 500;
  }
</style>
