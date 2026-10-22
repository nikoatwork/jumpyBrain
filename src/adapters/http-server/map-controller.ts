// Browser-only map presentation. Fetch and guarded note navigation stay with the shell.
import type { MemoryGraphNode, MemoryGraphResult } from "../../types.js";
import { HTTP_MEMORY_ROUTES } from "../http-protocol.js";
const GRAPH_DOCUMENT_TONES = ["page", "decision", "finding", "preference", "session", "note"] as const;
export const GRAPH_NODE_TONES = [...GRAPH_DOCUMENT_TONES, "unresolved"] as const;
export function graphNodeTone(node: Pick<MemoryGraphNode, "nodeKind" | "type">): string {
  return node.nodeKind === "unresolved" ? "unresolved" : GRAPH_DOCUMENT_TONES.some(type => type === node.type) ? node.type! : "note";
}
export interface MapState {
  view: string; graph: MemoryGraphResult | null; graphToken: number; selected: string | null;
  pan: { x: number; y: number }; scale: number; layoutTimer: number | null;
  dragging: { x: number; y: number; pan: { x: number; y: number } } | null;
}
interface MapElements {
  graph: SVGSVGElement; viewport: SVGGElement;
  query: HTMLInputElement; focus: HTMLInputElement;
  "include-unresolved": HTMLInputElement; "include-orphans": HTMLInputElement;
  reload: HTMLButtonElement; ready: HTMLElement;
  "graph-warnings": HTMLElement;
  "graph-notice": HTMLElement; "graph-node-count": HTMLElement; "graph-edge-count": HTMLElement;
  "graph-empty": HTMLElement; "zoom-in": HTMLButtonElement; "zoom-out": HTMLButtonElement; "reset-view": HTMLButtonElement;
}
export interface MapControllerOptions {
  state: MapState; element<K extends keyof MapElements>(id: K): MapElements[K];
  document: Document; window: Window;
  fetchGraph(url: string, signal: AbortSignal): Promise<MemoryGraphResult>;
  searchNotes(query: string, signal: AbortSignal): Promise<{ files: string[]; warnings: string[] }>;
  setStatus(text: string, isError?: boolean, errorText?: string): void;
  onReady(ready: boolean): void; openNode(node: MemoryGraphNode): void;
}
export function createMapController(options: MapControllerOptions) {
  const { state, element: $, document, window } = options;
  let filterTimer: number | null = null;
  let requestedUrl: string | null = null;
  let loadedUrl: string | null = null;
  let request: AbortController | null = null;
  function cancelRequest() {
    state.graphToken++;
    request?.abort();
    request = null;
    $("reload").disabled = false;
  }
  function cancelFilterTimer() {
    if (filterTimer !== null) window.clearTimeout(filterTimer);
    filterTimer = null;
  }

  function queueFilter(input: HTMLInputElement) {
    cancelFilterTimer();
    cancelRequest();
    requestedUrl = null;
    const length = Array.from(input.value.trim()).length;
    if (length > 0 && length < 3) return;
    filterTimer = window.setTimeout(() => {
      filterTimer = null;
      if (state.view === "graph") void loadGraph();
    }, 250);
  }

  function graphUrl() {
    const params = new URLSearchParams();
    const query = $("query").value.trim();
    const focus = $("focus").value.trim();
    if (query) params.set("query", query);
    if (focus) params.set("focus", focus);
    params.set("includeUnresolved", $("include-unresolved").checked ? "1" : "0");
    params.set("includeOrphans", $("include-orphans").checked ? "1" : "0");
    return HTTP_MEMORY_ROUTES.graphJson + "?" + params.toString();
  }

  function renderGraphNotice(graph: MemoryGraphResult | null) {
    const warnings = [...new Set((Array.isArray(graph?.warnings) ? graph.warnings : [])
      .filter((warning) => typeof warning === "string" && warning.trim()
        && !/^Graph response was limited to \d+ nodes\.$/.test(warning)))];
    const list = $("graph-warnings");
    list.replaceChildren();
    for (const warning of warnings) {
      const row = document.createElement("li");
      row.textContent = warning;
      list.append(row);
    }
    list.hidden = !warnings.length;
    $("graph-notice").hidden = !warnings.length;
  }

  async function loadGraph() {
    cancelFilterTimer();
    cancelRequest();
    requestedUrl = graphUrl();
    const token = ++state.graphToken;
    const controller = new AbortController();
    request = controller;
    renderGraphNotice(null);
    options.setStatus("loading");
    $("ready").hidden = true;
    $("reload").disabled = true;
    try {
      const params = new URLSearchParams(requestedUrl.split("?")[1]);
      const query = params.get("query");
      let warnings: string[] = [];
      if (query) {
        const matches = await options.searchNotes(query, controller.signal);
        if (token !== state.graphToken) return;
        params.delete("query");
        // Keep an explicit empty list: no search hits must never mean the whole map.
        params.set("files", "");
        for (const file of matches.files) params.append("files", file);
        warnings = matches.warnings;
      }
      const payload = await options.fetchGraph(HTTP_MEMORY_ROUTES.graphJson + "?" + params, controller.signal);
      if (token !== state.graphToken) return;
      if (warnings.length) payload.warnings = [...(payload.warnings ?? []), ...warnings];
      state.graph = payload;
      loadedUrl = requestedUrl;
      renderGraphNotice(payload);
      options.setStatus("loaded");
      if (state.view === "graph") render(payload);
      $("ready").hidden = false;
      options.onReady(true);
    } catch (error) {
      if (token !== state.graphToken) return;
      requestedUrl = null;
      const message = error && typeof error === "object" && "message" in error ? error.message : error;
      options.setStatus("error", true, String(message || error));
      options.onReady(false);
    } finally {
      if (token === state.graphToken) { request = null; $("reload").disabled = false; }
    }
  }

  function render(graph: MemoryGraphResult, preserveView = false) {
    const svg = $("graph");
    const viewport = $("viewport");
    $("graph-node-count").textContent = String(graph.nodes.filter((node) => node.nodeKind === "document").length);
    $("graph-edge-count").textContent = String(graph.edges.length);
    $("graph-empty").hidden = graph.nodes.length > 0;
    $("graph-empty").textContent = $("query").value.trim() || $("focus").value.trim() || !$("include-orphans").checked || !$("include-unresolved").checked
      ? "No notes match these filters. Try clearing them."
      : "Your map starts with a note. Choose New note to get started.";
    const restoreFocus = preserveView && viewport.contains(document.activeElement);
    const focusedId = restoreFocus ? document.activeElement?.getAttribute("data-node-id") ?? null : null;
    viewport.replaceChildren();
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2 || 400;
    const cy = rect.height / 2 || 300;
    const radius = Math.max(72, Math.min(cx, cy) - 88);
    const radiusX = Math.max(32, Math.min(cx - 40, radius * 1.65));
    const radiusY = radius;
    const positions = new Map<string, { x: number; y: number }>();
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
      line.setAttribute("x1", String(a.x)); line.setAttribute("y1", String(a.y)); line.setAttribute("x2", String(b.x)); line.setAttribute("y2", String(b.y));
      const width = Math.min(1 + edge.count, 5);
      line.setAttribute("stroke-width", String(width));
      // A narrow lit rim and opposite shaded rim give each strand a rounded profile.
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let nx = (a.y - b.y) / length, ny = (b.x - a.x) / length;
      if (nx + ny > 0) { nx = -nx; ny = -ny; }
      const shadow = line.cloneNode(false) as SVGLineElement;
      shadow.removeAttribute("data-testid");
      shadow.setAttribute("class", "edge-shadow");
      shadow.setAttribute("aria-hidden", "true");
      shadow.setAttribute("stroke-width", String(width + .8));
      shadow.setAttribute("transform", "translate(" + (-nx * .8) + " " + (-ny * .8) + ")");
      const highlight = line.cloneNode(false) as SVGLineElement;
      highlight.removeAttribute("data-testid");
      highlight.setAttribute("class", "edge-highlight");
      highlight.setAttribute("aria-hidden", "true");
      highlight.setAttribute("stroke-width", String(Math.max(.6, width * .3)));
      highlight.setAttribute("transform", "translate(" + (nx * width * .22) + " " + (ny * width * .22) + ")");
      viewport.append(shadow, line, highlight);
    }
    const labelBoxes: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (const node of orderedNodes) {
      const p = positions.get(node.id)!;
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
      circle.setAttribute("class", "node-core");
      circle.setAttribute("r", String(nodeRadius));
      circle.style.setProperty("--node-fill", nodeColor(node));
      const tone = graphNodeTone(node);
      const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      halo.setAttribute("class", "node-halo");
      halo.setAttribute("r", String(nodeRadius * 3));
      halo.setAttribute("fill", "url(#map-glow-" + tone + ")");
      const sheen = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      sheen.setAttribute("class", "node-sheen");
      sheen.setAttribute("r", String(Math.max(0, nodeRadius - .75)));
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
      g.append(title, halo, circle, sheen, text);
      g.addEventListener("pointerdown", (event) => event.stopPropagation());
      g.addEventListener("click", (event) => { event.stopPropagation(); options.openNode(node); });
      g.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); options.openNode(node); } });
      viewport.append(g);
      // Measure only featured labels; preserve the full accessible title and
      // focus/hover reveal for labels suppressed by density or canvas edges.
      if (featuredNodes.has(node.id)) {
        const box = text.getBBox();
        const bounds = { left: p.x + box.x - 4, right: p.x + box.x + box.width + 4, top: p.y + box.y - 3, bottom: p.y + box.y + box.height + 3 };
        const collides = labelBoxes.some(other => bounds.left < other.right && bounds.right > other.left && bounds.top < other.bottom && bounds.bottom > other.top);
        if (collides || bounds.left < 4 || bounds.right > rect.width - 4) g.classList.remove("show-label");
        else labelBoxes.push(bounds);
      }
    }
    if (!preserveView) { state.pan = { x: 0, y: 0 }; state.scale = 1; }
    updateViewport();
    if (restoreFocus) focusGraphNode(focusedId);
  }

  function focusGraphNode(id: string | null) {
    const node = id && Array.from($("viewport").children).find((element) => element.getAttribute("data-node-id") === id);
    ((node as SVGElement | undefined) || $("query")).focus({ preventScroll: true });
  }

  function nodeColor(node: MemoryGraphNode) { return "var(--node-" + graphNodeTone(node) + ")"; }

  function queueGraphLayout(delay: number, restoreSelection = false) {
    if (!state.graph || state.view !== "graph") return;
    if (state.layoutTimer) window.clearTimeout(state.layoutTimer);
    state.layoutTimer = window.setTimeout(() => {
      state.layoutTimer = null;
      if (state.view !== "graph") return;
      if (state.graph) render(state.graph, true);
      if (restoreSelection) focusGraphNode(state.selected);
    }, delay || 0);
  }

  function suspend() {
    cancelFilterTimer();
    cancelRequest();
    if (state.layoutTimer !== null) window.clearTimeout(state.layoutTimer);
    state.layoutTimer = null;
    state.dragging = null;
    // Preserve the bounded graph packet/camera for Back, but release hidden SVG/listener trees.
    $("viewport").replaceChildren();
  }

  // SVG has no viewBox: its local units match CSS pixels. Compensate pan using
  // the clamped scale ratio so the chosen graph point stays under the anchor.
  function zoomGraph(factor: number, clientX?: number, clientY?: number) {
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

  function onGraphWheel(event: WheelEvent) {
    if (!event.deltaY) return;
    event.preventDefault();
    zoomGraph(event.deltaY < 0 ? 1.1 : .9, event.clientX, event.clientY);
  }

  function updateViewport() { $("viewport").setAttribute("transform", "translate(" + state.pan.x + " " + state.pan.y + ") scale(" + state.scale + ")"); }

  function connect() {
  $("reload").addEventListener("click", loadGraph);
  for (const id of ["query", "focus", "include-unresolved", "include-orphans"] as const) {
    $(id).addEventListener("change", () => {
      cancelFilterTimer();
      if (graphUrl() !== requestedUrl) void loadGraph();
    });
  }
  for (const id of ["query", "focus"] as const) {
    const input = $(id);
    let composing = false;
    input.addEventListener("compositionstart", () => { composing = true; cancelFilterTimer(); cancelRequest(); requestedUrl = null; });
    input.addEventListener("compositionend", () => { composing = false; queueFilter(input); });
    input.addEventListener("input", (event) => {
      if (!composing && !(event as InputEvent).isComposing) queueFilter(input);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !composing && !event.isComposing) {
        event.preventDefault();
        void loadGraph();
      }
    });
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
  }
  function hasCurrentGraph() { return Boolean(state.graph) && loadedUrl === graphUrl(); }
  return { graphUrl, loadGraph, hasCurrentGraph, renderGraphNotice, render, focusGraphNode, queueGraphLayout, suspend, zoomGraph, onGraphWheel, updateViewport, connect };
}
