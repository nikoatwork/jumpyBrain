// Browser-only entry for the isolated drawing frame. The parent shell owns
// authentication, saving and navigation; this frame only edits one scene.
import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, MainMenu, serializeAsJSON } from "@excalidraw/excalidraw";

type Theme = "light" | "dark";
type Scene = { elements?: unknown; appState?: Record<string, unknown> | null; files?: unknown };
type Session = { scene: Scene; theme: Theme; readOnly: boolean; onChange: (serialized: string) => void };
type Api = { getSceneElements(): unknown; getAppState(): unknown; getFiles(): unknown };
type View = { session: Session | null; generation: number; theme: Theme; readOnly: boolean };

let view: View = { session: null, generation: 0, theme: "light", readOnly: false };
let publish: (next: View) => void = (next) => { view = next; };
let api: Api | null = null;
let saved = "";
let timer: number | null = null;

function serialize(): string | null {
  if (!api) return null;
  return serializeAsJSON(api.getSceneElements() as never, api.getAppState() as never, api.getFiles() as never, "local");
}
function report(): void {
  if (timer !== null) { window.clearTimeout(timer); timer = null; }
  const current = serialize();
  if (current === null || current === saved || !view.session || view.readOnly) return;
  saved = current;
  view.session.onChange(current);
}
function changed(): void {
  // Pointer movement and selection also fire; compare the saved shape only after input settles.
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(report, 300);
}

function Frame() {
  const [current, setCurrent] = useState(view);
  useEffect(() => { publish = (next) => { view = next; setCurrent(next); }; return () => { publish = (next) => { view = next; }; }; }, []);
  if (!current.session) return null;
  const scene = current.session.scene;
  return createElement(Excalidraw as never, {
    key: current.generation,
    initialData: { elements: scene.elements ?? [], appState: { ...(scene.appState ?? {}), collaborators: new Map() }, files: scene.files ?? {}, scrollToContent: true },
    excalidrawAPI: (value: Api) => { api = value; window.setTimeout(() => { saved = serialize() ?? ""; }, 0); },
    onChange: changed,
    theme: current.theme,
    viewModeEnabled: current.readOnly,
    langCode: "en",
    autoFocus: true,
    validateEmbeddable: () => false,
    UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, export: { saveFileToDisk: true } } },
  } as never, createElement(MainMenu, null,
    createElement(MainMenu.DefaultItems.SaveAsImage),
    createElement(MainMenu.DefaultItems.Export),
    createElement(MainMenu.DefaultItems.ClearCanvas),
    createElement(MainMenu.DefaultItems.ChangeCanvasBackground),
    createElement(MainMenu.DefaultItems.Help)));
}

const root = document.getElementById("root")!;
for (const element of [document.documentElement, document.body, root]) Object.assign(element.style, { height: "100%", margin: "0" });
createRoot(root).render(createElement(Frame));

const drawingHost = {
  open(session: Session) { api = null; saved = ""; publish({ session, generation: view.generation + 1, theme: session.theme, readOnly: session.readOnly }); },
  setTheme(theme: Theme) { publish({ ...view, theme }); },
  setReadOnly(readOnly: boolean) { publish({ ...view, readOnly }); },
  /** Reports any unsaved change immediately; returns false while the scene is not ready. */
  flush() { if (!api) return false; report(); return true; },
  close() { api = null; publish({ ...view, session: null }); },
};
export type DrawingFrameHost = typeof drawingHost;
(window as unknown as { jumpyBrainDrawing: DrawingFrameHost }).jumpyBrainDrawing = drawingHost;
