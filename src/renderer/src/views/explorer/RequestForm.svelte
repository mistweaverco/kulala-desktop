<script lang="ts">
  import type { RequestFormModel } from '../../env.d'
  import type { CompletionContextOpts } from '../../kulala/completion/context'
  import Button from '../../components/ui/Button.svelte'
  import Label from '../../components/ui/Label.svelte'
  import Select from '../../components/ui/Select.svelte'
  import Tabs from '../../components/ui/Tabs.svelte'
  import KulalaCompleteInput from '../../components/KulalaCompleteInput.svelte'
  import CodeEditor from './CodeEditor.svelte'
  import GraphQLBodyEditor from './GraphQLBodyEditor.svelte'
  import ScriptListEditor from './ScriptListEditor.svelte'
  import { createBodyEditorCompletionConfig } from '../../kulala/completion/monaco-provider'

  type FormTab = 'headers' | 'body' | 'pre-request' | 'post-request'

  let {
    form = $bindable<RequestFormModel | null>(null),
    activeTab = 'body' as FormTab,
    editorSyntax = 'json' as 'text' | 'json' | 'html',
    requestTabId = '',
    getCompletionOpts,
    onchange,
    onactiveTabChange,
    oneditorSyntaxChange,
    actions,
    onsend
  }: {
    form?: RequestFormModel | null
    activeTab?: FormTab
    editorSyntax?: 'text' | 'json' | 'html'
    requestTabId?: string
    getCompletionOpts?: () => CompletionContextOpts | undefined
    onchange?: (form: RequestFormModel) => void
    onactiveTabChange?: (tab: FormTab) => void
    oneditorSyntaxChange?: (syntax: 'text' | 'json' | 'html') => void
    actions?: import('svelte').Snippet
    onsend?: () => void
  } = $props()

  let tabValue = $derived(activeTab)
  let syntaxValue = $derived(editorSyntax)
  let bodyShouldBeVisible = $derived(form.method !== 'GET' && form.method !== 'HEAD' && form.method !== 'OPTIONS')

  const methods = [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
    'HEAD',
    'GRAPHQL',
    'GRPC',
    'WEBSOCKET'
  ].map((m) => ({ value: m, label: m }))

  function update(partial: Partial<RequestFormModel>): void {
    if (!form) return
    form = { ...form, ...partial }
    onchange?.(form)
  }

  function addHeader(): void {
    if (!form) return
    update({ headers: [...form.headers, { name: '', value: '' }] })
  }

  function removeHeader(index: number): void {
    if (!form) return
    update({ headers: form.headers.filter((_, i) => i !== index) })
  }

  function updateHeader(index: number, field: 'name' | 'value', value: string): void {
    if (!form) return
    const headers = form.headers.map((h, i) => (i === index ? { ...h, [field]: value } : h))
    update({ headers })
  }

  let bodyCompletionConfig = $derived(
    getCompletionOpts ? createBodyEditorCompletionConfig(getCompletionOpts) : undefined
  )

  function onMethodChange(method: string): void {
    const bodyKind =
      method === 'GRAPHQL'
        ? 'graphql'
        : form?.bodyKind === 'graphql'
          ? 'raw'
          : (form?.bodyKind ?? 'raw')
    update({ method, bodyKind })
  }

  function onCtrlEnter(e: KeyboardEvent): void {
    if (e.ctrlKey && e.key === 'Enter') {
      onsend?.()
    }
  }
</script>

{#if form}
  <div class="request-line">
    <Select class="method-select" value={form.method} options={methods} onchange={onMethodChange} />
    <KulalaCompleteInput
      class="url-input"
      bind:value={form.url}
      placeholder="https://echo.kulala.app/get"
      field={{ type: 'url', column: form.url.length }}
      {getCompletionOpts}
      onchange={() => update({ url: form!.url })}
    />
    {#if actions}
      {@render actions()}
    {:else}
      <Button variant="primary" onclick={() => onsend?.()} onkeydown={onCtrlEnter}>
        <i class="fa fa-paper-plane"></i>
      </Button>
    {/if}
  </div>

  <div class="field-block">
    <Label>Block name</Label>
    <KulalaCompleteInput
      bind:value={form.blockName}
      field={{ type: 'block-name', column: form.blockName.length }}
      {getCompletionOpts}
      onchange={() => onchange?.(form!)}
    />
  </div>

  <Tabs
    value={tabValue}
    onvaluechange={(tab) => onactiveTabChange?.(tab as FormTab)}
    items={bodyShouldBeVisible ? [
        { value: 'headers', label: 'Headers' },
        { value: 'body', label: 'Body' },
        { value: 'pre-request', label: 'Pre-request' },
        { value: 'post-request', label: 'Post-request' }
      ] :
        [
          { value: 'headers', label: 'Headers' },
          { value: 'pre-request', label: 'Pre-request' },
          { value: 'post-request', label: 'Post-request'}
        ]
    }
  >
    {#snippet children(tab)}
      {#if tab === 'headers'}
        <div class="headers-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each form.headers as header, idx}
                <tr>
                  <td>
                    <KulalaCompleteInput
                      bind:value={header.name}
                      inputSize="sm"
                      field={{ type: 'header-name', index: idx, column: header.name.length }}
                      {getCompletionOpts}
                      onchange={() => updateHeader(idx, 'name', header.name)}
                    />
                  </td>
                  <td>
                    <KulalaCompleteInput
                      bind:value={header.value}
                      inputSize="sm"
                      field={{ type: 'header-value', index: idx, column: header.value.length }}
                      {getCompletionOpts}
                      onchange={() => updateHeader(idx, 'value', header.value)}
                    />
                  </td>
                  <td>
                    <Button variant="error" size="xs" onclick={() => removeHeader(idx)}>
                      <i class="fa fa-trash"></i>
                    </Button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          <Button variant="success" size="sm" onclick={addHeader} style="margin-top: 0.5rem">
            <i class="fa fa-plus"></i> Add header
          </Button>
        </div>
      {:else if tab === 'body'}
        <div class="body-panel">
          {#if form.bodyKind === 'graphql' || form.method === 'GRAPHQL'}
            {#key requestTabId}
              <GraphQLBodyEditor
                bind:query={form.graphqlQuery}
                bind:variables={form.graphqlVariables}
                {requestTabId}
                {getCompletionOpts}
              />
            {/key}
          {:else if bodyShouldBeVisible}
            <div class="syntax-row">
              <Select
                size="sm"
                value={syntaxValue}
                options={[
                  { value: 'text', label: 'Text' },
                  { value: 'json', label: 'JSON' },
                  { value: 'html', label: 'HTML' }
                ]}
                onchange={(value) => oneditorSyntaxChange?.(value as 'text' | 'json' | 'html')}
              />
            </div>
            {#key requestTabId}
              <CodeEditor
                bind:value={form.body}
                syntax={syntaxValue}
                completionConfig={bodyCompletionConfig}
                cacheKey={requestTabId ? `${requestTabId}:body` : undefined}
              />
            {/key}
          {/if}
        </div>
      {:else if tab === 'pre-request'}
        {#key requestTabId}
          <ScriptListEditor
            bind:scripts={form.preRequestScripts}
            scriptKind="pre-request"
            {requestTabId}
            {getCompletionOpts}
            onchange={(scripts) => update({ preRequestScripts: scripts })}
          />
        {/key}
      {:else if tab === 'post-request'}
        {#key requestTabId}
          <ScriptListEditor
            bind:scripts={form.postRequestScripts}
            scriptKind="post-request"
            {requestTabId}
            {getCompletionOpts}
            onchange={(scripts) => update({ postRequestScripts: scripts })}
          />
        {/key}
      {/if}
    {/snippet}
  </Tabs>
{/if}

<style>
  .request-line {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  :global(.method-select) {
    flex-shrink: 0;
  }

  :global(.url-input) {
    flex: 1;
  }

  .field-block {
    margin-top: 0.75rem;
  }

  .headers-table {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th,
  td {
    padding: 0.25rem;
    text-align: left;
    border-bottom: 1px solid var(--kulala-border-subtle);
  }

  th {
    color: var(--kulala-fg-muted);
    font-weight: 500;
  }

  .body-panel {
    min-height: 200px;
  }

  .syntax-row {
    margin-bottom: 0.5rem;
  }
</style>
