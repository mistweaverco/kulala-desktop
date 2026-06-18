export const NewResizer = (
  container: HTMLElement,
  width: boolean = true,
  height: boolean = true,
): void => {
  const resizer = container;
  let isResizing = false;
  let startX: number, startY: number, startWidth: number, startHeight: number;

  resizer.addEventListener("mousedown", (e: MouseEvent) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = container.offsetWidth;
    startHeight = container.offsetHeight;
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (isResizing) {
      const w = startWidth + e.clientX - startX;
      const h = startHeight + e.clientY - startY;
      if (width) container.style.width = w + "px";
      if (height) container.style.height = h + "px";
    }
  });

  document.addEventListener("mouseup", () => {
    isResizing = false;
  });
};
