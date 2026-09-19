import { MEMORY_DOCUMENT_ID_PATTERN } from "../../core/document-id.js";
import { notesMarkup, notesScript, notesStyles, notesViews } from "./notes-browser.js";

export function graphPageHtml(nonce: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(nonce)) throw new Error("graph page nonce must be base64url-safe");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>jumpyBrain</title>
  <style nonce="${nonce}">
    /* jumpyBrain UI foundation: shared color, type, spacing, radius and elevation tokens. */
    :root {
      color-scheme: light;
      --ink: #302e2b;
      --ink-soft: #625e58;
      --ink-faint: #6b655d;
      --cream-50: #fcfaf6;
      --cream-100: #f6f3ed;
      --cream-200: #ede8df;
      --cream-300: #ddd6cb;
      --white: #fffdfa;
      --surface-hover: #eeeae3;
      --focus-ring: #625b52;
      --error-ink: #8b3434;
      --error-fill: #fbefed;
      --error-line: #c58c86;
      --line: rgba(48, 46, 43, .14);
      --line-strong: rgba(48, 46, 43, .26);
      /* Compatibility aliases shared with the notes browser; ordinary chrome is neutral. */
      --forest-950: var(--ink);
      --forest-900: #37342f;
      --forest-800: #49453f;
      --forest-700: #59544d;
      --forest-600: var(--focus-ring);
      --sage-500: #827b71;
      --sage-300: #ccc5ba;
      --sage-200: var(--cream-300);
      --sage-100: var(--surface-hover);
      --gold: var(--focus-ring);
      --clay: #a3534c;
      --shadow-sm: 0 1px 3px rgba(48, 46, 43, .05);
      --shadow-lg: 0 16px 48px rgba(48, 46, 43, .12), 0 2px 8px rgba(48, 46, 43, .05);
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --ease: cubic-bezier(.2, .8, .2, 1);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body { margin: 0; overflow: hidden; font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--cream-100); color: var(--ink); -webkit-font-smoothing: antialiased; }
    button, input, textarea { font: inherit; }
    button { cursor: pointer; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
    [hidden] { display: none !important; }

    /* Reusable application shell. */
    header { position: relative; z-index: 10; background: rgba(252, 250, 246, .94); border-bottom: 1px solid var(--line); box-shadow: 0 1px 0 rgba(255, 255, 255, .8); backdrop-filter: blur(18px); }
    .topbar { min-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 12px 24px; }
    .brand { display: flex; align-items: center; min-width: 0; gap: 12px; }
    .brand-mark { position: relative; width: 40px; height: 40px; flex: 0 0 auto; display: grid; place-items: center; color: var(--cream-50); background: var(--forest-900); border-radius: var(--radius-md); }
    .brand-mark svg { width: 23px; height: 23px; background: none; cursor: default; }
    .brand-copy { min-width: 0; }
    .brand-title-row { display: flex; align-items: center; gap: 9px; }
    h1 { margin: 0; color: var(--forest-950); font-size: 16px; line-height: 1.2; letter-spacing: -.015em; font-weight: 720; }
    .product-name { font-weight: 520; color: var(--forest-700); }
    .view-badge { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border: 1px solid var(--sage-200); border-radius: 999px; background: var(--sage-100); color: var(--forest-800); font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .brand-copy p { margin: 3px 0 0; color: var(--ink-faint); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
    .status-pill { min-width: 78px; max-width: 220px; height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; overflow: hidden; padding: 0 11px; border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,.66); color: var(--ink-soft); font-size: 12px; font-weight: 650; text-overflow: ellipsis; text-transform: capitalize; white-space: nowrap; }
    .status-pill::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--sage-500); box-shadow: 0 0 0 3px rgba(130,123,113,.14); }
    .status-pill[data-state="loading"]::before { background: var(--gold); animation: pulse 1s ease-in-out infinite; }
    .status-pill[data-state="error"] { color: var(--error-ink); border-color: var(--error-line); background: var(--error-fill); }
    .status-pill[data-state="error"]::before { background: var(--clay); }
    @keyframes pulse { 50% { opacity: .38; transform: scale(.78); } }

    /* Reusable controls and toolbar groups. */
    input { height: 36px; padding: 0 11px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: rgba(255,255,255,.72); color: var(--ink); transition: border-color .15s ease, box-shadow .15s ease, background .15s ease; }
    input::placeholder { color: var(--ink-faint); opacity: 1; }
    input:hover { border-color: rgba(48,46,43,.36); background: var(--white); }
    input:focus { border-color: var(--focus-ring); background: var(--white); }
    .toolbar { min-height: 62px; display: flex; align-items: center; gap: 12px; padding: 10px 24px 12px; border-top: 1px solid rgba(48,46,43,.08); }
    .toolbar-group { display: flex; align-items: center; gap: 8px; }
    .toolbar-divider { width: 1px; height: 28px; margin: 0 2px; background: var(--line); }
    .field { position: relative; display: block; }
    .field-label { position: absolute; z-index: 1; top: -7px; left: 8px; padding: 0 4px; color: var(--ink-faint); background: var(--cream-50); font-size: 9px; line-height: 14px; font-weight: 760; letter-spacing: .075em; text-transform: uppercase; pointer-events: none; }
    .field input { height: 38px; }
    #query { width: min(25vw, 270px); padding-left: 34px; }
    #focus { width: min(22vw, 230px); }
    #depth { width: 58px; text-align: center; padding-left: 8px; padding-right: 4px; }
    .search-icon { position: absolute; z-index: 1; left: 11px; top: 12px; width: 14px; height: 14px; color: var(--ink-faint); pointer-events: none; }
    .toggle { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 10px; border: 1px solid transparent; border-radius: var(--radius-sm); color: var(--ink-soft); font-size: 12px; font-weight: 620; user-select: none; white-space: nowrap; }
    .toggle:hover { border-color: var(--line); background: rgba(255,255,255,.48); }
    .toggle input { appearance: none; width: 30px; height: 18px; padding: 0; margin: 0; border: 0; border-radius: 999px; background: var(--cream-300); box-shadow: inset 0 0 0 1px rgba(48,46,43,.12); position: relative; }
    .toggle input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 50%; background: var(--white); box-shadow: 0 1px 3px rgba(48,46,43,.2); transition: transform .18s var(--ease); }
    .toggle input:checked { background: var(--forest-700); }
    .toggle input:checked::after { transform: translateX(12px); }
    .button { height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 15px; border: 1px solid transparent; border-radius: var(--radius-sm); font-weight: 680; font-size: 12px; transition: background .15s ease, border-color .15s ease; }
    .button-primary { background: var(--forest-900); color: var(--cream-50); box-shadow: none; }
    .button-primary:hover { background: var(--forest-800); box-shadow: none; }
    .button svg, .icon-button svg { width: 15px; height: 15px; }
    .icon-button { width: 34px; height: 34px; display: inline-grid; place-items: center; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-sm); background: rgba(255,255,255,.72); color: var(--forest-800); }
    .icon-button:hover { border-color: var(--line-strong); background: var(--white); }

    main { display: flex; min-height: 0; }
    #graph-wrap { flex: 1 1 auto; min-width: 0; position: relative; overflow: hidden; background: var(--cream-100); transition: flex-basis .32s var(--ease); }
    #graph { width: 100%; height: 100%; cursor: grab; background-color: var(--cream-100); background-image: radial-gradient(circle at 52% 47%, rgba(255,255,255,.95) 0, rgba(252,250,246,.45) 32%, rgba(237,232,223,.36) 72%), radial-gradient(rgba(48,46,43,.12) .7px, transparent .7px); background-size: 100% 100%, 19px 19px; }
    #graph:active { cursor: grabbing; }
    .canvas-top { position: absolute; z-index: 2; top: 18px; left: 20px; right: 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; pointer-events: none; }
    .canvas-intro { max-width: 420px; }
    .eyebrow { margin: 0 0 4px; color: var(--forest-700); font-size: 10px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
    .canvas-intro h2 { margin: 0; color: var(--forest-950); font-size: 20px; letter-spacing: -.025em; line-height: 1.2; }
    .canvas-intro p { margin: 5px 0 0; color: var(--ink-faint); font-size: 12px; }
    .legend { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 999px; background: rgba(252,250,246,.83); box-shadow: var(--shadow-sm); backdrop-filter: blur(10px); }
    .legend-item { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-soft); font-size: 11px; font-weight: 620; white-space: nowrap; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--forest-700); box-shadow: 0 0 0 3px rgba(89,84,77,.1); }
    .legend-dot.unresolved { background: var(--clay); box-shadow: 0 0 0 3px rgba(163,83,76,.1); }
    .canvas-bottom { position: absolute; z-index: 2; left: 20px; right: 20px; bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; pointer-events: none; }
    .stats { display: flex; align-items: stretch; gap: 1px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); background: rgba(252,250,246,.84); box-shadow: var(--shadow-sm); backdrop-filter: blur(10px); }
    .stat { min-width: 78px; padding: 8px 12px 9px; }
    .stat + .stat { border-left: 1px solid var(--line); }
    .stat-label { display: block; color: var(--ink-faint); font-size: 9px; font-weight: 780; letter-spacing: .08em; text-transform: uppercase; }
    .stat strong { display: block; margin-top: 1px; color: var(--forest-950); font-size: 18px; line-height: 1.15; font-variant-numeric: tabular-nums; }
    .canvas-tools { display: flex; gap: 6px; padding: 5px; border: 1px solid var(--line); border-radius: var(--radius-md); background: rgba(252,250,246,.84); box-shadow: var(--shadow-sm); backdrop-filter: blur(10px); pointer-events: auto; }
    .canvas-tools .icon-button { border-color: transparent; background: transparent; }
    .canvas-tools .icon-button:hover { border-color: var(--line); background: rgba(255,255,255,.72); }
    .helper { position: absolute; z-index: 2; right: 20px; bottom: 70px; color: var(--ink-faint); font-size: 10px; letter-spacing: .01em; }
    .error { position: fixed; z-index: 50; left: 50%; top: 50%; width: min(420px, calc(100% - 40px)); transform: translate(-50%, -50%); margin: 0; padding: 14px 16px; border: 1px solid var(--error-line); border-radius: var(--radius-md); background: var(--error-fill); box-shadow: var(--shadow-lg); color: var(--error-ink); white-space: pre-wrap; }
    .muted { color: var(--ink-faint); }
    .sr-status { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

    .edge { stroke: #aaa298; stroke-opacity: .48; stroke-linecap: round; vector-effect: non-scaling-stroke; transition: stroke-opacity .15s ease; }
    .edge.markdown-link { stroke: #92897d; }
    .node { cursor: pointer; }
    .node circle { fill: var(--node-fill, var(--forest-700)); stroke: rgba(255,253,250,.95); stroke-width: 2; filter: drop-shadow(0 2px 3px rgba(48,46,43,.18)); vector-effect: non-scaling-stroke; transition: stroke-width .15s ease, filter .15s ease; }
    .node.unresolved circle { fill: var(--clay); stroke-dasharray: 3 2; }
    .node text { fill: var(--ink-soft); paint-order: stroke; stroke: rgba(252,250,246,.96); stroke-width: 4px; stroke-linejoin: round; font-size: 11px; font-weight: 640; letter-spacing: -.01em; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
    .node.show-label text, .node:hover text, .node:focus text, .node.selected text { opacity: 1; }
    .node:hover circle, .node:focus-visible circle, .node.selected circle { stroke: var(--gold); stroke-width: 4; filter: drop-shadow(0 3px 6px rgba(48,46,43,.26)); }
    .node.selected text { fill: var(--forest-950); font-weight: 760; }

    @media (max-width: 980px) {
      .topbar { padding-inline: 16px; }
      .brand-copy p { display: none; }
      .toolbar { padding-inline: 16px; overflow-x: auto; }
      #query { width: 220px; }
      #focus { width: 200px; }
      .legend { display: none; }
    }
    @media (max-width: 680px) {
      .brand-copy { display: none; }
      .header-actions { gap: 6px; }
      .topbar { min-height: 60px; padding-block: 10px; }
      .brand-mark { width: 36px; height: 36px; }
      .toolbar { min-height: 58px; }
      .node.show-label:not(:hover):not(:focus):not(.selected) text { opacity: 0; }
      .canvas-intro p, .helper { display: none; }
      .canvas-intro h2 { font-size: 17px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
    ${notesStyles}
  </style>
</head>
<body data-view="home">
${notesMarkup}
<header id="graph-header">
  <div class="topbar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 20V10m0 3.5c-3.6 0-6.2-2-6.2-5.5 3.7-.3 6.2 1.6 6.2 5.5Zm0 2.5c3.9 0 6.5-2.1 6.5-5.8-3.9-.3-6.5 1.7-6.5 5.8Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="brand-copy">
        <div class="brand-title-row">
          <h1><span class="product-name">jumpyBrain / </span>Memory map</h1>
          <span class="view-badge">Graph</span>
        </div>
        <p>Trace the ideas, decisions, and notes that shape your shared memory.</p>
      </div>
    </div>
    <div class="header-actions">
      <span id="status" data-testid="graph-status" class="status-pill" data-state="ready">ready</span>
    </div>
  </div>
  <div class="toolbar" aria-label="Graph filters">
    <div class="toolbar-group">
      <label class="field">
        <span class="field-label">Filter map</span>
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <input id="query" data-testid="graph-query" placeholder="Filter titles or tags…" />
      </label>
      <label class="field">
        <span class="field-label">Focus</span>
        <input id="focus" data-testid="graph-focus" placeholder="File or note title" />
      </label>
      <label class="field">
        <span class="field-label">Depth</span>
        <input id="depth" data-testid="graph-depth" type="number" min="1" max="8" value="1" />
      </label>
    </div>
    <span class="toolbar-divider" aria-hidden="true"></span>
    <div class="toolbar-group">
      <label class="toggle"><input id="include-unresolved" data-testid="graph-include-unresolved" type="checkbox" checked />Unresolved</label>
      <label class="toggle"><input id="include-orphans" data-testid="graph-include-orphans" type="checkbox" checked />Orphans</label>
    </div>
    <button id="reload" data-testid="graph-reload" class="button button-primary">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 8a7.5 7.5 0 1 0 .1 7.8M19 8V3.5M19 8h-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Refresh map
    </button>
  </div>
  <p id="ready" data-testid="graph-ready" class="sr-status" aria-live="polite" hidden>Graph loaded.</p>
  <p id="error" data-testid="graph-error" class="error" hidden></p>
</header>
<main>
  <section id="graph-wrap">
    <div class="canvas-top">
      <div class="canvas-intro">
        <p class="eyebrow">Knowledge landscape</p>
        <h2>Explore your memory</h2>
        <p>Select a note to open its full-page Markdown editor. Refresh map to see saved link changes.</p>
      </div>
      <div class="legend" aria-label="Graph legend">
        <span class="legend-item"><i class="legend-dot"></i>Memory</span>
        <span class="legend-item"><i class="legend-dot unresolved"></i>Unresolved link</span>
      </div>
    </div>
    <svg id="graph" data-testid="graph-svg" role="img" aria-label="Markdown link graph"><g id="viewport"></g></svg>
    <div class="canvas-bottom">
      <span class="stats" data-testid="graph-stats">
        <span class="stat"><span class="stat-label">Nodes</span><strong id="graph-node-count" data-testid="graph-node-count">0</strong></span>
        <span class="stat"><span class="stat-label">Links</span><strong id="graph-edge-count" data-testid="graph-edge-count">0</strong></span>
      </span>
      <div class="canvas-tools" aria-label="Graph view controls">
        <button id="zoom-out" class="icon-button" aria-label="Zoom out" title="Zoom out"><svg viewBox="0 0 24 24" fill="none"><path d="M7 12h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
        <button id="reset-view" class="icon-button" aria-label="Reset view" title="Reset view"><svg viewBox="0 0 24 24" fill="none"><path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button id="zoom-in" class="icon-button" aria-label="Zoom in" title="Zoom in"><svg viewBox="0 0 24 24" fill="none"><path d="M12 7v10m-5-5h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </div>
    </div>
    <span class="helper">Scroll to zoom · Drag to pan</span>
  </section>
  ${notesViews}
</main>
<script nonce="${nonce}">
const $ = (id) => document.getElementById(id);
const state = { view: "home", graph: null, graphToken: 0, selected: null, pan: { x: 0, y: 0 }, scale: 1, dragging: null, noteToken: 0, layoutTimer: null, editor: null };
const apiKeyInput = $("api-key");
const hashKey = new URLSearchParams(location.hash.replace(/^#/, "")).get("apiKey");
try { apiKeyInput.value = localStorage.getItem("jumpybrain.graph.apiKey") || ""; } catch { /* Browser storage may be disabled. */ }
if (hashKey) {
  apiKeyInput.value = hashKey;
  try { localStorage.setItem("jumpybrain.graph.apiKey", hashKey); } catch { /* Session-only access. */ }
  history.replaceState(history.state, "", location.pathname + location.search);
}

$("reload").addEventListener("click", loadGraph);
for (const id of ["query", "focus", "depth", "include-unresolved", "include-orphans"]) $(id).addEventListener("change", loadGraph);
for (const id of ["query", "focus"]) $(id).addEventListener("keydown", (event) => { if (event.key === "Enter") loadGraph(); });
$("note-retry").addEventListener("click", () => { if (state.editor) state.editor.retry(); });
$("note-editor").addEventListener("input", () => {
  if (!state.editor) return;
  state.editor.input($("note-editor").value);
  autoSizeNoteEditor();
});
$("note-editor").addEventListener("blur", () => {
  if (state.editor) state.editor.flush();
});
window.addEventListener("beforeunload", protectPendingEditorUnload);

function protectPendingEditorUnload(event) {
  if (!state.editor || !state.editor.hasPending()) return;
  event.preventDefault();
  event.returnValue = "";
}

function graphUrl() {
  const params = new URLSearchParams();
  const query = $("query").value.trim();
  const focus = $("focus").value.trim();
  if (query) params.set("query", query);
  if (focus) params.set("focus", focus);
  params.set("depth", $("depth").value || "1");
  params.set("includeUnresolved", $("include-unresolved").checked ? "1" : "0");
  params.set("includeOrphans", $("include-orphans").checked ? "1" : "0");
  return "/memories/all/graph.json?" + params.toString();
}

function graphFetch(url, options) {
  const requestOptions = Object.assign({}, options || {});
  requestOptions.headers = Object.assign({}, requestOptions.headers || {});
  const apiKey = apiKeyInput.value.trim();
  if (apiKey) requestOptions.headers.Authorization = "Bearer " + apiKey;
  return fetch(url, requestOptions);
}

async function graphJson(url, options) {
  const response = await graphFetch(url, options);
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Request failed with HTTP " + response.status);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function documentUrl(documentId) {
  return "/memories/all/documents/" + encodeURIComponent(documentId);
}

function readGraphDocument(documentId) {
  return graphJson(documentUrl(documentId));
}

function writeGraphDocument(documentId, content, contentHash) {
  return graphJson(documentUrl(documentId), {
    method: "PUT",
    headers: { "Content-Type": "application/json", "If-Match": contentHash },
    body: JSON.stringify({ content }),
  });
}

function setStatus(text, isError, errorText) {
  const status = $("status");
  status.textContent = text;
  status.setAttribute("data-state", isError ? "error" : text === "loading" ? "loading" : text === "loaded" ? "loaded" : "ready");
  if (isError) {
    $("error").textContent = errorText || text;
    $("error").hidden = false;
  } else {
    $("error").hidden = true;
  }
}

async function loadGraph() {
  const token = ++state.graphToken;
  setStatus("loading");
  $("ready").hidden = true;
  $("reload").disabled = true;
  try {
    const payload = await graphJson(graphUrl());
    if (token !== state.graphToken) return;
    state.graph = payload;
    if (state.view === "graph") render(payload);
    setStatus("loaded");
    $("ready").hidden = false;
    window.__jumpyBrainGraphReady = true;
  } catch (error) {
    if (token !== state.graphToken) return;
    setStatus("error", true, String(error && error.message ? error.message : error));
    window.__jumpyBrainGraphReady = false;
  } finally {
    if (token === state.graphToken) $("reload").disabled = false;
  }
}

function render(graph, preserveView) {
  const svg = $("graph");
  const viewport = $("viewport");
  viewport.replaceChildren();
  $("graph-node-count").textContent = graph.nodes.length;
  $("graph-edge-count").textContent = graph.edges.length;
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2 || 400;
  const cy = rect.height / 2 || 300;
  const radius = Math.max(72, Math.min(cx, cy) - 88);
  const radiusX = Math.max(140, Math.min(cx - 120, radius * 1.65));
  const radiusY = radius;
  const positions = new Map();
  const orderedNodes = [...graph.nodes].sort((a, b) => b.degree - a.degree || String(a.title).localeCompare(String(b.title)));
  const featuredNodes = new Set(orderedNodes.slice(0, Math.min(18, orderedNodes.length)).map((node) => node.id));
  orderedNodes.forEach((node, index) => {
    if (index === 0 && orderedNodes.length > 2) {
      positions.set(node.id, { x: cx, y: cy });
      return;
    }
    const spiralIndex = orderedNodes.length > 2 ? index - 1 : index;
    const angle = spiralIndex * 2.399963229728653;
    const progress = Math.sqrt((spiralIndex + 1) / Math.max(1, orderedNodes.length - 1));
    const nodeRadius = radius * (.28 + progress * .72) * (node.nodeKind === "unresolved" ? .96 : 1);
    positions.set(node.id, { x: cx + Math.cos(angle) * radiusX * (nodeRadius / radius), y: cy + Math.sin(angle) * radiusY * (nodeRadius / radius) });
  });
  for (const edge of graph.edges) {
    const a = positions.get(edge.source), b = positions.get(edge.target);
    if (!a || !b) continue;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "edge " + edge.kind);
    line.setAttribute("data-testid", "graph-edge");
    line.setAttribute("x1", a.x); line.setAttribute("y1", a.y); line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
    line.setAttribute("stroke-width", String(Math.min(1 + edge.count, 5)));
    viewport.append(line);
  }
  for (const node of graph.nodes) {
    const p = positions.get(node.id);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "node " + node.nodeKind + (featuredNodes.has(node.id) ? " show-label" : "") + (state.selected === node.id ? " selected" : ""));
    g.setAttribute("data-testid", "graph-node");
    g.setAttribute("data-node-id", node.id);
    g.setAttribute("role", "button");
    g.setAttribute("tabindex", "0");
    g.setAttribute("aria-label", (node.title || node.file || node.id) + ", " + (node.nodeKind === "unresolved" ? "unresolved link" : "memory note"));
    g.setAttribute("transform", "translate(" + p.x + " " + p.y + ")");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", String(6 + Math.min(node.degree, 12)));
    circle.style.setProperty("--node-fill", nodeColor(node));
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", "10"); text.setAttribute("y", "4");
    text.textContent = node.title || node.file || node.id;
    g.append(circle, text);
    g.addEventListener("pointerdown", (event) => event.stopPropagation());
    g.addEventListener("click", (event) => { event.stopPropagation(); selectNode(node, g); });
    g.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectNode(node, g); } });
    viewport.append(g);
  }
  if (!preserveView) { state.pan = { x: 0, y: 0 }; state.scale = 1; }
  updateViewport();
}

function nodeColor(node) {
  if (node.nodeKind === "unresolved") return "#ba6953";
  return ({ page: "#285b45", decision: "#ad8243", finding: "#6f824e", preference: "#886b59", session: "#6f8874", note: "#477560" })[node.type] || "#39705a";
}

function createDocumentEditor(options) {
  const editorState = {
    generation: options.generation,
    selectionToken: options.generation,
    nodeId: options.nodeId,
    documentId: options.documentId,
    exactContent: "",
    contentHash: "",
    frontmatterPrefix: "",
    newline: "\\n",
    trailingNewline: false,
    savedBody: "",
    draft: "",
    dirty: false,
    draftRevision: 0,
    saveTimer: null,
    saveInFlight: null,
    saveQueued: false,
    saveStatus: "idle",
    saveError: "",
    loaded: false,
    editing: false,
    navigationPending: false,
    autoSaveBlocked: false,
    unconfirmedSave: false,
    reconcileToken: 0,
    cancelled: false,
  };

  const emit = () => { if (!editorState.cancelled) options.onChange(editorState); };
  const clearSaveTimer = () => {
    if (editorState.saveTimer !== null) options.clearTimer(editorState.saveTimer);
    editorState.saveTimer = null;
  };
  const isCurrent = () => !editorState.cancelled && options.isCurrent(editorState.generation, editorState.documentId);

  function hydrate(payload) {
    const parts = options.splitDocument(String(payload.content || ""));
    editorState.exactContent = String(payload.content || "");
    editorState.contentHash = String(payload.contentHash || "");
    editorState.frontmatterPrefix = parts.frontmatterPrefix;
    editorState.newline = parts.newline;
    editorState.trailingNewline = parts.trailingNewline;
    editorState.savedBody = parts.body;
    editorState.draft = parts.body;
    editorState.dirty = false;
    editorState.draftRevision = 0;
    editorState.saveStatus = "idle";
    editorState.saveError = "";
    editorState.loaded = true;
    editorState.autoSaveBlocked = false;
    editorState.unconfirmedSave = false;
    emit();
  }

  function scheduleSave() {
    clearSaveTimer();
    if (!editorState.dirty || editorState.autoSaveBlocked || editorState.saveInFlight || !isCurrent()) return;
    editorState.saveTimer = options.setTimer(() => {
      editorState.saveTimer = null;
      startSave();
    }, options.debounceMs);
  }

  function input(value) {
    if (!editorState.loaded || editorState.cancelled) return;
    editorState.draft = String(value).replace(/\\r\\n/g, "\\n");
    editorState.trailingNewline = /\\n$/.test(editorState.draft);
    editorState.draftRevision += 1;
    editorState.dirty = editorState.draft !== editorState.savedBody || editorState.unconfirmedSave;
    if (editorState.saveInFlight) editorState.saveQueued = true;
    if (editorState.autoSaveBlocked) {
      editorState.saveStatus = "failed";
    } else {
      editorState.saveStatus = editorState.saveInFlight ? "saving" : editorState.dirty ? "editing" : "saved";
      scheduleSave();
    }
    emit();
  }

  function setEditing(value) {
    const endedEditing = editorState.editing && !value;
    editorState.editing = Boolean(value);
    if (editorState.editing && editorState.saveStatus !== "saving" && editorState.saveStatus !== "failed" && editorState.saveStatus !== "saved") editorState.saveStatus = "editing";
    if (!editorState.editing && !editorState.dirty && editorState.saveStatus === "editing") editorState.saveStatus = "idle";
    emit();
    if (endedEditing && editorState.saveStatus === "saved" && !editorState.dirty && !editorState.saveInFlight && !editorState.navigationPending) reconcile();
  }

  function setNavigationPending(value) {
    editorState.navigationPending = Boolean(value);
    emit();
  }

  async function attemptSave() {
    let body = editorState.draft;
    let revision = editorState.draftRevision;
    let content = options.composeDocument(editorState.frontmatterPrefix, body, editorState.newline);
    try {
      const payload = await options.writeDocument(editorState.documentId, content, editorState.contentHash);
      return { payload, body, revision, content };
    } catch (error) {
      if (!isCurrent() || Number(error && error.status) !== 412) throw error;

      // TODO(temporary last-write-wins): replace this one-retry overwrite with visible conflict/merge UX.
      const latest = await options.readDocument(editorState.documentId);
      if (!isCurrent()) throw new Error("Document selection changed during conflict refresh.");
      const latestParts = options.splitDocument(String(latest.content || ""));
      editorState.exactContent = String(latest.content || "");
      editorState.frontmatterPrefix = latestParts.frontmatterPrefix;
      editorState.newline = latestParts.newline;
      editorState.contentHash = String(latest.contentHash || "");
      body = editorState.draft;
      revision = editorState.draftRevision;
      content = options.composeDocument(editorState.frontmatterPrefix, body, editorState.newline);
      const payload = await options.writeDocument(editorState.documentId, content, editorState.contentHash);
      return { payload, body, revision, content };
    }
  }

  async function runSaveLoop() {
    while (editorState.dirty && isCurrent()) {
      editorState.saveQueued = false;
      editorState.saveStatus = "saving";
      editorState.saveError = "";
      emit();
      let result;
      try {
        result = await attemptSave();
      } catch (error) {
        if (!isCurrent()) return false;
        editorState.saveStatus = "failed";
        editorState.saveError = String(error && error.message ? error.message : error);
        editorState.autoSaveBlocked = true;
        // A failed response may hide a committed write. Even undoing to the previous
        // body needs an explicit retry before we can confirm persistence or leave.
        editorState.unconfirmedSave = true;
        editorState.dirty = true;
        editorState.saveQueued = false;
        emit();
        return false;
      }
      if (!isCurrent()) return false;
      if (!result.payload || typeof result.payload.newContentHash !== "string") {
        editorState.saveStatus = "failed";
        editorState.saveError = "Save response did not include a new content hash.";
        editorState.autoSaveBlocked = true;
        editorState.unconfirmedSave = true;
        editorState.dirty = true;
        emit();
        return false;
      }
      editorState.contentHash = result.payload.newContentHash;
      editorState.exactContent = result.content;
      editorState.savedBody = result.body;
      editorState.unconfirmedSave = false;
      editorState.dirty = editorState.draft !== editorState.savedBody;
      editorState.trailingNewline = /\\n$/.test(editorState.draft);
      editorState.saveStatus = "saved";
      editorState.saveError = "";
      editorState.autoSaveBlocked = false;
      if (options.onSaved) options.onSaved(result.payload);
      emit();
    }
    return !editorState.dirty && isCurrent();
  }

  function startSave() {
    clearSaveTimer();
    if (!editorState.dirty || editorState.autoSaveBlocked || !isCurrent()) return editorState.saveInFlight || Promise.resolve(!editorState.dirty);
    if (editorState.saveInFlight) {
      editorState.saveQueued = true;
      emit();
      return editorState.saveInFlight;
    }
    const operation = runSaveLoop();
    editorState.saveInFlight = operation;
    operation.then((saved) => {
      if (editorState.saveInFlight !== operation) return;
      editorState.saveInFlight = null;
      emit();
      if (saved && (!editorState.editing || options.persistentEditing) && !editorState.navigationPending) reconcile();
    });
    return operation;
  }

  async function flush() {
    clearSaveTimer();
    if (editorState.autoSaveBlocked && editorState.dirty) return false;
    if (editorState.dirty && !editorState.saveInFlight) startSave();
    if (editorState.saveInFlight) await editorState.saveInFlight;
    return !editorState.dirty && editorState.saveStatus !== "failed";
  }

  function retry() {
    if (!editorState.dirty || !isCurrent()) return Promise.resolve(true);
    editorState.autoSaveBlocked = false;
    editorState.saveError = "";
    return startSave();
  }

  async function reconcile() {
    if (!isCurrent() || editorState.dirty || (editorState.editing && !options.persistentEditing) || editorState.saveInFlight || editorState.navigationPending) return;
    const token = ++editorState.reconcileToken;
    const revision = editorState.draftRevision;
    try {
      const latest = await options.readDocument(editorState.documentId);
      if (!isCurrent() || token !== editorState.reconcileToken || revision !== editorState.draftRevision || editorState.dirty || (editorState.editing && !options.persistentEditing) || editorState.saveInFlight || editorState.navigationPending) return;
      const parts = options.splitDocument(String(latest.content || ""));
      // A persistent editor must never replace its body/caret with another writer's version.
      // Leave its previous hash intact so the next write goes through the explicit conflict policy.
      if (options.persistentEditing && parts.body !== editorState.draft) return;
      editorState.exactContent = String(latest.content || "");
      editorState.contentHash = String(latest.contentHash || editorState.contentHash);
      editorState.frontmatterPrefix = parts.frontmatterPrefix;
      editorState.newline = parts.newline;
      editorState.trailingNewline = parts.trailingNewline;
      editorState.savedBody = parts.body;
      editorState.draft = parts.body;
      editorState.saveStatus = "saved";
      emit();
    } catch {
      // The confirmed PUT remains saved; a later document GET can reconcile canonical frontmatter.
    }
  }

  function hasPending() {
    return editorState.dirty || Boolean(editorState.saveInFlight);
  }

  function cancel() {
    clearSaveTimer();
    editorState.cancelled = true;
    editorState.reconcileToken += 1;
  }

  return { state: editorState, hydrate, input, setEditing, setNavigationPending, startSave, flush, retry, reconcile, hasPending, cancel };
}

function splitEditableDocument(content) {
  const exact = String(content || "");
  const newline = exact.includes("\\r\\n") ? "\\r\\n" : "\\n";
  const frontmatter = exact.match(/^---(?:\\r\\n|\\n)[\\s\\S]*?(?:\\r\\n|\\n)---(?:(?:\\r\\n|\\n)|$)/);
  const frontmatterPrefix = frontmatter ? frontmatter[0] : "";
  const rawBody = exact.slice(frontmatterPrefix.length);
  return {
    frontmatterPrefix,
    body: rawBody.replace(/\\r\\n/g, "\\n"),
    newline,
    trailingNewline: /(?:\\r\\n|\\n)$/.test(rawBody),
  };
}

function composeEditableDocument(frontmatterPrefix, body, newline) {
  const normalizedBody = String(body || "").replace(/\\r\\n/g, "\\n");
  return String(frontmatterPrefix || "") + (newline === "\\r\\n" ? normalizedBody.replace(/\\n/g, "\\r\\n") : normalizedBody);
}

async function selectNode(node) {
  if (node.nodeKind === "unresolved") {
    setStatus("unresolved link: " + (node.title || node.id));
    return;
  }
  if (!isValidMemoryDocumentId(node.documentId)) {
    setStatus("This document is missing a valid memory ID.");
    return;
  }
  if (await navigation.navigate("/?note=" + encodeURIComponent(node.documentId))) state.selected = node.id;
}

async function requestEditorNavigation(action) {
  const editor = state.editor;
  if (!editor) {
    await action();
    return true;
  }
  if (editor.state.navigationPending) return false;
  editor.setNavigationPending(true);
  const saved = await editor.flush();
  if (state.editor !== editor) return false;
  if (!saved) {
    editor.setNavigationPending(false);
    return false;
  }
  await action();
  // Keep the editor read-only until the approved route is applied, including history replay.
  return true;
}

function isValidMemoryDocumentId(value) {
  return typeof value === "string" && ${MEMORY_DOCUMENT_ID_PATTERN}.test(value);
}

function autoSizeNoteEditor() {
  const textarea = $("note-editor");
  const panel = $("note-panel");
  const scroll = panel.scrollTop;
  textarea.style.height = "0px";
  textarea.style.height = Math.max(280, textarea.scrollHeight) + "px";
  panel.scrollTop = scroll;
}

function queueGraphLayout(delay) {
  if (!state.graph || state.view !== "graph") return;
  if (state.layoutTimer) window.clearTimeout(state.layoutTimer);
  state.layoutTimer = window.setTimeout(() => { state.layoutTimer = null; if (state.view === "graph") render(state.graph, true); }, delay || 0);
}

function escapeHtml(value) { return String(value || "").replace(/[&<>\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

// Inline dependency-free Markdown renderer. Escapes HTML first, then applies a
// small subset of Markdown (headings, lists, fenced/inline code, bold/italic,
// links, blockquotes, horizontal rules, paragraphs). Frontmatter is rendered as
// a muted <details> metadata block above the body.
function inline(text) {
  text = escapeHtml(text);
  const codes = [];
  text = text.replace(/\`([^\`]+)\`/g, (_, c) => { codes.push(c); return "\\u0001C" + (codes.length - 1) + "\\u0001"; });
  text = text.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, (_, t, u) => "<a href=\\"" + u + "\\" rel=\\"noopener noreferrer\\">" + t + "</a>");
  text = text.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\\*([^*]+)\\*/g, "$1<em>$2</em>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
  text = text.replace(/\\u0001C(\\d+)\\u0001/g, (_, i) => "<code>" + codes[+i] + "</code>");
  return text;
}

function renderMarkdown(md) {
  const fmMatch = String(md || "").match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n?/);
  let frontmatter = "";
  let body = String(md || "");
  if (fmMatch) { frontmatter = fmMatch[1]; body = body.slice(fmMatch[0].length); }
  const codeBlocks = [];
  body = body.replace(/\`\`\`(\\w*)\\r?\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
    const i = codeBlocks.length;
    codeBlocks.push({ lang: lang || "", code });
    return "\\u0000CODEBLOCK" + i + "\\u0000";
  });
  const lines = body.split(/\\r?\\n/);
  let html = "";
  let i = 0;
  let listType = null;
  let para = [];
  const flushPara = () => { if (para.length) { html += "<p>" + inline(para.join(" ")) + "</p>"; para = []; } };
  const closeList = () => { if (listType) { html += "</" + listType + ">"; listType = null; } };
  while (i < lines.length) {
    const line = lines[i];
    const codeHolder = line.match(/\\u0000CODEBLOCK(\\d+)\\u0000/);
    if (codeHolder) {
      closeList(); flushPara();
      const cb = codeBlocks[+codeHolder[1]];
      html += "<pre><code" + (cb.lang ? " class=\\"language-" + cb.lang + "\\"" : "") + ">" + escapeHtml(cb.code) + "</code></pre>";
      i++; continue;
    }
    const h = line.match(/^(#{1,6})\\s+(.*)$/);
    if (h) { closeList(); flushPara(); const lvl = h[1].length; html += "<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">"; i++; continue; }
    if (/^\\s*([-*_])\\1{2,}\\s*$/.test(line)) { closeList(); flushPara(); html += "<hr/>"; i++; continue; }
    if (/^\\s*>\\s?/.test(line)) { closeList(); flushPara(); const q = line.replace(/^\\s*>\\s?/, ""); html += "<blockquote>" + inline(q) + "</blockquote>"; i++; continue; }
    if (/^\\s*[-*+]\\s+/.test(line)) { flushPara(); if (listType !== "ul") { closeList(); listType = "ul"; html += "<ul>"; } html += "<li>" + inline(line.replace(/^\\s*[-*+]\\s+/, "")) + "</li>"; i++; continue; }
    if (/^\\s*\\d+\\.\\s+/.test(line)) { flushPara(); if (listType !== "ol") { closeList(); listType = "ol"; html += "<ol>"; } html += "<li>" + inline(line.replace(/^\\s*\\d+\\.\\s+/, "")) + "</li>"; i++; continue; }
    if (line.trim() === "") { closeList(); flushPara(); i++; continue; }
    closeList(); para.push(line.trim()); i++;
  }
  closeList(); flushPara();
  let fmHtml = "";
  if (frontmatter) fmHtml = "<details class=\\"note-frontmatter\\"><summary>frontmatter</summary><pre>" + escapeHtml(frontmatter) + "</pre></details>";
  return fmHtml + html;
}

const svg = $("graph");
svg.addEventListener("wheel", (event) => { event.preventDefault(); state.scale = Math.max(.2, Math.min(4, state.scale * (event.deltaY < 0 ? 1.1 : .9))); updateViewport(); }, { passive: false });
svg.addEventListener("pointerdown", (event) => { state.dragging = { x: event.clientX, y: event.clientY, pan: { ...state.pan } }; svg.setPointerCapture(event.pointerId); });
svg.addEventListener("pointermove", (event) => { if (!state.dragging) return; state.pan = { x: state.dragging.pan.x + event.clientX - state.dragging.x, y: state.dragging.pan.y + event.clientY - state.dragging.y }; updateViewport(); });
svg.addEventListener("pointerup", () => { state.dragging = null; });
$("zoom-in").addEventListener("click", () => { state.scale = Math.min(4, state.scale * 1.2); updateViewport(); });
$("zoom-out").addEventListener("click", () => { state.scale = Math.max(.2, state.scale / 1.2); updateViewport(); });
$("reset-view").addEventListener("click", () => { state.pan = { x: 0, y: 0 }; state.scale = 1; updateViewport(); });
window.addEventListener("resize", () => { queueGraphLayout(80); if (state.view === "note") autoSizeNoteEditor(); });
function updateViewport() { $("viewport").setAttribute("transform", "translate(" + state.pan.x + " " + state.pan.y + ") scale(" + state.scale + ")"); }

${notesScript}
</script>
</body>
</html>`;
}
