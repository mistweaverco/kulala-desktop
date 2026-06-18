<script lang="ts">
  let {
    class: className = '',
    orientation = 'vertical'
  }: { class?: string; orientation?: 'vertical' | 'horizontal' } = $props()
</script>

<div
  class="kulala-separator kulala-separator-{orientation} {className}"
  role="separator"
  aria-orientation={orientation}
></div>

<style>
  .kulala-separator-vertical {
    width: 4px;
    flex-shrink: 0;
    cursor: ew-resize;
    background: transparent;
    position: relative;
  }

  .kulala-separator-vertical::after {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 1px;
    height: 100%;
    background: var(--kulala-border-subtle);
  }

  .kulala-separator-vertical:hover::after {
    background: var(--kulala-accent);
    width: 2px;
  }

  .kulala-separator-horizontal {
    height: 4px;
    flex-shrink: 0;
    cursor: ns-resize;
    background: transparent;
    position: relative;
  }

  .kulala-separator-horizontal::after {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 1px;
    width: 100%;
    background: var(--kulala-border-subtle);
  }
</style>
