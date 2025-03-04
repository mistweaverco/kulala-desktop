<script lang="ts">
  import { VisibleTab } from './types'

  export let visibleTab
</script>

<div class="mt-5 {visibleTab === VisibleTab.scripts ? '' : 'hidden'}">
  <div role="alert" class="alert alert-warning">
    <span class="icon">
      <i class="fa fa-exclamation-triangle"></i>
    </span>
    <span>Not yet implemented</span>
  </div>
</div>
