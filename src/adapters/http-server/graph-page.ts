import { readFileSync } from "node:fs";
import { MEMORY_DOCUMENT_ID_PATTERN } from "../../core/document-id.js";
import { notesMarkup, notesScript, notesStyles, notesViews } from "./notes-browser.js";
import { dreamMarkup, dreamScript, dreamStyles } from "./dream-handoff.js";

const lexicalBundle = readFileSync(new URL("./editor-bundle.js", import.meta.url), "utf8");

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

    /* Quiet map chrome shares the home screen's foundation. */
    h1 { margin: 0; color: var(--ink); font-size: 20px; line-height: 1.25; letter-spacing: -.025em; font-weight: 600; }
    #graph-header { position: relative; z-index: 10; background: var(--cream-50); }
    .map-heading { flex: 1 0 220px; }
    .map-heading p { margin: 4px 0 0; color: var(--ink-soft); font-size: 12px; }
    .graph-feedback { position: absolute; top: 100%; left: 0; right: 0; margin: 0; padding: 8px 24px; background: var(--cream-50); color: var(--ink-soft); font-size: 12px; overflow-wrap: anywhere; pointer-events: none; }

    /* Reusable controls and toolbar groups. */
    input { height: 36px; padding: 0 11px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: rgba(255,255,255,.72); color: var(--ink); transition: border-color .15s ease, box-shadow .15s ease, background .15s ease; }
    input::placeholder { color: var(--ink-faint); opacity: 1; }
    input:hover { border-color: rgba(48,46,43,.36); background: var(--white); }
    input:focus { border-color: var(--focus-ring); background: var(--white); }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 20px 24px; }
    #query { width: 230px; min-width: 0; background: transparent; border-color: var(--line); }
    #graph-filters { position: relative; }
    #graph-filters summary { cursor: pointer; }
    #graph-filters[open] summary { background: var(--surface-hover); }
    .map-options { position: absolute; z-index: 1; right: 0; top: calc(100% + 8px); width: min(300px, calc(100vw - 32px)); padding: 16px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--cream-50); box-shadow: var(--shadow-lg); }
    .map-options label { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--ink-soft); font-size: 12px; }
    .map-options .focus-field { display: block; }
    #focus { display: block; width: 100%; margin-top: 6px; }
    .map-options input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--ink); }
    .map-options p { margin: 0; color: var(--ink-faint); font-size: 12px; }
    .button { height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 15px; border: 1px solid transparent; border-radius: var(--radius-sm); font-weight: 680; font-size: 12px; transition: background .15s ease, border-color .15s ease; }
    .button-primary { background: var(--forest-900); color: var(--cream-50); box-shadow: none; }
    .button-primary:hover { background: var(--forest-800); box-shadow: none; }
    .button svg, .icon-button svg { width: 15px; height: 15px; }
    .icon-button { width: 34px; height: 34px; display: inline-grid; place-items: center; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-sm); background: rgba(255,255,255,.72); color: var(--forest-800); }
    .icon-button:hover { border-color: var(--line-strong); background: var(--white); }

    main { display: flex; min-height: 0; }
    #graph-wrap { flex: 1 1 auto; min-width: 0; position: relative; overflow: hidden; background: var(--cream-50); }
    #graph { display: block; width: 100%; height: 100%; cursor: grab; }
    #graph:active { cursor: grabbing; }
    .canvas-bottom { position: absolute; z-index: 2; left: 24px; right: 24px; bottom: 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; pointer-events: none; }
    .stats { color: var(--ink-soft); font-size: 12px; background: var(--cream-50); }
    .stats strong { font-weight: 500; font-variant-numeric: tabular-nums; }
    .canvas-tools { display: flex; gap: 4px; background: var(--cream-50); pointer-events: auto; }
    .canvas-tools .icon-button { border-color: transparent; background: transparent; }
    .canvas-tools .icon-button:hover { background: var(--surface-hover); }
    .helper { position: absolute; right: 24px; bottom: 62px; margin: 0; color: var(--ink-faint); font-size: 11px; pointer-events: none; }
    .error { margin: 0; padding: 0 24px 12px; color: var(--error-ink); font-size: 13px; overflow-wrap: anywhere; }
    #graph-empty { position: absolute; top: 40%; left: 24px; right: 24px; text-align: center; color: var(--ink-soft); pointer-events: none; }
    .sr-status { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

    .edge { stroke: #aaa298; stroke-opacity: .48; stroke-linecap: round; vector-effect: non-scaling-stroke; transition: stroke-opacity .15s ease; }
    .edge.markdown-link { stroke: #92897d; }
    .node { cursor: pointer; }
    .node circle { fill: var(--node-fill, var(--forest-700)); stroke: var(--cream-50); stroke-width: 2; vector-effect: non-scaling-stroke; transition: stroke-width .15s ease; }
    .node.unresolved circle { fill: var(--clay); stroke-dasharray: 3 2; }
    .node text { fill: var(--ink-soft); paint-order: stroke; stroke: rgba(252,250,246,.96); stroke-width: 4px; stroke-linejoin: round; font-size: 11px; font-weight: 640; letter-spacing: -.01em; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
    .node.show-label text, .node:hover text, .node:focus text, .node.selected text { opacity: 1; }
    .node:hover circle, .node:focus-visible circle, .node.selected circle { stroke: var(--gold); stroke-width: 4; }
    .node.selected text { fill: var(--forest-950); font-weight: 760; }

    @media (max-width: 680px) {
      .toolbar { padding: 12px 16px; gap: 6px; }
      .map-heading { flex-basis: 100%; margin-bottom: 8px; }
      #query { flex: 1; width: 120px; }
      #graph-filters { position: static; }
      .map-options { right: 16px; top: calc(100% - 4px); }
      .canvas-bottom { left: 16px; right: 16px; }
      .helper { left: 16px; right: auto; font-size: 10px; }
      .graph-feedback, .error { padding-inline: 16px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
    ${notesStyles}
    ${dreamStyles}
  </style>
</head>
<body data-view="home">
${notesMarkup}
${dreamMarkup}
<header id="graph-header">
  <div class="toolbar" aria-label="Map controls">
    <div class="map-heading">
      <h1>Memory map</h1>
      <p>Your notes and how they connect.</p>
    </div>
    <button id="open-dream" class="quiet-button" type="button" aria-haspopup="dialog" aria-controls="dream-handoff">Consolidate notes (Dream)…</button>
    <input id="query" data-testid="graph-query" aria-label="Filter map by title or tag" placeholder="Filter notes…" />
    <details id="graph-filters">
      <summary class="quiet-button">Filters</summary>
      <div class="map-options">
        <label class="focus-field">Show connections around<input id="focus" data-testid="graph-focus" placeholder="Note title or file" /></label>
        <label><input id="include-orphans" data-testid="graph-include-orphans" type="checkbox" checked />Notes without connections</label>
        <label><input id="include-unresolved" data-testid="graph-include-unresolved" type="checkbox" checked />Links to missing notes</label>
        <p>Dashed dots are links to notes that don't exist yet.</p>
      </div>
    </details>
    <button id="reload" data-testid="graph-reload" class="quiet-button" title="Refresh notes and connections">Refresh</button>
  </div>
  <p id="status" data-testid="graph-status" class="graph-feedback" role="status" hidden></p>
  <p id="ready" data-testid="graph-ready" class="sr-status" aria-live="polite" hidden>Map loaded.</p>
  <p id="error" data-testid="graph-error" class="error" role="alert" hidden></p>
</header>
<main>
  <section id="graph-wrap" aria-label="Memory map">
    <svg id="graph" data-testid="graph-svg" role="group" aria-label="Notes and their connections"><g id="viewport"></g></svg>
    <p id="graph-empty" role="status" hidden></p>
    <div class="canvas-bottom">
      <span class="stats" data-testid="graph-stats" aria-label="Shown on this map">
        <strong id="graph-node-count" data-testid="graph-node-count">0</strong> notes ·
        <strong id="graph-edge-count" data-testid="graph-edge-count">0</strong> connections
      </span>
      <div class="canvas-tools" aria-label="Graph view controls">
        <button id="zoom-out" class="icon-button" aria-label="Zoom out" title="Zoom out"><svg viewBox="0 0 24 24" fill="none"><path d="M7 12h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
        <button id="reset-view" class="icon-button" aria-label="Reset view" title="Reset view"><svg viewBox="0 0 24 24" fill="none"><path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button id="zoom-in" class="icon-button" aria-label="Zoom in" title="Zoom in"><svg viewBox="0 0 24 24" fill="none"><path d="M12 7v10m-5-5h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </div>
    </div>
    <p class="helper">Scroll to zoom · Drag to move · Select a note to open</p>
  </section>
  ${notesViews}
</main>
<script nonce="${nonce}">
${lexicalBundle}
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

// Keep the committed credential separate from edits in the settings dialog.
let activeApiKey = apiKeyInput.value.trim();
let credentialRevision = 0;
let connectionStatus = activeApiKey ? "checking" : "disconnected";

$("reload").addEventListener("click", loadGraph);
const graphFilters = $("graph-filters");
document.addEventListener("click", (event) => {
  if (graphFilters.open && !graphFilters.contains(event.target)) graphFilters.open = false;
});
graphFilters.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    graphFilters.open = false;
    graphFilters.querySelector("summary").focus();
  }
});
for (const id of ["query", "focus", "include-unresolved", "include-orphans"]) $(id).addEventListener("change", loadGraph);
for (const id of ["query", "focus"]) $(id).addEventListener("keydown", (event) => { if (event.key === "Enter") loadGraph(); });
$("note-retry").addEventListener("click", () => { if (state.editor) state.editor.retry(); });
const richEditor = window.createJumpyBrainNoteEditor($("note-editor"), {
  onChange: (markdown) => state.editor?.input(markdown),
  onReference: () => openReferenceSearch(),
  onError: (error) => {
    $("capture-message").hidden = false;
    $("capture-message").dataset.error = "true";
    $("capture-message").textContent = "Editor error. Keep this page open and copy your draft before reloading. " + error.message;
  },
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
  params.set("includeUnresolved", $("include-unresolved").checked ? "1" : "0");
  params.set("includeOrphans", $("include-orphans").checked ? "1" : "0");
  return "/memories/all/graph.json?" + params.toString();
}

async function graphFetch(url, options) {
  const requestOptions = Object.assign({}, options || {});
  requestOptions.headers = Object.assign({}, requestOptions.headers || {});
  const revision = credentialRevision;
  if (activeApiKey) requestOptions.headers.Authorization = "Bearer " + activeApiKey;
  try {
    const response = await fetch(url, requestOptions);
    if (revision === credentialRevision) {
      if (response.status === 401 || response.status === 403) connectionStatus = "disconnected";
      else if (response.ok) connectionStatus = "connected";
      else if (connectionStatus === "checking") connectionStatus = "unavailable";
      renderConnection();
    }
    return response;
  } catch (error) {
    if (revision === credentialRevision && error.name !== "AbortError") {
      connectionStatus = "unavailable";
      renderConnection();
    }
    throw error;
  }
}

async function graphJson(url, options) {
  const response = await graphFetch(url, options);
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Request failed with HTTP " + response.status);
    error.status = response.status;
    error.code = payload?.error?.code;
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
  status.textContent = text === "loading" ? "Loading map…" : text;
  status.hidden = Boolean(isError) || text === "loaded" || text === "ready";
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
    setStatus("loaded");
    if (state.view === "graph") render(payload);
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
  $("graph-node-count").textContent = graph.nodes.filter((node) => node.nodeKind === "document").length;
  $("graph-edge-count").textContent = graph.edges.length;
  $("graph-empty").hidden = graph.nodes.length > 0;
  $("graph-empty").textContent = $("query").value.trim() || $("focus").value.trim() || !$("include-orphans").checked || !$("include-unresolved").checked
    ? "No notes match these filters. Try clearing them."
    : "Your map starts with a note. Choose New note to get started.";
  const restoreFocus = preserveView && viewport.contains(document.activeElement);
  const focusedId = restoreFocus ? document.activeElement.getAttribute("data-node-id") : null;
  viewport.replaceChildren();
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2 || 400;
  const cy = rect.height / 2 || 300;
  const radius = Math.max(72, Math.min(cx, cy) - 88);
  const radiusX = Math.max(140, Math.min(cx - 120, radius * 1.65));
  const radiusY = radius;
  const positions = new Map();
  const orderedNodes = [...graph.nodes].sort((a, b) => b.degree - a.degree || String(a.title).localeCompare(String(b.title)));
  const featuredNodes = new Set(orderedNodes.slice(0, rect.width < 680 ? 5 : 12).map((node) => node.id));
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
    const nodeRadius = 6 + Math.min(node.degree, 12);
    circle.setAttribute("r", String(nodeRadius));
    circle.style.setProperty("--node-fill", nodeColor(node));
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const labelLeft = p.x > rect.width * .8;
    text.setAttribute("x", String((nodeRadius + 4) * (labelLeft ? -1 : 1)));
    text.setAttribute("text-anchor", labelLeft ? "end" : "start");
    text.setAttribute("y", "4");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = node.title || node.file || node.id;
    const label = Array.from(title.textContent);
    const maxLabel = rect.width < 680 ? 20 : 36;
    text.textContent = label.length > maxLabel ? label.slice(0, maxLabel - 1).join("") + "…" : title.textContent;
    g.append(title, circle, text);
    g.addEventListener("pointerdown", (event) => event.stopPropagation());
    g.addEventListener("click", (event) => { event.stopPropagation(); selectNode(node, g); });
    g.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectNode(node, g); } });
    viewport.append(g);
  }
  if (!preserveView) { state.pan = { x: 0, y: 0 }; state.scale = 1; }
  updateViewport();
  if (restoreFocus) focusGraphNode(focusedId);
}

function focusGraphNode(id) {
  const node = id && Array.from($("viewport").children).find((element) => element.getAttribute("data-node-id") === id);
  (node || $("query")).focus({ preventScroll: true });
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
    savedTitle: "",
    title: "",
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
    editorState.savedTitle = String(payload.title || "");
    editorState.title = editorState.savedTitle;
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
    editorState.dirty = editorState.draft !== editorState.savedBody || editorState.title !== editorState.savedTitle || editorState.unconfirmedSave;
    if (editorState.saveInFlight) editorState.saveQueued = true;
    if (editorState.autoSaveBlocked) {
      editorState.saveStatus = "failed";
    } else {
      editorState.saveStatus = editorState.saveInFlight ? "saving" : editorState.dirty ? "editing" : "saved";
      scheduleSave();
    }
    emit();
  }

  function inputTitle(value) {
    if (!editorState.loaded || editorState.cancelled) return;
    editorState.title = String(value);
    // A rejected duplicate did not write anything; a corrected name can autosave.
    if (["duplicate_title", "invalid_title"].includes(editorState.saveErrorCode)) {
      editorState.autoSaveBlocked = false;
      editorState.saveError = "";
      editorState.saveErrorCode = "";
    }
    input(editorState.draft);
  }

  function composeDraft(body, title) {
    const prefix = title !== editorState.savedTitle
      ? withEditableTitle(editorState.frontmatterPrefix, title, editorState.newline)
      : editorState.frontmatterPrefix;
    return options.composeDocument(prefix, body, editorState.newline);
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
    let title = editorState.title;
    let content = composeDraft(body, title);
    try {
      const payload = await options.writeDocument(editorState.documentId, content, editorState.contentHash);
      return { payload, body, title, revision, content };
    } catch (error) {
      if (!isCurrent() || Number(error && error.status) !== 412) throw error;

      // TODO(temporary last-write-wins): replace this one-retry overwrite with visible conflict/merge UX.
      const latest = await options.readDocument(editorState.documentId);
      if (!isCurrent()) throw new Error("Document selection changed during conflict refresh.");
      const latestParts = options.splitDocument(String(latest.content || ""));
      editorState.exactContent = String(latest.content || "");
      editorState.frontmatterPrefix = latestParts.frontmatterPrefix;
      editorState.newline = latestParts.newline;
      // Refresh the title baseline too. After a lost response, undoing a rename
      // still has to overwrite the possibly committed title, not silently keep it.
      const retainTitleDraft = editorState.title !== editorState.savedTitle || editorState.unconfirmedSave;
      if (typeof latest.title === "string") editorState.savedTitle = latest.title;
      if (!retainTitleDraft) editorState.title = editorState.savedTitle;
      editorState.contentHash = String(latest.contentHash || "");
      body = editorState.draft;
      revision = editorState.draftRevision;
      title = editorState.title;
      content = composeDraft(body, title);
      const payload = await options.writeDocument(editorState.documentId, content, editorState.contentHash);
      return { payload, body, title, revision, content };
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
        editorState.saveErrorCode = error && error.code;
        editorState.autoSaveBlocked = true;
        // A failed response may hide a committed write. Even undoing to the previous
        // body needs an explicit retry before we can confirm persistence or leave.
        editorState.unconfirmedSave = editorState.unconfirmedSave || !["duplicate_title", "invalid_title"].includes(editorState.saveErrorCode);
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
      editorState.savedTitle = result.title;
      editorState.frontmatterPrefix = options.splitDocument(result.content).frontmatterPrefix;
      editorState.unconfirmedSave = false;
      editorState.dirty = editorState.draft !== editorState.savedBody || editorState.title !== editorState.savedTitle;
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
      if (typeof latest.title === "string") editorState.title = editorState.savedTitle = latest.title;
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

  return { state: editorState, hydrate, input, inputTitle, setEditing, setNavigationPending, startSave, flush, retry, reconcile, hasPending, cancel };
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
    setStatus("This linked note doesn't exist yet: " + (node.title || node.id));
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

function queueGraphLayout(delay, restoreSelection = false) {
  if (!state.graph || state.view !== "graph") return;
  if (state.layoutTimer) window.clearTimeout(state.layoutTimer);
  state.layoutTimer = window.setTimeout(() => {
    state.layoutTimer = null;
    if (state.view !== "graph") return;
    render(state.graph, true);
    if (restoreSelection) focusGraphNode(state.selected);
  }, delay || 0);
}

// SVG has no viewBox: its local units match CSS pixels. Compensate pan using
// the clamped scale ratio so the chosen graph point stays under the anchor.
function zoomGraph(factor, clientX, clientY) {
  const rect = $("graph").getBoundingClientRect();
  const anchor = {
    x: clientX === undefined ? rect.width / 2 : clientX - rect.left,
    y: clientY === undefined ? rect.height / 2 : clientY - rect.top,
  };
  const scale = Math.max(.2, Math.min(4, state.scale * factor));
  const ratio = scale / state.scale;
  state.pan = {
    x: anchor.x - (anchor.x - state.pan.x) * ratio,
    y: anchor.y - (anchor.y - state.pan.y) * ratio,
  };
  state.scale = scale;
  updateViewport();
}

function onGraphWheel(event) {
  if (!event.deltaY) return;
  event.preventDefault();
  zoomGraph(event.deltaY < 0 ? 1.1 : .9, event.clientX, event.clientY);
}

const svg = $("graph");
svg.addEventListener("wheel", onGraphWheel, { passive: false });
svg.addEventListener("pointerdown", (event) => { state.dragging = { x: event.clientX, y: event.clientY, pan: { ...state.pan } }; svg.setPointerCapture(event.pointerId); });
svg.addEventListener("pointermove", (event) => { if (!state.dragging) return; state.pan = { x: state.dragging.pan.x + event.clientX - state.dragging.x, y: state.dragging.pan.y + event.clientY - state.dragging.y }; updateViewport(); });
svg.addEventListener("pointerup", () => { state.dragging = null; });
$("zoom-in").addEventListener("click", () => zoomGraph(1.2));
$("zoom-out").addEventListener("click", () => zoomGraph(1 / 1.2));
$("reset-view").addEventListener("click", () => { state.pan = { x: 0, y: 0 }; state.scale = 1; updateViewport(); });
window.addEventListener("resize", () => queueGraphLayout(80));
function updateViewport() { $("viewport").setAttribute("transform", "translate(" + state.pan.x + " " + state.pan.y + ") scale(" + state.scale + ")"); }

${dreamScript}
${notesScript}
</script>
</body>
</html>`;
}
