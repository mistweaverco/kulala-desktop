<script lang="ts">
  import { onMount } from 'svelte'
  import { monaco } from './../monaco'
  import { VisibleTab } from './types'
  export let addSimpleFormDataItem
  export let editor
  export let graphqlVariablesEditor
  export let editorContainer
  export let graphqlVariablesEditorContainer
  export let isEditorSyntaxVisible
  export let isEditorVisible
  export let isDocumentModelDirty = false
  export let isMultipartFormRequest
  export let isSimpleFormRequest
  export let layoutEditors
  export let onRawSyntaxSelectChange
  export let onRequestBodyTypeSelectChange
  export let onSimpleFormDataChange
  export let onMultipartFormDataChange
  export let removeSimpleFormDataItem
  export let requestBodyTypeSelect
  export let addMultipartFormDataItem
  export let removeMultipartFormDataItem
  export let selectedRequest
  export let sendRequest
  export let simpleFormRequestVariables
  export let visibleTab

  onMount(async () => {
    editor = monaco.editor.create(editorContainer, {
      minimap: { enabled: false }
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function () {
      sendRequest()
    })
    editor.setModel(monaco.editor.createModel('{}', 'json'))
    editor.onDidChangeModelContent(() => {
      isDocumentModelDirty = true
    })
    graphqlVariablesEditor = monaco.editor.create(graphqlVariablesEditorContainer, {
      minimap: { enabled: false }
    })
    graphqlVariablesEditor.setModel(monaco.editor.createModel('{}', 'json'))
    graphqlVariablesEditor.onDidChangeModelContent(() => {
      isDocumentModelDirty = true
    })
    layoutEditors()
  })
</script>

<div class={visibleTab === VisibleTab.body ? '' : 'hidden'}>
  <div class="join">
    <select
      class="join-item select w-fit"
      bind:this={requestBodyTypeSelect}
      on:input={onRequestBodyTypeSelectChange}
    >
      <option value="none">none</option>
      <option value="form-data">form-data</option>
      <option value="x-www-form-urlencoded">x-www-form-urlencoded</option>
      <option value="raw">raw</option>
      <option value="binary">binary</option>
      <option value="graphql">GraphQL</option>
    </select>
    <select
      class="join-item select w-fit {isEditorSyntaxVisible ? '' : 'hidden'}"
      on:input={onRawSyntaxSelectChange}
    >
      <option value="text">Text</option>
      <option value="json">JSON</option>
      <option value="html">HTML</option>
      <option value="html">XML</option>
    </select>
  </div>

  <div class="mt-5 {isEditorVisible ? '' : 'hidden'}">
    <div class="editor-wrap">
      <div class="editor-container" bind:this={editorContainer} />
    </div>
  </div>

  <div class="mt-5 {isEditorVisible ? '' : 'hidden'}">
    <div class="editor-wrap">
      <div class="graphql-variables-editor-container" bind:this={graphqlVariablesEditorContainer} />
    </div>
  </div>

  <div class="mt-5 {isMultipartFormRequest ? '' : 'hidden'}">
    {#if isMultipartFormRequest && selectedRequest.block && selectedRequest.block.request.multipartFormData}
      {#each selectedRequest.block.request.multipartFormData as item, idx}
        <div class="join w-full mb-5" data-multipart-form-data-item data-idx={idx}>
          <input
            type="text"
            value={item.key}
            name="multipart-form-data-item-key"
            class="join-item input w-full"
            placeholder="Name"
            on:input={onMultipartFormDataChange}
          />
          <select
            class="join-item select"
            name="multipart-form-data-item-type"
            on:input={onMultipartFormDataChange}
          >
            <option value="text">Text</option>
            <option value="file">File</option>
          </select>
          <input
            type="text"
            name="multipart-form-data-item-value"
            value={item.value}
            class="join-item input w-full"
            placeholder="Value"
            on:input={onMultipartFormDataChange}
          />
          <button class="join-item btn btn-error" on:click={removeMultipartFormDataItem}>
            <span class="icon">
              <i class="fa fa-trash"></i>
            </span>
          </button>
        </div>
      {/each}
    {/if}
    <button class="btn btn-success" on:click={addMultipartFormDataItem}>
      <span class="icon">
        <i class="fa fa-plus"></i>
        Add a new field
      </span>
    </button>
  </div>

  <div class="mt-5 {isSimpleFormRequest ? '' : 'hidden'}">
    {#if isSimpleFormRequest && simpleFormRequestVariables.length > 0}
      <div data-simple-form-data-items>
        {#each simpleFormRequestVariables as item, idx}
          <div class="join w-full mb-5" data-simple-form-data-item data-idx={idx}>
            <input
              type="text"
              name="simple-form-data-key"
              value={item.key}
              class="join-item input w-full"
              placeholder="Name"
              on:input={onSimpleFormDataChange}
            />
            <input
              type="text"
              name="simple-form-data-value"
              value={item.value}
              class="join-item input w-full"
              placeholder="Value"
              on:input={onSimpleFormDataChange}
            />
            <button class="join-item btn btn-error" on:click={removeSimpleFormDataItem}>
              <span class="icon">
                <i class="fa fa-trash"></i>
              </span>
            </button>
          </div>
        {/each}
      </div>
    {/if}
    <button class="btn btn-success" on:click={addSimpleFormDataItem}>
      <span class="icon">
        <i class="fa fa-plus"></i>
        Add a new field
      </span>
    </button>
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
  .graphql-variables-editor-container {
    height: 180px;
  }
</style>
