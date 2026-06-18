<script lang="ts">
  import { Combobox } from 'melt/builders'

  type Option = { value: string; label: string }

  let {
    value = $bindable(''),
    options,
    placeholder = 'Select…',
    class: className = '',
    inputSize = 'md',
    onchange
  }: {
    value?: string
    options: Option[]
    placeholder?: string
    class?: string
    inputSize?: 'sm' | 'md'
    onchange?: (value: string) => void
  } = $props()

  let inputValue = $state('')

  const combobox = new Combobox<string>({
    value: () => value,
    onValueChange: (v) => {
      if (typeof v === 'string') {
        value = v
        const label = options.find((o) => o.value === v)?.label ?? v
        inputValue = label
        onchange?.(v)
      }
    },
    inputValue: () => inputValue,
    onInputValueChange: (v) => (inputValue = v)
  })

  $effect(() => {
    combobox.getOptionLabel = (v) => options.find((o) => o.value === v)?.label ?? String(v)
  })

  let prevValue = $state('')

  let selectedLabel = $derived(options.find((o) => o.value === value)?.label ?? '')

  const filtered = $derived(
    !inputValue || inputValue === selectedLabel
      ? options
      : options.filter((o) => o.label.toLowerCase().includes(inputValue.toLowerCase()))
  )

  $effect(() => {
    if (value !== prevValue) {
      prevValue = value
      inputValue = value ? (options.find((o) => o.value === value)?.label ?? '') : ''
    }
  })
</script>

<div class="kulala-combobox kulala-combobox-{inputSize} {className}">
  <div class="kulala-combobox-input-wrap">
    <input class="kulala-combobox-input" {placeholder} {...combobox.input} />
    <button
      type="button"
      class="kulala-combobox-trigger"
      aria-label="Open list"
      {...combobox.trigger}
    >
      <i class="fa fa-chevron-down"></i>
    </button>
  </div>
  <div class="kulala-combobox-content" {...combobox.content}>
    {#if filtered.length === 0}
      <div class="kulala-combobox-empty">No matches</div>
    {:else}
      {#each filtered as option}
        <div class="kulala-combobox-option" {...combobox.getOption(option.value, option.label)}>
          {option.label}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .kulala-combobox {
    position: relative;
    width: 100%;
  }

  .kulala-combobox-input-wrap {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg);
    overflow: hidden;
  }

  .kulala-combobox-input-wrap:focus-within {
    border-color: var(--kulala-accent);
  }

  .kulala-combobox-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--kulala-fg);
    font: inherit;
    outline: none;
  }

  .kulala-combobox-md .kulala-combobox-input {
    padding: 0.375rem 0.625rem;
  }

  .kulala-combobox-sm .kulala-combobox-input {
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
  }

  .kulala-combobox-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.5rem;
    border: none;
    border-left: 1px solid var(--kulala-border);
    background: var(--kulala-bg-elevated);
    color: var(--kulala-fg-muted);
    cursor: pointer;
    font-size: 0.625rem;
  }

  .kulala-combobox-trigger:hover {
    background: var(--kulala-bg-muted);
  }

  .kulala-combobox-content {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 30;
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid var(--kulala-border);
    border-radius: var(--kulala-radius);
    background: var(--kulala-bg-elevated);
    box-shadow: var(--kulala-shadow-lg);
    padding: 0.25rem;
  }

  .kulala-combobox-content:not([data-open]) {
    display: none;
  }

  .kulala-combobox-option {
    padding: 0.375rem 0.5rem;
    border-radius: var(--kulala-radius-sm);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .kulala-combobox-option[data-highlighted] {
    background: var(--kulala-bg-muted);
  }

  .kulala-combobox-option[aria-selected='true'] {
    color: var(--kulala-accent);
  }

  .kulala-combobox-empty {
    padding: 0.375rem 0.5rem;
    color: var(--kulala-fg-muted);
    font-size: 0.8125rem;
  }
</style>
