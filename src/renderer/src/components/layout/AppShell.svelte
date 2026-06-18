<script lang="ts">
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'
  import { attachPanelResizer } from './panel-resizer'

  let {
    sidebar,
    main,
    response,
    sidebarWidth = 260,
    responseWidth = 380
  }: {
    sidebar?: Snippet
    main?: Snippet
    response?: Snippet
    sidebarWidth?: number
    responseWidth?: number
  } = $props()

  let sidebarEl: HTMLElement
  let responseEl: HTMLElement
  let sidebarHandle: HTMLElement
  let responseHandle: HTMLElement

  onMount(() => {
    sidebarEl.style.width = `${sidebarWidth}px`
    responseEl.style.width = `${responseWidth}px`
    const cleanSidebar = attachPanelResizer(sidebarHandle, sidebarEl, 'width', 200, 480)
    const cleanResponse = attachPanelResizer(responseHandle, responseEl, 'width', 280, 720, true)
    return () => {
      cleanSidebar()
      cleanResponse()
    }
  })
</script>

<div class="app-shell">
  <aside class="app-shell-sidebar ui-resizable ui-resizable-width" bind:this={sidebarEl}>
    {@render sidebar?.()}
  </aside>
  <div class="app-shell-sidebar-handle" bind:this={sidebarHandle}></div>
  <main class="app-shell-main">
    {@render main?.()}
  </main>
  <div class="app-shell-response-handle" bind:this={responseHandle}></div>
  <aside class="app-shell-response" bind:this={responseEl}>
    {@render response?.()}
  </aside>
</div>

<style>
  .app-shell {
    display: flex;
    height: calc(100vh - 3.5rem);
    overflow: hidden;
    background: var(--kulala-bg);
  }

  .app-shell-sidebar,
  .app-shell-response {
    flex-shrink: 0;
    overflow: auto;
    background: var(--kulala-bg-elevated);
    border-color: var(--kulala-border-subtle);
  }

  .app-shell-sidebar {
    border-right: 1px solid var(--kulala-border-subtle);
  }

  .app-shell-response {
    border-left: 1px solid var(--kulala-border-subtle);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  .app-shell-main {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 0.75rem 1rem;
  }

  .app-shell-sidebar-handle,
  .app-shell-response-handle {
    width: 4px;
    flex-shrink: 0;
    cursor: ew-resize;
    background: transparent;
    position: relative;
  }

  .app-shell-sidebar-handle:hover,
  .app-shell-response-handle:hover {
    background: var(--kulala-accent);
    opacity: 0.35;
  }
</style>
