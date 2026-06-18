export const attachPanelResizer = (
  handle: HTMLElement,
  panel: HTMLElement,
  direction: "width" | "height",
  min = 180,
  max?: number,
  invertDelta = false,
): (() => void) => {
  let isResizing = false;
  let startPos = 0;
  let startSize = 0;

  const onMouseDown = (e: MouseEvent): void => {
    isResizing = true;
    startPos = direction === "width" ? e.clientX : e.clientY;
    startSize = direction === "width" ? panel.offsetWidth : panel.offsetHeight;
    document.body.style.cursor = direction === "width" ? "ew-resize" : "ns-resize";
    document.body.style.userSelect = "none";
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (!isResizing) return;
    const delta = (direction === "width" ? e.clientX : e.clientY) - startPos;
    let next = invertDelta ? startSize - delta : startSize + delta;
    if (next < min) next = min;
    if (max != null && next > max) next = max;
    if (direction === "width") {
      panel.style.width = `${next}px`;
    } else {
      panel.style.height = `${next}px`;
    }
  };

  const onMouseUp = (): void => {
    isResizing = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  handle.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  return () => {
    handle.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };
};
