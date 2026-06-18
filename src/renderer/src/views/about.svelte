<script lang="ts">
  import shoulders from './about.shoulders-of-giants.json'
  import Button from '../components/ui/Button.svelte'
  import Collapsible from '../components/ui/Collapsible.svelte'

  const randomizedShoulders = shoulders.sort(() => Math.random() - 0.5)

  let version = $state('')
  let openShoulder = $state<Record<string, boolean>>({})

  ;(async (): Promise<void> => {
    version = await window.KulalaApi.getAppVersion()
  })()

  const GITHUB_REPO_URL = 'https://github.com/mistweaverco/kulala'

  function openExternalURL(url: string): void {
    window.open(url, '_blank')
  }
</script>

<div class="about">
  <h1>About</h1>
  <p>A minimal REST-Client GUI for Mac, Linux and Windows.</p>
  <p>Kulala is swahili for "rest" or "relax".</p>
  <p>It allows you to make HTTP requests via .http files.</p>
  <p>No login, no tracking, no ads, no BS.</p>

  <div class="info-box">
    <i class="fa-solid fa-info-circle"></i>
    You are using <code>{version}</code> of Kulala
  </div>

  <div class="links">
    <Button variant="ghost" onclick={() => openExternalURL('https://getkulala.net')}>
      <i class="fa-solid fa-globe"></i> Website
    </Button>
    <Button variant="ghost" onclick={() => openExternalURL(`${GITHUB_REPO_URL}/issues/new`)}>
      <i class="fa-solid fa-bug"></i> Report a bug
    </Button>
    <Button variant="ghost" onclick={() => openExternalURL(GITHUB_REPO_URL)}>
      <i class="fa-solid fa-code"></i> See the code
    </Button>
  </div>

  <h2>Open source</h2>
  <p class="subtitle">Projects that Kulala relies on.</p>

  {#each randomizedShoulders as shoulder}
    <Collapsible
      title={shoulder.title}
      open={openShoulder[shoulder.title] ?? false}
      onOpenChange={(v) => (openShoulder = { ...openShoulder, [shoulder.title]: v })}
    >
      <p>{shoulder.description}</p>
      <p>{shoulder.usage}</p>
      <Button variant="ghost" onclick={() => openExternalURL(shoulder.url)}>
        <i class="fa-solid fa-globe"></i>
        {shoulder.url}
      </Button>
      {#if shoulder.license}
        <span class="license"> - {shoulder.license}</span>
      {/if}
    </Collapsible>
  {/each}
</div>

<style>
  .about {
    max-width: 48rem;
  }

  h1 {
    font-size: 2rem;
    margin: 0 0 1rem;
  }

  h2 {
    margin: 2rem 0 0.5rem;
  }

  .subtitle {
    color: var(--kulala-fg-muted);
    margin-bottom: 1rem;
  }

  .info-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: var(--kulala-radius);
    background: color-mix(in srgb, var(--kulala-info) 15%, var(--kulala-bg-elevated));
    border: 1px solid var(--kulala-info);
    margin: 1.5rem 0;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }

  .license {
    color: var(--kulala-fg-muted);
    font-size: 0.875rem;
  }

  code {
    font-family: var(--kulala-font-mono);
    background: var(--kulala-bg-muted);
    padding: 0.125rem 0.375rem;
    border-radius: var(--kulala-radius-sm);
  }
</style>
