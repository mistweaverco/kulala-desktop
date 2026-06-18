<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements'

  let {
    class: className = '',
    inputSize = 'md',
    value = $bindable(''),
    ref = $bindable<HTMLInputElement | undefined>(undefined),
    oninput,
    onfocus,
    onkeydown,
    onblur,
    ...rest
  }: HTMLInputAttributes & {
    class?: string
    inputSize?: 'sm' | 'md'
    value?: string
    ref?: HTMLInputElement | undefined
    oninput?: (e: Event) => void
    onfocus?: (e: FocusEvent) => void
    onkeydown?: (e: KeyboardEvent) => void
    onblur?: (e: FocusEvent) => void
  } = $props()
</script>

<input
  class="kulala-input kulala-input-{inputSize} {className}"
  bind:this={ref}
  bind:value
  {oninput}
  {onfocus}
  {onkeydown}
  {onblur}
  {...rest}
/>

<style>
  .kulala-input {
    width: 100%;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg);
    color: var(--kulala-fg);
    font: inherit;
    outline: none;
    transition: border-color 0.15s;
  }

  .kulala-input:focus {
    border-color: var(--kulala-accent);
  }

  .kulala-input::placeholder {
    color: var(--kulala-fg-subtle);
  }

  .kulala-input-md {
    padding: 0.375rem 0.625rem;
  }

  .kulala-input-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
  }
</style>
