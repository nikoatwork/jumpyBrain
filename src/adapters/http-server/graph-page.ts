import { browserIcons } from "./browser-icons.js";
import { designSystemStyles } from "./browser-design-system.js";
import { GRAPH_NODE_TONES } from "./map-controller.js";
import { readFileSync } from "node:fs";
import { themeBootstrap, themeScript, themeStyles } from "./browser-theme.js";
import { sidebarBootstrap, sidebarScript } from "./browser-sidebar.js";
import { MEMORY_DOCUMENT_ID_PATTERN } from "../../core/document-id.js";
import { documentActionsMarkup, documentActionsScript, notesMarkup, notesScript, notesStyles, notesViews } from "./notes-browser.js";
import { dreamMarkup, dreamScript, dreamStyles } from "./dream-handoff.js";
import { companionMarkup, companionPrelude, companionScript, companionStyles } from "./companion-browser.js";
import { feedbackMarkup, feedbackStyles } from "./feedback.js";

const lexicalBundle = readFileSync(new URL("./editor-bundle.js", import.meta.url), "utf8");
const graphNodeGlows = GRAPH_NODE_TONES.map((type) =>
  `<radialGradient id="map-glow-${type}"><stop stop-color="var(--node-${type})" stop-opacity=".2"/><stop offset=".45" stop-color="var(--node-${type})" stop-opacity=".08"/><stop offset="1" stop-color="var(--node-${type})" stop-opacity="0"/></radialGradient>`
).join("");

export function graphPageHtml(nonce: string, view: "home" | "graph" | "settings" = "home", options: { companion?: boolean } = {}): string {
  const companion = options.companion === true;
  if (!/^[A-Za-z0-9_-]+$/.test(nonce)) throw new Error("graph page nonce must be base64url-safe");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${companion && view === "settings" ? "Settings" : view === "graph" ? "Memory map" : "Notes"} · jumpyBrain</title>
  <link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg" />
  <script nonce="${nonce}">${themeBootstrap}${sidebarBootstrap}</script>
  <style nonce="${nonce}">
    ${designSystemStyles}
    ${themeStyles}
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body { margin: 0; overflow: hidden; font: var(--text-body)/var(--leading-ui) var(--font-ui); background: var(--surface); color: var(--ink); -webkit-font-smoothing: antialiased; }
    button, input, textarea, select { font: inherit; }
    strong, b { font-weight: var(--weight-semibold); }
    button { cursor: pointer; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible, summary:focus-visible, select:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
    [hidden] { display: none !important; }

    /* Quiet map chrome shares the home screen's foundation. */
    h1, dialog h2 { margin: 0; color: var(--ink); font-size: var(--text-heading); line-height: var(--leading-heading); letter-spacing: -.025em; font-weight: var(--weight-semibold); }
    #graph-header { position: relative; z-index: 10; background: var(--surface); }
    .map-heading { flex: 1 0 220px; }
    .graph-feedback { position: absolute; top: 100%; left: 0; right: 0; margin: 0; padding: var(--space-2) var(--space-6); background: var(--surface); color: var(--ink-soft); font-size: var(--text-caption); overflow-wrap: anywhere; pointer-events: none; }
    #graph-notice { padding: 0 var(--space-6) var(--space-3); color: var(--ink-soft); font-size: var(--text-caption); overflow-wrap: anywhere; }
    #graph-warnings { margin: var(--space-1) 0; padding-left: var(--space-4); }

    /* Reusable controls and toolbar groups. */
    input { font-size: var(--text-ui); height: var(--control-height); padding: 0 var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); transition: border-color .15s ease, box-shadow .15s ease, background .15s ease; }
    input::placeholder { color: var(--ink-faint); opacity: 1; }
    input:hover { border-color: var(--ink-faint); }
    input:focus { border-color: var(--focus-ring); }
    .toolbar { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-5) var(--space-6); }
    #query { width: 230px; min-width: 0; background: transparent; border-color: var(--line); }
    #graph-filters { position: relative; }
    #graph-filters summary { cursor: pointer; list-style: none; }
    #graph-filters summary::-webkit-details-marker { display: none; }
    #graph-filters[open] summary { background: var(--surface-hover); }
    .map-options { position: absolute; z-index: 1; right: 0; top: calc(100% + 8px); width: min(300px, calc(100vw - 32px)); padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow-lg); }
    .map-options label { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); color: var(--ink-soft); font-size: var(--text-caption); }
    .map-options .focus-field { display: block; }
    #focus { display: block; width: 100%; margin-top: var(--space-1); }
    .map-options input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); }
    .map-options p { margin: 0; color: var(--ink-faint); font-size: var(--text-caption); }
    .button { height: var(--control-height); display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 var(--space-4); border: 1px solid transparent; border-radius: var(--radius-sm); font-weight: var(--weight-semibold); font-size: var(--text-ui); transition: background .15s ease, border-color .15s ease; }
    .button-primary { background: var(--control-fill); border-color: var(--line); color: var(--ink); box-shadow: none; }
    .button-primary:hover { background: var(--surface-hover); border-color: var(--line-strong); }
    .button svg, .icon-button svg { width: var(--icon-size); height: var(--icon-size); }
    .icon-button { width: var(--control-compact); height: var(--control-compact); display: inline-grid; place-items: center; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--control-fill); color: var(--ink-soft); }
    .icon-button:hover { border-color: var(--line-strong); background: var(--surface-hover); }

    main { display: flex; min-height: 0; }
    #graph-wrap { flex: 1 1 auto; min-width: 0; position: relative; overflow: hidden; background: var(--surface); }
    #graph-wrap::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: var(--map-wash); background: radial-gradient(ellipse at 24% 28%, var(--edge), transparent 56%), radial-gradient(ellipse at 78% 34%, var(--edge-link), transparent 54%), radial-gradient(ellipse at 52% 84%, var(--edge-end), transparent 54%); }
    #graph-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .graph-title { fill: var(--ink); paint-order: stroke; stroke: var(--surface); stroke-width: 4px; stroke-linejoin: round; font: 600 12px var(--font-ui); cursor: pointer; pointer-events: auto; }
    .match-context .node-core { opacity: .45; }
    #graph[aria-busy="true"] .graph-title { opacity: .55; }
    #graph { position: relative; display: block; width: 100%; height: 100%; cursor: grab; touch-action: none; }
    #graph:active { cursor: grabbing; }
    .canvas-bottom { position: absolute; z-index: 2; left: 24px; right: 24px; bottom: 18px; display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); pointer-events: none; }
    .stats { color: var(--ink-soft); font-size: var(--text-caption); background: transparent; }
    .stats strong { font-weight: var(--weight-regular); font-variant-numeric: tabular-nums; }
    .canvas-tools { display: flex; gap: var(--space-1); background: var(--surface); pointer-events: auto; }
    .helper { position: absolute; right: 24px; bottom: 62px; margin: 0; color: var(--ink-faint); font-size: var(--text-caption); pointer-events: none; }
    .error { margin: 0; padding: 0 var(--space-6) var(--space-3); color: var(--error-ink); font-size: var(--text-ui); overflow-wrap: anywhere; }
    #graph-empty { position: absolute; top: 40%; left: 24px; right: 24px; text-align: center; color: var(--ink-soft); pointer-events: none; }
    .sr-status { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

    .edge, .edge-shadow, .edge-highlight { stroke-linecap: round; vector-effect: non-scaling-stroke; pointer-events: none; }
    .edge { stroke: url(#map-threads); stroke-opacity: .55; transition: stroke-opacity .15s ease; }
    .edge.markdown-link { stroke-opacity: .7; }
    .edge-shadow { stroke: var(--edge-shadow); stroke-opacity: .13; }
    .edge-highlight { stroke: var(--edge-highlight); stroke-opacity: .72; }
    .node { cursor: pointer; }
    .node .node-core { fill: var(--node-fill, var(--node-note)); stroke: var(--surface); stroke-width: 1.5; vector-effect: non-scaling-stroke; filter: url(#map-node-shadow); transition: stroke-width .15s ease; }
    .node .node-halo { pointer-events: none; opacity: .7; transition: opacity .15s ease; }
    .node .node-sheen { fill: url(#map-node-light); pointer-events: none; }
    .node.unresolved .node-core { fill: var(--node-unresolved); stroke-dasharray: 3 2; }
    .node text { fill: var(--ink-soft); paint-order: stroke; stroke: var(--surface); stroke-width: 4px; stroke-linejoin: round; font-size: var(--text-caption); font-weight: var(--weight-semibold); letter-spacing: -.01em; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
    .node.show-label text, .node:hover text, .node:focus text, .node.selected text { opacity: 1; pointer-events: auto; }
    .node:hover .node-core, .node:focus-visible .node-core, .node.selected .node-core { stroke: var(--focus-ring); stroke-width: 4; }
    .node:hover .node-halo, .node:focus-visible .node-halo, .node.selected .node-halo { opacity: 1; }
    .node.selected text { fill: var(--ink); font-weight: var(--weight-semibold); }

    @media (max-width: 680px) {
      .toolbar { padding: var(--space-3) var(--space-4); gap: var(--space-1); }
      .map-heading { flex-basis: 100%; margin-bottom: var(--space-2); }
      #query { flex: 1 0 100%; width: 100%; order: 1; }
      #graph-filters { position: static; }
      .map-options { right: 16px; top: calc(100% - 4px); }
      .canvas-bottom { left: 16px; right: 16px; }
      .helper { left: 16px; right: auto; font-size: var(--text-caption); }
      .graph-feedback, #graph-notice, .error { padding-inline: var(--space-4); }
    }
    @media (max-width: 680px) and (max-height: 680px) {
      .map-options { top: auto; bottom: calc(100% - 4px); }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
    ${notesStyles}
    ${feedbackStyles}
    ${dreamStyles}
    ${companion ? companionStyles : ""}
  </style>
</head>
<body data-view="home">
${notesMarkup}
${documentActionsMarkup}
${dreamMarkup}
${feedbackMarkup}
<header id="graph-header">
  <div class="toolbar" aria-label="Map controls">
    <div class="map-heading">
      <h1>Memory map</h1>
    </div>
    <button id="open-dream" class="quiet-button note-icon" type="button" aria-label="Consolidate notes (Dream)" title="Consolidate notes (Dream)" aria-haspopup="dialog" aria-controls="dream-handoff">${browserIcons.dream}</button>
    <input id="query" data-testid="graph-query" aria-label="Search notes on the map" placeholder="Search notes…" />
    <details id="graph-filters">
      <summary class="quiet-button note-icon" aria-label="Filters" title="Filters">${browserIcons.filters}</summary>
      <div class="map-options">
        <label class="focus-field">Show connections around<input id="focus" data-testid="graph-focus" placeholder="Note title or file" /></label>
        <label><input id="include-orphans" data-testid="graph-include-orphans" type="checkbox" checked />Notes without connections</label>
        <label><input id="include-unresolved" data-testid="graph-include-unresolved" type="checkbox" checked />Links to missing notes</label>
        <p>Dashed dots are links to notes that don't exist yet.</p>
      </div>
    </details>
    <button id="graph-index-state" class="icon-button" aria-label="Search maintenance" hidden>↻</button>
    <button id="reload" data-testid="graph-reload" class="quiet-button note-icon" aria-label="Refresh notes and connections" title="Refresh notes and connections">${browserIcons.refresh}</button>
  </div>
  <div id="graph-notice" role="status" aria-atomic="true" hidden>
    <ul id="graph-warnings" hidden></ul>
  </div>
  <p id="status" data-testid="graph-status" class="graph-feedback" role="status" hidden></p>
  <p id="ready" data-testid="graph-ready" class="sr-status" aria-live="polite" hidden>Map loaded.</p>
  <p id="error" data-testid="graph-error" class="error" role="alert" hidden></p>
</header>
<main>
  <section id="graph-wrap" aria-label="Memory map">
    <canvas id="graph-canvas" aria-hidden="true" hidden></canvas>
    <svg id="graph" tabindex="0" data-testid="graph-svg" role="group" aria-label="Notes and their connections. Use arrow keys to explore notes and Enter to open.">
      <defs>
        <linearGradient id="map-threads" gradientUnits="userSpaceOnUse" x1="12%" y1="8%" x2="88%" y2="92%"><stop stop-color="var(--edge)"/><stop offset=".5" stop-color="var(--edge-link)"/><stop offset="1" stop-color="var(--edge-end)"/></linearGradient>
        <radialGradient id="map-node-light" cx="30%" cy="24%" r="78%"><stop stop-color="var(--node-light)" stop-opacity=".72"/><stop offset=".38" stop-color="var(--node-light)" stop-opacity=".18"/><stop offset=".72" stop-color="var(--node-shade)" stop-opacity="0"/><stop offset="1" stop-color="var(--node-shade)" stop-opacity=".24"/></radialGradient>
        <filter id="map-node-shadow" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="var(--node-shade)" flood-opacity=".2"/></filter>
        ${graphNodeGlows}
      </defs>
      <g id="viewport"></g>
    </svg>
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
  ${companion ? companionMarkup : ""}
</main>
</div>
<script nonce="${nonce}">
${lexicalBundle}
${sidebarScript}
const { createDocumentEditor, splitEditableDocument, composeEditableDocument, withEditableTitle, createRecentWriteSearch, installDocumentActions, referenceEligibility, createBrowserSearchRequest, memoryDocumentPath } = JumpyBrainBrowser;
const recentWrites = createRecentWriteSearch({
  scope: () => String(credentialRevision) + ":" + (typeof companionMode !== "undefined" && companionMode ? String(companionState?.generation) : ""),
  fetch: createBrowserSearchRequest((url, options) => graphJson(url, options)),
});
const searchMemoryNotes = (query, signal) => recentWrites.search(query, signal);
const $ = (id) => document.getElementById(id);
${themeScript}
const toast = JumpyBrainBrowser.installToast(document, () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : "hosted"));
const state = { view: "home", graph: null, graphToken: 0, selected: null, pan: { x: 0, y: 0 }, scale: 1, dragging: null, noteToken: 0, layoutTimer: null, editor: null };
const companionMode = ${companion};
const feedbackDiagnostics = JumpyBrainBrowser.createFeedbackDiagnostics();
const feedback = JumpyBrainBrowser.installFeedback({ document, window, diagnostics: feedbackDiagnostics,
  context: () => ({ view: state.view, connection: connectionStatus, companion: companionMode }),
  onOpen: () => cancelReferenceInteraction(),
  submit: (report, signal) => graphJson("/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report), signal }),
  collectHost: companionMode ? (signal) => graphJson("/companion/diagnostics", { signal }) : undefined });
${companion ? companionPrelude : ""}
const apiKeyInput = $("api-key");
if (!companionMode) {
  const hashKey = new URLSearchParams(location.hash.replace(/^#/, "")).get("apiKey");
  try { apiKeyInput.value = localStorage.getItem("jumpybrain.graph.apiKey") || ""; } catch { /* Browser storage may be disabled. */ }
  if (hashKey) {
    apiKeyInput.value = hashKey;
    try { localStorage.setItem("jumpybrain.graph.apiKey", hashKey); } catch { /* Session-only access. */ }
    history.replaceState(history.state, "", location.pathname + location.search);
  }

}

// Keep the committed credential separate from edits in the settings dialog.
let activeApiKey = companionMode ? "companion-session" : apiKeyInput.value.trim();
let credentialRevision = 0;
let connectionStatus = activeApiKey ? "checking" : "disconnected";

let searchMaintenance = null;
const map = JumpyBrainBrowser.createMapController({
  state, element: $, document, window,
  scope: () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : ""),
  fetchGraph: (url, signal) => graphJson(url, { signal }),
  searchNotes: async (query, signal) => {
    const packet = await recentWrites.search(query, signal, 120);
    const warnings = [];
    if (packet.localOnly) warnings.push("Showing matching saves from this tab. Server search is unavailable.");
    const descriptions = {
      index_not_fresh: "Recent edits are being indexed",
      semantic_coverage_incomplete: "Semantic coverage is still updating",
      semantic_query_failed_lexical_fallback: "Semantic search is unavailable; text matches are shown",
      read_only_lexical_fallback: "This connection uses read-only text search",
      query_constraints_lexical_only: "This query uses text search to preserve its constraints",
    };
    const details = (packet.retrieval?.warnings || []).map(code => descriptions[code]).filter(Boolean);
    if ((packet.retrieval?.warnings || []).includes("semantic_query_failed_lexical_fallback")) warnings.push("Semantic search is unavailable. Text matches are shown; retry with Refresh.");
    return { files: normalizeNoteResults(JumpyBrainBrowser.selectGraphSearchResults(query, packet.results), 12).map(result => result.file).filter(Boolean), warnings, details, updating: Boolean(packet.index?.stale) };
  }, setStatus,
  onReady: (ready) => { window.__jumpyBrainGraphReady = ready; }, openNode: selectNode,
});
const { loadGraph, queueGraphLayout } = map;
map.connect();
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
$("note-retry").addEventListener("click", () => { if (state.editor) state.editor.retry(); });
const richEditor = window.createJumpyBrainNoteEditor($("note-editor"), {
  atReferenceTrigger: companionMode,
  onChange: (markdown) => {
    state.editor?.input(markdown);
    if (companionMode && state.editor?.state.loaded) referenceCreation.saved(state.editor.state.savedBody, markdown);
  },
  onCompletedReferences: (titles) => {
    if (companionMode && !companionReadOnly() && state.editor?.state.loaded) {
      referenceCreation.completed(titles, state.editor.state.draft);
      referenceCreation.saved(state.editor.state.savedBody, state.editor.state.draft);
    }
  },
  onActivateReference: (title) => activatePageReference(title),
  canActivateReference: () => companionMode && companionRegistered && !companionFrozen && !companionSessionFailed
    && Boolean(state.editor?.state.loaded) && !state.editor.state.navigationPending,
  onError: (error) => {
    feedbackDiagnostics.event("editor", { severity: "error", outcome: "failed", code: "error" });
    $("capture-message").hidden = false;
    $("capture-message").dataset.error = "true";
    $("capture-message").textContent = "Editor error. Keep this page open and copy your draft before reloading. " + error.message;
  },
});
if (companionMode) $("insert-reference").title = "Insert page reference (or type @ to search)";
$("note-editor").addEventListener("blur", () => {
  if (state.editor) state.editor.flush();
});
window.addEventListener("beforeunload", protectPendingEditorUnload);

function protectPendingEditorUnload(event) {
  if ((!state.editor || !state.editor.hasPending()) && !(typeof companionMode !== "undefined" && companionMode && (noteCapture.hasPending() || referenceCreation.hasPending()))) return;
  event.preventDefault();
  event.returnValue = "";
}


async function graphFetch(url, options) {
  const requestOptions = Object.assign({}, options || {});
  requestOptions.headers = Object.assign({}, requestOptions.headers || {});
  const revision = credentialRevision;
  const diagnosticRequest = feedbackDiagnostics.begin();
  requestOptions.headers["X-JumpyBrain-Request"] = diagnosticRequest.id;
  if (typeof companionMode !== "undefined" && companionMode) {
    await companionReady;
    if (!companionRegistered || companionSessionFailed) {
      feedbackDiagnostics.event("connection", { request: diagnosticRequest.id, severity: "warn", outcome: "failed", code: "unavailable" });
      throw new Error("Companion session unavailable. Open Settings.");
    }
    requestOptions.headers["X-Companion-Generation"] = String(companionState.generation);
    requestOptions.headers["X-Companion-Tab"] = companionTabId;
  } else if (activeApiKey) requestOptions.headers.Authorization = "Bearer " + activeApiKey;
  try {
    const response = await fetch(url, requestOptions);
    feedbackDiagnostics.finish(url, requestOptions.method || "GET", diagnosticRequest, response);
    if (typeof companionMode !== "undefined" && companionMode && response.status === 409) {
      const packet = await response.clone().json().catch(() => null);
      if (packet?.error?.code === "stale_generation") companionFence();
    }
    if (revision === credentialRevision) {
      if (response.status === 401 || response.status === 403) connectionStatus = "disconnected";
      else if (response.ok) connectionStatus = "connected";
      else if (connectionStatus === "checking") connectionStatus = "unavailable";
      renderConnection();
    }
    return response;
  } catch (error) {
    feedbackDiagnostics.finish(url, requestOptions.method || "GET", diagnosticRequest, undefined, error.name === "AbortError");
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
  feedbackDiagnostics.result(url, options?.method || "GET", response, payload);
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
  return memoryDocumentPath(documentId);
}

function readGraphDocument(documentId, options) {
  return graphJson(documentUrl(documentId), options);
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
  if (documentActions.isBusy()) return false;
  if (typeof companionMode !== "undefined" && companionMode && companionFrozen) return false;
  referenceAutocomplete.dismiss();
  const editor = state.editor;
  if (!editor) {
    await action();
    return true;
  }
  if (editor.state.navigationPending) return false;
  editor.setNavigationPending(true);
  const saved = await editor.flush();
  if (state.editor !== editor) return false;
  if (!saved || (typeof companionMode !== "undefined" && companionMode && !await referenceCreation.saved(editor.state.savedBody, editor.state.draft))) {
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


${dreamScript}
${notesScript}
${documentActionsScript}
searchMaintenance = JumpyBrainBrowser.installSearchMaintenance({
  document, window,
  scope: () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : ""),
  enabled: () => Boolean(activeApiKey) && (!companionMode || (companionRegistered && !companionFrozen)) && !dreamDialog.open && !connectionDialog.open && !feedback.isOpen() && (state.view === "graph" || searchDialog.open),
  read: signal => graphJson("/memories/all/status", { signal }),
  onFresh: () => {
    map.invalidateTopology();
    if (state.view === "graph") loadGraph();
    if (searchDialog.open && $("note-search-input").value.trim()) noteSearch.query($("note-search-input").value, true);
  },
  onState: status => {
    const control = $("graph-index-state");
    control.hidden = status === "ready" || status === "updating";
    control.title = status === "failed" ? "Search could not update. Open search to retry." : "Search is unavailable. Open search for recovery.";
    control.setAttribute("aria-label", control.title);
  },
});
$("graph-index-state").addEventListener("click", () => openSearch());
for (const dialog of [dreamDialog, connectionDialog, $("feedback-dialog")]) dialog.addEventListener("toggle", () => { if (dialog.open) searchMaintenance.suspend(); else searchMaintenance.resume(); });
if (!companionMode) showPage(initialEntry.url);
${companion ? companionScript : ""}
</script>
</body>
</html>`;
}
