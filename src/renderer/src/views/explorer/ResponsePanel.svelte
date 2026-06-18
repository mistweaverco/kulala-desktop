<script lang="ts">
  import type { ResponseEntry } from '../../env.d'
  import Tabs from '../../components/ui/Tabs.svelte'
  import Button from '../../components/ui/Button.svelte'
  import Combobox from '../../components/ui/Combobox.svelte'
  import Input from '../../components/ui/Input.svelte'
  import ResponseBodyViewer from './ResponseBodyViewer.svelte'
  import { inferResponseBodyLanguage } from '../../kulala/response-body'
  import { scriptLogLines, testGroupViews } from '../../kulala/response/tests'
  import type { ResponseViewTab } from './session'

  let {
    entries = [],
    activeId = $bindable<string | undefined>(),
    viewTab = $bindable('body' as ResponseViewTab),
    requestTabId = '',
    onjqfilter,
    onwssend,
    onwsclose,
    onclear
  }: {
    entries?: ResponseEntry[]
    activeId?: string | undefined
    viewTab?: ResponseViewTab
    requestTabId?: string
    onjqfilter?: (id: string, filter: string) => void
    onwssend?: (message: string) => void
    onwsclose?: () => void
    onclear?: () => void
  } = $props()
  let jqInput = $state('')
  let wsMessage = $state('')
  let showRawTests = $state(false)

  let active = $derived(entries.find((e) => e.id === activeId) ?? entries[entries.length - 1])

  let historyOptions = $derived(
    entries.map((entry, idx) => ({
      value: entry.id,
      label: formatHistoryLabel(entry, idx)
    }))
  )

  let selectedHistoryId = $derived(activeId ?? active?.id ?? '')

  function formatHistoryLabel(entry: ResponseEntry, idx: number): string {
    const name = entry.blockName ?? `Response ${idx + 1}`
    if (entry.status != null) {
      return `${name} · ${entry.status}${entry.success ? '' : ' ✗'}`
    }
    return entry.success === false ? `${name} · failed` : name
  }

  let jqInputSyncKey = $state('')

  $effect(() => {
    const syncKey = `${active?.id ?? ''}:${active?.jqFilter ?? ''}`
    if (syncKey === jqInputSyncKey) return
    jqInputSyncKey = syncKey
    jqInput = active?.jqFilter ?? ''
  })

  function onHistorySelect(id: string): void {
    activeId = id
  }

  function formatTimings(timings?: Record<string, number>): string {
    if (!timings) return ''
    return Object.entries(timings)
      .map(([k, v]) => `${k}: ${v}ms`)
      .join('\n')
  }

  function logLines(entry: ResponseEntry) {
    return scriptLogLines(entry.scriptConsole)
  }

  function testGroups(entry: ResponseEntry) {
    return testGroupViews(entry.scriptConsole)
  }

  async function copyBody(): Promise<void> {
    if (!active?.body) return
    await window.KulalaApi.copyToClipboard(active.body)
  }
</script>

<div class="response-panel">
  {#if entries.length === 0}
    <p class="empty">Response will appear here after sending a request.</p>
  {:else}
    <div class="history-bar">
      <span class="history-label">History</span>
      <Combobox
        class="history-combobox"
        value={selectedHistoryId}
        options={historyOptions}
        placeholder="Select a response…"
        inputSize="sm"
        onchange={onHistorySelect}
      />
      <Button
        variant="ghost"
        size="xs"
        title="Clear response history"
        disabled={entries.length === 0}
        onclick={() => onclear?.()}
      >
        <i class="fa fa-trash"></i>
        Clear
      </Button>
    </div>

    {#if active}
      {#if !active.success}
        <div class="alert alert-error">
          <span>{active.error ?? 'Request failed'}</span>
        </div>
      {/if}

      <Tabs
        class="response-tabs"
        bind:value={viewTab}
        items={[
          { value: 'body', label: 'Body' },
          { value: 'headers', label: 'Headers' },
          { value: 'timings', label: 'Timings' },
          { value: 'console', label: 'Console' },
          { value: 'tests', label: 'Tests' },
          { value: 'verbose', label: 'Verbose' }
        ]}
      >
        {#snippet children(tab)}
          <div class="tab-pane">
            <div class="toolbar">
              {#if tab === 'tests'}
                <Button size="xs" variant="ghost" onclick={() => (showRawTests = !showRawTests)}>
                  {showRawTests ? 'Pretty' : 'Raw'}
                </Button>
              {/if}
              {#if viewTab === 'body' && (active.rawBody || active.body)}
                <Button size="xs" onclick={copyBody}>Copy body</Button>
                <div class="jq-row">
                  <Input
                    inputSize="sm"
                    onkeydown={(evt: KeyboardEvent) => {
                      if (evt.key === 'Enter') onjqfilter?.(active.id, jqInput)
                    }}
                    placeholder="jq filter"
                    bind:value={jqInput}
                  />
                  <Button size="sm" onclick={() => onjqfilter?.(active.id, jqInput)}>
                    {jqInput ? 'Apply jq' : 'Clear jq'}
                  </Button>
                </div>
              {/if}
            </div>

            <div class="tab-body">
              {#if tab === 'body'}
                {#if active.protocol === 'websocket'}
                  <p class="ws-status">
                    WebSocket {active.wsConnected
                      ? 'connected'
                      : active.wsClosed
                        ? 'closed'
                        : 'connecting…'}
                  </p>
                  <pre class="code-block fill">{active.body}</pre>
                  <div class="ws-row">
                    <Input placeholder="Message to send" bind:value={wsMessage} />
                    <Button
                      onclick={() => {
                        onwssend?.(wsMessage)
                        wsMessage = ''
                      }}>Send</Button
                    >
                    <Button variant="warning" onclick={() => onwsclose?.()}>Close</Button>
                  </div>
                {:else if active.bodyImageSrc}
                  <img src={active.bodyImageSrc} alt="Response" class="response-image" />
                {:else if active.body || active.binaryNote}
                  {#key `${active.id}:${active.jqFilter ?? ''}:${(active.body ?? active.binaryNote ?? '').length}`}
                    <ResponseBodyViewer
                      value={active.body ?? active.binaryNote ?? ''}
                      language={inferResponseBodyLanguage(active)}
                      cacheKey={requestTabId ? `${requestTabId}:response` : undefined}
                    />
                  {/key}
                {:else}
                  <p class="empty-body">Empty response body</p>
                {/if}
              {:else if tab === 'headers'}
                <pre class="code-block fill">{JSON.stringify(active.headers ?? {}, null, 2)}</pre>
              {:else if tab === 'timings'}
                <pre class="code-block fill">{formatTimings(active.timings)}</pre>
              {:else if tab === 'console'}
                <pre class="code-block fill">{logLines(active)
                    .map((l) => `[${l.level}] ${l.message}`)
                    .join('\n') || 'No console output'}</pre>
              {:else if tab === 'tests'}
                {#if showRawTests}
                  <pre class="code-block fill">{(active.scriptConsole ?? [])
                      .filter((l) => l.kind === 'test' || l.kind === 'assert')
                      .map((l) => `${l.status ?? l.level}: ${l.testName ?? ''} ${l.message}`)
                      .join('\n') || 'No tests'}</pre>
                {:else}
                  {@const groups = testGroups(active)}
                  {#if groups.length === 0}
                    <pre class="code-block fill">No tests</pre>
                  {:else}
                    <div class="tests-panel">
                      {#each groups as group (group.name)}
                        <div class="test-group">
                          <div
                            class="test-head"
                            class:text-success={group.pass}
                            class:text-error={!group.pass}
                          >
                            {group.pass ? '✓ ' : '✗ '}{group.name}
                          </div>
                          {#each group.asserts as assert (assert.message)}
                            <div
                              class="test-assert"
                              class:text-success={assert.pass}
                              class:text-error={!assert.pass}
                            >
                              {assert.pass ? '  ✓ ' : '  ✗ '}{assert.message}
                            </div>
                          {/each}
                        </div>
                      {/each}
                    </div>
                  {/if}
                {/if}
              {:else}
                {#if active.verbose}
                  <div class="verbose-panel">
                    <div class="verbose-section">
                      <div class="verbose-title">Request headers</div>
                      {#if active.verbose.requestHeadersRows.length === 0}
                        <p class="empty">(no request headers)</p>
                      {:else}
                        <table class="verbose-table">
                          <thead>
                            <tr>
                              <th>Header</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each active.verbose.requestHeadersRows as row (row.name)}
                              <tr>
                                <td class="mono nowrap">{row.name}</td>
                                <td class="mono breakall">{row.value}</td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      {/if}
                    </div>

                    <div class="verbose-section">
                      <div class="verbose-title">Request body</div>
                      <pre class="code-block">{active.verbose.requestBody.body || '(empty)'}</pre>
                    </div>

                    <div class="verbose-section">
                      <div class="verbose-title">Response headers</div>
                      {#if active.verbose.responseHeadersRows.length === 0}
                        <p class="empty">(no response headers)</p>
                      {:else}
                        <table class="verbose-table">
                          <thead>
                            <tr>
                              <th>Header</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each active.verbose.responseHeadersRows as row (row.name)}
                              <tr>
                                <td class="mono nowrap">{row.name}</td>
                                <td class="mono breakall">{row.value}</td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      {/if}
                    </div>

                    <div class="verbose-section">
                      <div class="verbose-title">Response body</div>
                      <pre class="code-block">{active.verbose.responseBody.body || '(empty)'}</pre>
                    </div>
                  </div>
                {:else}
                  <p class="empty">No verbose data</p>
                {/if}
              {/if}
            </div>
          </div>
        {/snippet}
      </Tabs>
    {/if}
  {/if}
</div>

<style>
  .response-panel {
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .empty {
    color: var(--kulala-fg-muted);
    font-size: 0.875rem;
  }

  .history-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    flex-shrink: 0;
  }

  .history-label {
    flex-shrink: 0;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--kulala-fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  :global(.history-combobox) {
    flex: 1;
    min-width: 0;
  }

  .alert-error {
    padding: 0.625rem 0.75rem;
    border-radius: var(--kulala-radius);
    background: var(--kulala-error-bg);
    color: var(--kulala-error);
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  :global(.response-tabs) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :global(.response-tabs .kulala-tabs-list) {
    flex-shrink: 0;
  }

  :global(.response-tabs .kulala-tab-panel) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tab-pane {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
    flex-shrink: 0;
  }

  .tab-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .jq-row,
  .ws-row {
    display: flex;
    gap: 0.375rem;
    flex: 1;
    min-width: 160px;
  }

  .code-block {
    background: var(--kulala-bg-muted);
    padding: 0.75rem;
    border-radius: var(--kulala-radius);
    font-size: 0.8125rem;
    overflow: auto;
    white-space: pre-wrap;
    font-family: var(--kulala-font-mono);
    margin: 0;
  }

  .code-block.fill {
    flex: 1;
    min-height: 0;
  }

  .tests-panel {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--kulala-bg-muted);
    padding: 0.75rem;
    border-radius: var(--kulala-radius);
    font-size: 0.8125rem;
  }

  .test-group {
    margin-bottom: 0.75rem;
  }

  .test-head {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .test-assert {
    white-space: pre-wrap;
    font-family: var(--kulala-font-mono);
    font-size: 0.8125rem;
    padding-left: 0.25rem;
  }

  .text-success {
    color: var(--kulala-success);
  }

  .text-error {
    color: var(--kulala-error);
  }

  .verbose-panel {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .verbose-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .verbose-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--kulala-fg-muted);
  }

  .verbose-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  .verbose-table th,
  .verbose-table td {
    border-bottom: 1px solid var(--kulala-border-subtle);
    padding: 0.375rem 0.5rem;
    text-align: left;
    vertical-align: top;
  }

  .mono {
    font-family: var(--kulala-font-mono);
  }

  .nowrap {
    white-space: nowrap;
  }

  .breakall {
    word-break: break-all;
  }

  .ws-status {
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
    flex-shrink: 0;
  }

  .response-image {
    max-width: 100%;
    margin-top: 0.5rem;
    object-fit: contain;
    flex: 1;
    min-height: 0;
  }

  .empty-body {
    color: var(--kulala-fg-muted);
    font-size: 0.875rem;
  }
</style>
