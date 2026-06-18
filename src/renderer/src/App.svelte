<script lang="ts">
  import Navigation from './Navigation.svelte'
  import ExplorerView from './views/explorer.svelte'
  import AboutView from './views/about.svelte'
  import SettingsView from './views/settings.svelte'
  import { useActiveView } from './stores'

  const activeView = useActiveView()
</script>

<Navigation />

{#if $activeView === 'explorer'}
  <ExplorerView />
{:else if $activeView === 'settings'}
  <section class="page-section">
    <SettingsView />
  </section>
{:else if $activeView === 'about'}
  <section class="page-section">
    <AboutView />
  </section>
{/if}

<style>
  .page-section {
    padding: 1.25rem;
    max-width: 48rem;
  }
</style>
