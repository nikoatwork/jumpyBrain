// Content-free static files for the isolated drawing frame. The frame holds no
// credentials and makes no memory requests; the parent shell saves through its
// own authenticated transport.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

export const DRAWING_FRAME_PATH = "/drawing-frame";
export const DRAWING_ASSET_PREFIX = "/drawing-app/";
// Excalidraw styles elements inline and decodes pasted images from data/blob URLs.
export const DRAWING_FRAME_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

type StaticResponse = { status: number; headers: Record<string, string>; body?: Buffer | string };
const types: Record<string, string> = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", woff2: "font/woff2", txt: "text/plain; charset=utf-8" };
const base = new URL("./drawing-app/", import.meta.url);
let names: Set<string> | undefined;
const cache = new Map<string, { body: Buffer; etag: string }>();

const frameHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Drawing · jumpyBrain</title>
  <link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg" />
  <link rel="stylesheet" href="${DRAWING_ASSET_PREFIX}drawing.css" />
</head>
<body>
<div id="root"></div>
<script type="module" src="${DRAWING_ASSET_PREFIX}boot.js"></script>
<script type="module" src="${DRAWING_ASSET_PREFIX}drawing.js"></script>
</body>
</html>`;

function asset(name: string) {
  // Only files emitted by the build are addressable; request text never becomes a path.
  names ??= new Set((readdirSync(base, { recursive: true, withFileTypes: true }) as import("node:fs").Dirent[])
    .filter(entry => entry.isFile())
    .map(entry => (entry.parentPath + "/" + entry.name).slice(new URL(base).pathname.length).replace(/^\/+/, "")));
  if (!names.has(name)) return undefined;
  let found = cache.get(name);
  if (!found) {
    const body = readFileSync(new URL(name, base));
    found = { body, etag: '"' + createHash("sha256").update(body).digest("base64url").slice(0, 27) + '"' };
    cache.set(name, found);
  }
  return found;
}

export function isDrawingStaticPath(pathname: string): boolean {
  return pathname === DRAWING_FRAME_PATH || pathname.startsWith(DRAWING_ASSET_PREFIX);
}

export function drawingStaticResponse(method: string | undefined, pathname: string, ifNoneMatch?: string | string[]): StaticResponse {
  const json = (status: number, code: string, message: string, extra: Record<string, string> = {}): StaticResponse => ({ status,
    headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...extra }, body: JSON.stringify({ error: { code, message } }) + "\n" });
  if (method !== "GET" && method !== "HEAD") return json(405, "method_not_allowed", "Use GET or HEAD for drawing editor files.", { allow: "GET, HEAD" });
  const head = method === "HEAD";
  if (pathname === DRAWING_FRAME_PATH) return { status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": DRAWING_FRAME_CSP,
    "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" }, body: head ? undefined : frameHtml };
  const name = pathname.slice(DRAWING_ASSET_PREFIX.length);
  const found = /^[A-Za-z0-9._/-]+$/.test(name) && !name.includes("..") ? asset(name) : undefined;
  if (!found) return json(404, "not_found", "Unknown drawing editor file.");
  const headers = { "content-type": types[name.split(".").pop() ?? ""] ?? "application/octet-stream", "x-content-type-options": "nosniff", etag: found.etag,
    // Hashed chunks and fonts never change; entry files revalidate so upgrades take effect.
    "cache-control": /^(chunk-|fonts\/)/.test(name) ? "public, max-age=31536000, immutable" : "no-cache" };
  if (ifNoneMatch === found.etag) return { status: 304, headers };
  return { status: 200, headers, body: head ? undefined : found.body };
}
