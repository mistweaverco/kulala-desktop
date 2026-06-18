<script lang="ts">
  import { tick } from 'svelte'
  import type { PromptRequest } from '../../env.d'
  import Dialog from '../../components/ui/Dialog.svelte'
  import Button from '../../components/ui/Button.svelte'
  import Label from '../../components/ui/Label.svelte'
  import Input from '../../components/ui/Input.svelte'

  let {
    request = $bindable<PromptRequest | null>(null),
    onsubmit
  }: {
    request?: PromptRequest | null
    onsubmit?: (inputs: Array<{ id: string; value: string }>) => void
  } = $props()

  let values = $state<Record<string, string>>({})
  let initializedId = $state<string | null>(null)
  let firstInputRef = $state<HTMLInputElement | undefined>(undefined)

  $effect.pre(() => {
    if (!request) {
      initializedId = null
      values = {}
      return
    }
    if (request.id === initializedId) return
    initializedId = request.id
    values = Object.fromEntries(request.inputs.map((inp) => [inp.id, '']))
  })

  $effect(() => {
    if (!request) return undefined
    const promptId = request.id
    void tick()
      .then(() => tick())
      .then(() => {
        if (initializedId !== promptId) return
        firstInputRef?.focus()
      })
    return undefined
  })

  $effect(() => {
    if (!request) return undefined
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function setInputValue(id: string, value: string): void {
    values = { ...values, [id]: value }
  }

  function submit(): void {
    if (!request) return
    const inputs = request.inputs.map((inp) => ({
      id: inp.id,
      value: values[inp.id] ?? ''
    }))
    onsubmit?.(inputs)
    request = null
  }

  function cancel(): void {
    if (!request) return
    void window.KulalaApi.submitPrompt(request.id, null)
    request = null
  }

  function onFormSubmit(e: Event): void {
    e.preventDefault()
    submit()
  }

  function onDialogOpenChange(open: boolean): void {
    if (!open) cancel()
  }
</script>

{#if request}
  <Dialog
    open
    priority="elevated"
    title={request.message ?? 'Kulala prompt'}
    onOpenChange={onDialogOpenChange}
  >
    <form id="kulala-prompt-form" class="prompt-form" onsubmit={onFormSubmit}>
      {#each request.inputs as inp, index}
        <div class="field">
          <Label>{inp.label ?? inp.id}</Label>
          {#if index === 0}
            <Input
              bind:ref={firstInputRef}
              type={inp.type === 'password' ? 'password' : 'text'}
              value={values[inp.id] ?? ''}
              oninput={(e) => setInputValue(inp.id, (e.currentTarget as HTMLInputElement).value)}
            />
          {:else}
            <Input
              type={inp.type === 'password' ? 'password' : 'text'}
              value={values[inp.id] ?? ''}
              oninput={(e) => setInputValue(inp.id, (e.currentTarget as HTMLInputElement).value)}
            />
          {/if}
        </div>
      {/each}
    </form>
    {#snippet actions()}
      <Button variant="ghost" type="button" onclick={cancel}>Cancel</Button>
      <Button variant="primary" type="submit" form="kulala-prompt-form">Submit</Button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .prompt-form {
    margin: 0;
  }

  .field {
    margin-top: 0.75rem;
  }
</style>
