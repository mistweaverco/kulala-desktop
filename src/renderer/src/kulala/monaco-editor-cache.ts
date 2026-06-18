import type * as Monaco from "monaco-editor";

export type CachedCodeEditor = {
  editor: Monaco.editor.IStandaloneCodeEditor;
  model: Monaco.editor.ITextModel;
  viewState: Monaco.editor.ICodeEditorViewState | null;
};

const codeEditorCache = new Map<string, CachedCodeEditor>();
const responseViewerCache = new Map<string, CachedCodeEditor>();

let parkingRoot: HTMLElement | null = null;

function getParkingRoot(): HTMLElement {
  if (!parkingRoot) {
    parkingRoot = document.createElement("div");
    parkingRoot.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
    document.body.appendChild(parkingRoot);
  }
  return parkingRoot;
}

function parkDomNode(editor: Monaco.editor.IStandaloneCodeEditor): void {
  const dom = editor.getDomNode();
  if (!dom) return;
  if (dom.parentNode !== getParkingRoot()) {
    getParkingRoot().appendChild(dom);
  }
}

function attachDomNode(editor: Monaco.editor.IStandaloneCodeEditor, container: HTMLElement): void {
  const dom = editor.getDomNode();
  if (!dom) return;
  container.replaceChildren();
  container.appendChild(dom);
}

function layoutAttachedEditor(
  editor: Monaco.editor.IStandaloneCodeEditor,
  container: HTMLElement,
): void {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width > 0 && height > 0) {
    editor.layout({ width, height });
  } else {
    editor.layout();
  }
}

export function takeCodeEditor(key: string): CachedCodeEditor | undefined {
  const entry = codeEditorCache.get(key);
  if (!entry) return undefined;
  codeEditorCache.delete(key);
  return entry;
}

export function parkCodeEditor(key: string, entry: CachedCodeEditor): void {
  const existing = codeEditorCache.get(key);
  if (existing && existing.editor !== entry.editor) {
    existing.editor.dispose();
    existing.model.dispose();
  }
  entry.viewState = entry.editor.saveViewState();
  parkDomNode(entry.editor);
  codeEditorCache.set(key, entry);
}

export function attachCodeEditor(entry: CachedCodeEditor, container: HTMLElement): void {
  attachDomNode(entry.editor, container);
  if (entry.viewState) {
    entry.editor.restoreViewState(entry.viewState);
  }
  layoutAttachedEditor(entry.editor, container);
}

export function relayoutCodeEditor(
  editor: Monaco.editor.IStandaloneCodeEditor,
  container: HTMLElement,
): void {
  layoutAttachedEditor(editor, container);
}

export function takeResponseViewer(key: string): CachedCodeEditor | undefined {
  const entry = responseViewerCache.get(key);
  if (!entry) return undefined;
  responseViewerCache.delete(key);
  return entry;
}

export function parkResponseViewer(key: string, entry: CachedCodeEditor): void {
  const existing = responseViewerCache.get(key);
  if (existing && existing.editor !== entry.editor) {
    existing.editor.dispose();
    existing.model.dispose();
  }
  entry.viewState = entry.editor.saveViewState();
  parkDomNode(entry.editor);
  responseViewerCache.set(key, entry);
}

export function attachResponseViewer(entry: CachedCodeEditor, container: HTMLElement): void {
  attachDomNode(entry.editor, container);
  if (entry.viewState) {
    entry.editor.restoreViewState(entry.viewState);
  }
  layoutAttachedEditor(entry.editor, container);
}

export function relayoutResponseViewer(
  editor: Monaco.editor.IStandaloneCodeEditor,
  container: HTMLElement,
): void {
  layoutAttachedEditor(editor, container);
}

function disposeEntry(entry: CachedCodeEditor): void {
  entry.editor.dispose();
  entry.model.dispose();
}

export function evictTabEditors(tabId: string): void {
  const prefix = `${tabId}:`;
  for (const key of [...codeEditorCache.keys()]) {
    if (key.startsWith(prefix)) {
      disposeEntry(codeEditorCache.get(key)!);
      codeEditorCache.delete(key);
    }
  }
  for (const key of [...responseViewerCache.keys()]) {
    if (key.startsWith(prefix)) {
      disposeEntry(responseViewerCache.get(key)!);
      responseViewerCache.delete(key);
    }
  }
}

export function evictFilepathEditors(filepath: string): void {
  const prefix = `${filepath}::`;
  for (const key of [...codeEditorCache.keys()]) {
    if (key.startsWith(prefix)) {
      disposeEntry(codeEditorCache.get(key)!);
      codeEditorCache.delete(key);
    }
  }
  for (const key of [...responseViewerCache.keys()]) {
    if (key.startsWith(prefix)) {
      disposeEntry(responseViewerCache.get(key)!);
      responseViewerCache.delete(key);
    }
  }
}
