<script lang="ts">
  import { Select } from 'melt/builders'

  type Option = { value: string; label: string }

  let {
    value = $bindable(''),
    options,
    class: className = '',
    size = 'md',
    ref = $bindable<HTMLButtonElement | undefined>(undefined),
    onchange
  }: {
    value?: string
    options: Option[]
    class?: string
    size?: 'sm' | 'md'
    ref?: HTMLButtonElement | undefined
    onchange?: (value: string) => void
  } = $props()

  const select = new Select<string>({
    value: () => value,
    onValueChange: (v) => {
      if (typeof v === 'string') {
        value = v
        onchange?.(v)
      }
    }
  })

  $effect(() => {
    select.getOptionLabel = (v) => options.find((o) => o.value === v)?.label ?? String(v)
  })

  const selectedLabel = $derived(options.find((o) => o.value === value)?.label ?? value)
</script>

<div class="kulala-select kulala-select-{size} {className}">
  <button type="button" class="kulala-select-trigger" bind:this={ref} {...select.trigger}>
    {selectedLabel}
    <i class="fa fa-chevron-down kulala-select-chevron"></i>
  </button>
  <div class="kulala-select-content" {...select.content}>
    {#each options as option}
      <div class="kulala-select-option" {...select.getOption(option.value, option.label)}>
        {option.label}
      </div>
    {/each}
  </div>
</div>

<style>
  .kulala-select {
    position: relative;
    display: inline-block;
  }

  .kulala-select-trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg);
    color: var(--kulala-fg);
    font: inherit;
    cursor: pointer;
    white-space: nowrap;
  }

  .kulala-select-md .kulala-select-trigger {
    padding: 0.375rem 0.625rem;
  }

  .kulala-select-sm .kulala-select-trigger {
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
  }

  .kulala-select-chevron {
    font-size: 0.625rem;
    opacity: 0.6;
  }

  .kulala-select-content {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 30;
    min-width: 100%;
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg-elevated);
    box-shadow: var(--kulala-shadow-lg);
    padding: 0.25rem;
  }

  .kulala-select-content:not([data-open]) {
    display: none;
  }

  .kulala-select-option {
    padding: 0.375rem 0.5rem;
    border-radius: var(--kulala-radius-sm);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .kulala-select-option[data-highlighted] {
    background: var(--kulala-bg-muted);
  }

  .kulala-select-option[aria-selected='true'] {
    color: var(--kulala-accent);
  }
</style>
