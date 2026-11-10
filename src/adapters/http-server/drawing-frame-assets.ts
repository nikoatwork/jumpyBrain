// Loaded as its own module before the editor: split chunks evaluate ahead of the
// editor entry body, so these globals cannot be set there. Fonts stay on this origin.
const host = window as unknown as { EXCALIDRAW_ASSET_PATH?: string; EXCALIDRAW_EXPORT_SOURCE?: string; FontFace: typeof FontFace };
host.EXCALIDRAW_ASSET_PATH = new URL("/drawing-app/", location.origin).href;
host.EXCALIDRAW_EXPORT_SOURCE = "jumpybrain";
// Excalidraw lists a public CDN as a second source for every font face. Drop
// those candidates so a missing local face falls back to system fonts instead.
const NativeFontFace = host.FontFace;
const local = (candidate: string) => {
  const url = /^url\(["']?([^"')]+)/.exec(candidate.trim())?.[1];
  if (!url) return true;
  try { return new URL(url, location.href).origin === location.origin; } catch { return false; }
};
host.FontFace = class extends NativeFontFace {
  constructor(family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors) {
    super(family, typeof source === "string" ? source.split(/,\s*(?=url\()/).filter(local).join(", ") || source : source, descriptors);
  }
};
export {};
