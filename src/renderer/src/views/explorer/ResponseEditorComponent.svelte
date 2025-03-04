<script lang="ts">
  import { onMount } from 'svelte'
  import { monaco } from './../monaco'
  export let responseIsVisible
  export let responseEditorContainer
  export let responseEditor
  export let sendRequest
  onMount(async () => {
    responseEditor = monaco.editor.create(responseEditorContainer, {
      minimap: { enabled: false },
      readOnly: true
    })
    responseEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function () {
      sendRequest()
    })
    responseEditor.setModel(monaco.editor.createModel('', 'text'))
  })
</script>

<div class="mt-5">
  <div class="editor-wrap {responseIsVisible ? '' : 'hidden'}">
    <div class="editor-container" bind:this={responseEditorContainer} />
  </div>
</div>

<style>
  .editor-wrap {
    width: 100%;
    max-width: 100%;
    height: 100%;
    border: 1px solid #353a46;
  }
  .editor-container {
    height: 320px;
  }
</style>
