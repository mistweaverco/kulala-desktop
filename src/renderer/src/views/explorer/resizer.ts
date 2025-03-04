interface ResizerOptions {
  container: HTMLElement
  width?: boolean
  height?: boolean
  minWidth?: number
  minHeight?: number
  onResizeEnd?: (w: number, h: number) => void | undefined
  onResize?: (w: number, h: number) => void | undefined
}
export const NewResizer = (opts: ResizerOptions): void => {
  const resizer = opts.container.querySelector('.ui-resizable-handle') as HTMLDivElement

  let isResizing = false
  let startX: number, startY: number, startWidth: number, startHeight: number
  let target: HTMLElement

  resizer.addEventListener('mousedown', (e: MouseEvent) => {
    target = e.target as HTMLElement
    if (target !== resizer) {
      return
    }
    isResizing = true
    startX = e.clientX
    startY = e.clientY
    startWidth = opts.container.offsetWidth
    startHeight = opts.container.offsetHeight
  })

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (isResizing) {
      const w = startWidth + e.clientX - startX
      const h = startHeight + e.clientY - startY
      if (opts.width) {
        if (w > opts.minWidth) {
          opts.container.style.width = w + 'px'
        } else {
          opts.container.style.width = opts.minWidth + 'px'
        }
      }
      if (opts.height) {
        if (h > opts.minHeight) {
          opts.container.style.height = h + 'px'
        } else {
          opts.container.style.height = opts.minHeight + 'px'
        }
      }
      if (opts.onResize && w > opts.minWidth && h > opts.minHeight) {
        opts.onResize(w, h)
      }
    }
  })

  document.addEventListener('mouseup', () => {
    if (!isResizing) return
    isResizing = false
    if (target !== resizer) return
    if (!opts.container.offsetWidth || !opts.container.offsetHeight) return
    if (startWidth !== opts.container.offsetWidth && startHeight !== opts.container.offsetHeight)
      return
    if (opts.onResizeEnd) opts.onResizeEnd(opts.container.offsetWidth, opts.container.offsetHeight)
  })
}
