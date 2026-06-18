<script lang="ts">
  import type { RequestFormModel } from '../../env.d'
  import Button from '../../components/ui/Button.svelte'
  import EnvironmentBar from './EnvironmentBar.svelte'
  import RequestForm from './RequestForm.svelte'
  import type { CompletionContextOpts } from '../../kulala/completion/context'
  import type { FormTab } from './session'

  let {
    form = $bindable<RequestFormModel | null>(null),
    activeTab = 'body' as FormTab,
    editorSyntax = 'json' as 'text' | 'json' | 'html',
    requestTabId = '',
    selectedEnv = 'default',
    dirty = false,
    filepath = '',
    fileName = '',
    getCompletionOpts,
    onchange,
    onactiveTabChange,
    oneditorSyntaxChange,
    onselectedEnvChange,
    onsave,
    onsend,
    oncopyCurl,
    onpasteCurl,
    oninspect,
    onclearGlobals
  }: {
    form?: RequestFormModel | null
    activeTab?: FormTab
    editorSyntax?: 'text' | 'json' | 'html'
    requestTabId?: string
    selectedEnv?: string
    dirty?: boolean
    filepath?: string
    fileName?: string
    getCompletionOpts?: () => CompletionContextOpts | undefined
    onchange?: (form: RequestFormModel) => void
    onactiveTabChange?: (tab: FormTab) => void
    oneditorSyntaxChange?: (syntax: 'text' | 'json' | 'html') => void
    onselectedEnvChange?: (env: string) => void
    onsave?: () => void
    onsend?: () => void
    oncopyCurl?: () => void
    onpasteCurl?: () => void
    oninspect?: () => void
    onclearGlobals?: () => void
  } = $props()

  let formTab = $derived(activeTab)
  let syntax = $derived(editorSyntax)
  let env = $derived(selectedEnv)
</script>

{#if form && filepath}
  <div class="request-panel">
    <div class="request-header">
      <div class="request-meta">
        <span class="meta-label">File</span>
        <span class="meta-value" class:dirty>{fileName}{dirty ? ' •' : ''}</span>
      </div>
      <div class="request-meta">
        <span class="meta-label">Request</span>
        <span class="meta-value">{form.blockName}</span>
      </div>
      <EnvironmentBar {filepath} selectedEnv={env} onchange={onselectedEnvChange} />
    </div>

    <div class="toolbar">
      <Button size="xs" onclick={() => oncopyCurl?.()}>Copy cURL</Button>
      <Button size="xs" onclick={() => onpasteCurl?.()}>Paste cURL</Button>
      <Button size="xs" onclick={() => oninspect?.()}>Inspect</Button>
      <Button size="xs" onclick={() => onclearGlobals?.()}>Clear globals</Button>
      <Button size="xs" variant={dirty ? 'warning' : undefined} onclick={() => onsave?.()}>
        {dirty ? 'Save *' : 'Save'}
      </Button>
    </div>

    <RequestForm
      bind:form
      activeTab={formTab}
      editorSyntax={syntax}
      {requestTabId}
      {getCompletionOpts}
      {onchange}
      {onactiveTabChange}
      {oneditorSyntaxChange}
      {onsend}
    />
  </div>
{:else}
  <div class="empty-state">
    <p>Select a request block to edit.</p>
  </div>
{/if}

<style>
  .request-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
    min-height: 0;
    flex: 1;
  }

  .request-header {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: flex-start;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--kulala-border-subtle);
  }

  .request-meta {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .meta-label {
    font-size: 0.75rem;
    color: var(--kulala-fg-muted);
  }

  .meta-value {
    font-weight: 600;
    color: var(--kulala-accent);
  }

  .meta-value.dirty {
    color: var(--kulala-warning, #f5a623);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--kulala-fg-muted);
  }
</style>
