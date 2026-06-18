<script lang="ts">
  import { onMount } from 'svelte'
  import Button from '../components/ui/Button.svelte'
  import Label from '../components/ui/Label.svelte'
  import Input from '../components/ui/Input.svelte'

  let settings = $state({
    corePath: '',
    coreVersion: '0.24.5',
    dataDir: '',
    timeout: '60000',
    defaultEnv: 'default'
  })
  let saved = $state(false)

  onMount(async () => {
    const loaded = await window.KulalaApi.getSettings()
    settings = {
      corePath: String(loaded.corePath ?? ''),
      coreVersion: String(loaded.coreVersion ?? '0.24.5'),
      dataDir: String(loaded.dataDir ?? ''),
      timeout: String(loaded.timeout ?? 60000),
      defaultEnv: String(loaded.defaultEnv ?? 'default')
    }
  })

  async function save(): Promise<void> {
    await window.KulalaApi.setSettings({
      ...settings,
      timeout: Number(settings.timeout)
    })
    saved = true
    setTimeout(() => (saved = false), 2000)
  }
</script>

<div class="settings">
  <h1>Settings</h1>

  <div class="field">
    <Label>kulala-core path (optional override)</Label>
    <Input bind:value={settings.corePath} />
  </div>

  <div class="field">
    <Label>kulala-core version</Label>
    <Input bind:value={settings.coreVersion} />
  </div>

  <div class="field">
    <Label>Data directory (KULALA_CORE_DATA_DIR)</Label>
    <Input bind:value={settings.dataDir} />
  </div>

  <div class="field">
    <Label>Request timeout (ms)</Label>
    <Input type="number" bind:value={settings.timeout} inputSize="md" />
  </div>

  <div class="field">
    <Label>Default environment</Label>
    <Input bind:value={settings.defaultEnv} />
  </div>

  <Button variant="primary" onclick={save}>Save</Button>
  {#if saved}
    <span class="saved">Saved</span>
  {/if}
</div>

<style>
  .settings {
    max-width: 36rem;
  }

  h1 {
    font-size: 1.5rem;
    margin: 0 0 1rem;
  }

  .field {
    margin-bottom: 0.75rem;
  }

  .saved {
    margin-left: 0.75rem;
    color: var(--kulala-success);
  }
</style>
