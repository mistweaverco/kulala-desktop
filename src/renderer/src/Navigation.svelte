<script lang="ts">
  import { useActiveView } from './stores'
  import Button from './components/ui/Button.svelte'
  import Menu from './components/ui/Menu.svelte'
  import Input from './components/ui/Input.svelte'
  import Logo from './components/ui/Logo.svelte'

  const activeView = useActiveView()

  function navigate(action: string): void {
    $activeView = action
  }
</script>

<nav class="navbar">
  <div class="navbar-start">
    <Button
      variant="ghost"
      onclick={() => navigate('explorer')}
    >
    <Logo />
    </Button>
  </div>
  <div class="navbar-end">
    <Input class="search-input" placeholder="Search" />
    <Menu>
      {#snippet children()}
        <div class="avatar">
          <i class="fa-solid fa-user"></i>
        </div>
      {/snippet}
      {#snippet content()}
        <button type="button" class="kulala-menu-item" onclick={() => navigate('settings')}>
          Settings
        </button>
        <button type="button" class="kulala-menu-item" onclick={() => navigate('about')}>
          About
        </button>
      {/snippet}
    </Menu>
  </div>
</nav>

<style>
  .navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--kulala-bg-elevated);
    border-bottom: 1px solid var(--kulala-border-subtle);
    height: 3.5rem;
  }

  .navbar-start,
  .navbar-end {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  :global(.search-input) {
    width: 8rem;
  }

  @media (min-width: 768px) {
    :global(.search-input) {
      width: 12rem;
    }
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--kulala-bg-muted);
    color: var(--kulala-fg-muted);
  }
</style>
