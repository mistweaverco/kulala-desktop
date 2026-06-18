<script lang="ts">
  import Dialog from '../../components/ui/Dialog.svelte'
  import Button from '../../components/ui/Button.svelte'

  let {
    filepath = '',
    selectedEnv = 'default',
    onchange
  }: {
    filepath?: string
    selectedEnv?: string
    onchange?: (env: string) => void
  } = $props()

  let envNames = $state<string[]>(['default'])
  let showPicker = $state(false)

  async function refreshEnvironments(): Promise<void> {
    if (!filepath) return
    const { catalog, err } = await window.KulalaApi.listEnvironments(filepath)
    if (err || !catalog) return
    envNames = Object.keys(catalog.environments)
    if (envNames.length === 0) envNames = ['default']
  }

  async function loadSelectedEnv(): Promise<void> {
    const env = await window.KulalaApi.getSelectedEnv(filepath)
    onchange?.(env)
  }

  async function pickEnv(name: string): Promise<void> {
    await window.KulalaApi.setSelectedEnv(name, filepath)
    onchange?.(name)
    showPicker = false
  }

  $effect(() => {
    if (filepath) {
      void refreshEnvironments()
      void loadSelectedEnv()
    }
  })
</script>

<div class="env-bar">
  <span class="env-label">Environment</span>
  <button type="button" class="env-value" onclick={() => (showPicker = true)}>
    <i class="fa fa-leaf"></i>
    {selectedEnv}
  </button>
</div>

<Dialog bind:open={showPicker} title="Select environment">
  <ul class="env-list">
    {#each envNames as name}
      <li>
        <Button
          variant={name === selectedEnv ? 'primary' : 'ghost'}
          class="env-option"
          onclick={() => pickEnv(name)}
        >
          {name}
        </Button>
      </li>
    {/each}
  </ul>
</Dialog>

<style>
  .env-bar {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .env-label {
    font-size: 0.75rem;
    color: var(--kulala-fg-muted);
  }

  .env-value {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--kulala-warning);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .env-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  :global(.env-option) {
    width: 100%;
    justify-content: flex-start;
  }
</style>
