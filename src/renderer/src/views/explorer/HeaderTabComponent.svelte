<script lang="ts">
  import { VisibleTab } from './types'

  export let selectedRequest
  export let visibleTab
  export let addHeaderDataItem
  export let onHeaderDataChange
  export let removeHeaderDataItem
</script>

<div class="mt-5 {visibleTab === VisibleTab.headers ? '' : 'hidden'}">
  {#if visibleTab === VisibleTab.headers && selectedRequest.block.request.headers.length > 0}
    <div data-header-data-items>
      {#each selectedRequest.block.request.headers as item, idx}
        <div class="join w-full mb-5" data-header-data-item data-idx={idx}>
          <input
            type="text"
            name="header-data-key"
            value={item.key}
            class="join-item input w-full"
            placeholder="Name"
            on:input={onHeaderDataChange}
          />
          <input
            type="text"
            name="header-data-value"
            value={item.value}
            class="join-item input w-full"
            placeholder="Value"
            on:input={onHeaderDataChange}
          />
          <button class="join-item btn btn-error" on:click={removeHeaderDataItem}>
            <span class="icon">
              <i class="fa fa-trash"></i>
            </span>
          </button>
        </div>
      {/each}
    </div>
  {/if}
  <button class="btn btn-success" on:click={addHeaderDataItem}>
    <span class="icon">
      <i class="fa fa-plus"></i>
      Add a new field
    </span>
  </button>
</div>
