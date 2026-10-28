// Browser-only map presentation; Markdown/search semantics remain in app operations.
import type { MemoryGraphNode, MemoryGraphResult } from "../../types.js";
import { HTTP_MEMORY_ROUTES } from "../http-protocol.js";
import { layoutGraph, type GraphPosition } from "./graph-layout.js";
import { graphLexicalMatch } from "./graph-search.js";
import { placeGraphLabels } from "./graph-labels.js";
const GRAPH_DOCUMENT_TONES = [
  "page",
  "decision",
  "finding",
  "preference",
  "session",
  "note",
] as const;
export const GRAPH_NODE_TONES = [
  ...GRAPH_DOCUMENT_TONES,
  "unresolved",
] as const;
export function graphNodeTone(
  node: Pick<MemoryGraphNode, "nodeKind" | "type">,
): string {
  return node.nodeKind === "unresolved"
    ? "unresolved"
    : GRAPH_DOCUMENT_TONES.some((type) => type === node.type)
      ? node.type!
      : "note";
}
export interface MapState {
  view: string;
  graph: MemoryGraphResult | null;
  graphToken: number;
  selected: string | null;
  pan: { x: number; y: number };
  scale: number;
  layoutTimer: number | null;
  dragging: { x: number; y: number; pan: { x: number; y: number } } | null;
}
interface MapElements {
  graph: SVGSVGElement;
  viewport: SVGGElement;
  "graph-canvas": HTMLCanvasElement;
  query: HTMLInputElement;
  focus: HTMLInputElement;
  "include-unresolved": HTMLInputElement;
  "include-orphans": HTMLInputElement;
  reload: HTMLButtonElement;
  ready: HTMLElement;
  "graph-node-count": HTMLElement;
  "graph-edge-count": HTMLElement;
  "graph-empty": HTMLElement;
  "zoom-in": HTMLButtonElement;
  "zoom-out": HTMLButtonElement;
  "reset-view": HTMLButtonElement;
}
export interface MapControllerOptions {
  state: MapState;
  element<K extends keyof MapElements>(id: K): MapElements[K];
  document: Document;
  window: Window;
  scope?(): string;
  fetchGraph(url: string, signal: AbortSignal): Promise<MemoryGraphResult>;
  searchNotes(
    query: string,
    signal: AbortSignal,
  ): Promise<{ files: string[]; warnings: string[]; updating?: boolean; details?: string[] }>;
  onWarnings?(warnings: string[]): void;
  setStatus(text: string, isError?: boolean, errorText?: string): void;
  onReady(ready: boolean): void;
  openNode(node: MemoryGraphNode): void;
}
const SVG = "http://www.w3.org/2000/svg";
const OVERVIEW_LIMIT = 10000,
  EDGE_LIMIT = 20000,
  SVG_LIMIT = 250;
export function createMapController(options: MapControllerOptions) {
  const { state, element: $, document, window } = options;
  let filterTimer: number | null = null,
    frame: number | null = null;
  let requestedUrl: string | null = null,
    loadedUrl: string | null = null;
  let request: AbortController | null = null;
  let scope = options.scope?.() ?? "",
    overview: MemoryGraphResult | null = null;
  let overviewPositions = new Map<string, GraphPosition>();
  let topicActive = false;
  let positions = new Map<string, GraphPosition>(),
    nodes = new Map<string, MemoryGraphNode>();
  const nodeElements = new Map<string, SVGGElement>(),
    edgeElements = new Map<string, SVGLineElement>();
  const labelElements = new Map<string, SVGTextElement>(),
    measurements = new Map<string, number>();
  let labelLayer: SVGGElement | null = null,
    dense = false,
    hovered: string | null = null,
    focused: string | null = null;
  let current: MemoryGraphResult | null = null,
    width = 0,
    height = 0,
    manualCamera = false,
    layoutWidth = 0,
    layoutHeight = 0;
  let provisional = false,
    down: { x: number; y: number; pointerId: number } | null = null;
  let hitGrid = new Map<string, string[]>();
  let measureContext: CanvasRenderingContext2D | null = null;
  let tones = new Map<string, MemoryGraphNode[]>();
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
  function clearScene() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    $("viewport").replaceChildren();
    nodeElements.clear();
    edgeElements.clear();
    labelElements.clear();
    labelLayer = null;
    const canvas = $("graph-canvas");
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    hitGrid.clear();
    down = null;
    current = null;
  }
  function reset() {
    cancelFilterTimer();
    cancelRequest();
    clearScene();
    overview = null;
    state.graph = null;
    positions.clear();
    overviewPositions.clear();
    topicActive = false;
    measurements.clear();
    nodes.clear();
    tones.clear();
    loadedUrl = requestedUrl = null;
    hovered = focused = null;
    manualCamera = false;
    state.pan = { x: 0, y: 0 };
    state.scale = 1;
  }
  function invalidateTopology() {
    overview = null;
    loadedUrl = null;
  }
  function checkScope() {
    const next = options.scope?.() ?? "";
    if (next !== scope) {
      scope = next;
      reset();
    }
  }
  function graphUrl() {
    checkScope();
    const params = new URLSearchParams();
    const query = $("query").value.trim(),
      focus = $("focus").value.trim();
    if (query) params.set("query", query);
    if (focus) params.set("focus", focus);
    params.set(
      "includeUnresolved",
      $("include-unresolved").checked ? "1" : "0",
    );
    params.set("includeOrphans", $("include-orphans").checked ? "1" : "0");
    params.set("includeSnippets", "0");
    params.set("limit", String(OVERVIEW_LIMIT));
    params.set("edgeLimit", String(EDGE_LIMIT));
    return HTTP_MEMORY_ROUTES.graphJson + "?" + params;
  }
  function renderGraphNotice(graph: MemoryGraphResult | null) {
    const warnings = [
      ...new Set(
        (Array.isArray(graph?.warnings) ? graph.warnings : []).filter(
          (warning) =>
            typeof warning === "string" &&
            warning.trim() &&
            !/^Graph response was limited to \d+ nodes\.$/.test(warning) &&
            !warning.startsWith("Graph response reached its ") &&
            warning !== "Search results may be incomplete." &&
            warning !==
              "Search index is out of date. Refresh the search index to include recent edits.",
        ),
      ),
    ];
    options.onWarnings?.(warnings);
    // Scope/cap details stay on demand, with no extra persistent chrome.
    const truncation = graph?.truncation;
    $("reload").title =
      truncation && Object.values(truncation).some(Boolean)
        ? "This view reached its display budget. Narrow the search to explore other notes. Refresh view."
        : "Refresh notes and connections";
  }
  function projectTitles() {
    if (!state.graph) overview = null;
    if (!overview || state.view !== "graph" || $("focus").value.trim()) return;
    const query = $("query").value.normalize("NFKC").trim().toLocaleLowerCase();
    if (!query) {
      if (!manualCamera) {
        state.pan = { x: 0, y: 0 };
        state.scale = 1;
      }
      render(overview, true);
      provisional = true;
      return;
    }
    const direct = overview.nodes
      .filter(
        (node) =>
          node.nodeKind === "document" &&
          graphLexicalMatch(query, node.title),
      );
    if (!direct.length) {
      provisional = true;
      $("graph-empty").hidden = true;
      return;
    }
    const ids = new Set(direct.map((node) => node.id));
    const keep = ids;
    let projectedNodes = overview.nodes.filter(
      (node) =>
        keep.has(node.id) &&
        ($("include-unresolved").checked || node.nodeKind === "document"),
    );
    let retained = new Set(projectedNodes.map((node) => node.id));
    const projectedEdges = overview.edges.filter(
      (edge) => retained.has(edge.source) && retained.has(edge.target),
    );
    if (!$("include-orphans").checked) {
      const connected = new Set(
        projectedEdges.flatMap((edge) => [edge.source, edge.target]),
      );
      projectedNodes = projectedNodes.filter((node) => connected.has(node.id));
    }
    retained = new Set(projectedNodes.map((node) => node.id));
    render(
      {
        ...overview,
        nodes: projectedNodes.map((node) => ({
          ...node,
          match: ids.has(node.id) ? "direct" : "context",
        })),
        edges: projectedEdges.filter(
          (edge) => retained.has(edge.source) && retained.has(edge.target),
        ),
      },
      true,
    );
    $("graph-empty").hidden = true;
    provisional = true;
  }
  function queueFilter(input: HTMLInputElement) {
    cancelFilterTimer();
    cancelRequest();
    requestedUrl = null;
    checkScope();
    if (input === $("query")) {
      if (!input.value.trim() && !manualCamera) {
        state.pan = { x: 0, y: 0 }; state.scale = 1;
      }
      projectTitles();
    }
    $("graph").setAttribute("aria-busy", "true");
    filterTimer = window.setTimeout(() => {
      filterTimer = null;
      if (state.view === "graph") void loadGraph();
    }, 250);
  }
  async function loadGraph() {
    cancelFilterTimer();
    checkScope();
    if (!state.graph) overview = null;
    cancelRequest();
    requestedUrl = graphUrl();
    const token = ++state.graphToken,
      controller = new AbortController();
    request = controller;
    renderGraphNotice(null);
    $("ready").hidden = true;
    $("reload").disabled = true;
    $("graph").setAttribute("aria-busy", "true");
    // Delay visible feedback so ordinary fast requests keep the canvas quiet.
    const pending = window.setTimeout(() => {
      if (token === state.graphToken) options.setStatus("Updating map…");
    }, 600);
    try {
      const params = new URLSearchParams(requestedUrl.split("?")[1]),
        query = params.get("query");
      let warnings: string[] = [], details: string[] = [];
      if (query) {
        const matches = await options.searchNotes(query, controller.signal);
        if (token !== state.graphToken) return;
        params.delete("query");
        params.set("seeds", "");
        for (const file of matches.files)
          params.append("seeds", file);
        params.set("neighborLimit", "0");
        warnings = matches.warnings;
        details = matches.details ?? [];
      }
      const payload = await options.fetchGraph(
        HTTP_MEMORY_ROUTES.graphJson + "?" + params,
        controller.signal,
      );
      if (token !== state.graphToken) return;
      if (warnings.length)
        payload.warnings = [...(payload.warnings ?? []), ...warnings];
      if (
        !query &&
        !params.get("focus") &&
        params.get("includeOrphans") === "1" &&
        params.get("includeUnresolved") === "1"
      )
        overview = payload;
      state.graph = payload;
      loadedUrl = requestedUrl;
      provisional = false;
      renderGraphNotice(payload);
      if (details.length) $("reload").title += " Search details: " + details.join(". ");
      options.setStatus("loaded");
      $("reload").textContent = "Refresh";
      if (state.view === "graph") render(payload, true);
      $("ready").hidden = false;
      options.onReady(true);
    } catch (error) {
      if (token !== state.graphToken) return;
      requestedUrl = null;
      loadedUrl = null;
      // A provisional title projection is never presented as a confirmed empty/topic result.
      if (provisional) {
        clearScene();
        $("graph-empty").hidden = true;
        provisional = false;
      }
      options.setStatus(
        "error",
        true,
        "Couldn’t load this view. Retry with Refresh.",
      );
      $("reload").textContent = "Retry";
      options.onReady(false);
    } finally {
      window.clearTimeout(pending);
      if (token === state.graphToken) {
        request = null;
        $("reload").disabled = false;
        $("graph").setAttribute("aria-busy", "false");
      }
    }
  }
  function circleRadius(node: MemoryGraphNode) {
    return dense
      ? 2.5 + Math.min(node.degree, 12) * 0.25
      : 6 + Math.min(node.degree, 12);
  }
  function render(graph: MemoryGraphResult, preserveView = false) {
    const svg = $("graph"),
      viewport = $("viewport"),
      rect = svg.getBoundingClientRect();
    width = rect.width || 800;
    height = rect.height || 600;
    $("graph-node-count").textContent = String(
      graph.nodes.filter((node) => node.nodeKind === "document").length,
    );
    $("graph-edge-count").textContent = String(graph.edges.length);
    $("graph-empty").hidden = graph.nodes.length > 0;
    $("graph-empty").textContent =
      $("query").value.trim() || $("focus").value.trim()
        ? "No notes match these filters. Try clearing them."
        : "Your map starts with a note. Choose New note to get started.";
    const nextDense = graph.nodes.length > SVG_LIMIT;
    if (dense !== nextDense) {
      clearScene();
      dense = nextDense;
    }
    const resized = layoutWidth !== width || layoutHeight !== height;
    const topic = Boolean($("query").value.trim() || $("focus").value.trim());
    if (topic !== topicActive) {
      if (topic) {
        overviewPositions = positions;
        // Give a small neighborhood its own readable space once, then retain
        // surviving coordinates across subsequent letters within that topic.
        if (!manualCamera) positions = new Map();
      } else {
        positions = overviewPositions;
        if (!manualCamera) { state.pan = {x:0,y:0}; state.scale = 1; }
      }
      topicActive = topic;
    }
    if (!positions.size || resized) {
      positions = layoutGraph(graph.nodes, graph.edges, width, height);
      layoutWidth = width; layoutHeight = height;
      if (!topic) overviewPositions = positions;
    } else if (graph.nodes.some(node => !positions.has(node.id))) {
      const nextPositions = layoutGraph(graph.nodes, graph.edges, width, height, positions);
      for (const [id, p] of nextPositions) positions.set(id, p);
      if (positions.size > (topic ? 240 : OVERVIEW_LIMIT + 120)) positions = nextPositions;
    }
    nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    current = graph;
    tones = new Map(
      GRAPH_NODE_TONES.map((tone) => [tone, [] as MemoryGraphNode[]]),
    );
    for (const node of graph.nodes) tones.get(graphNodeTone(node))!.push(node);
    if (!preserveView) {
      manualCamera = false;
      state.scale = 1;
      state.pan = { x: 0, y: 0 };
    }
    if (
      graph.nodes.length &&
      graph.nodes.some((node) => node.match === "direct") &&
      !manualCamera
    )
      fitNodes(graph.nodes);
    if (!labelLayer) {
      labelLayer = document.createElementNS(SVG, "g");
      labelLayer.setAttribute("class", "graph-labels");
      viewport.append(labelLayer);
    }
    const canvas = $("graph-canvas");
    canvas.hidden = !dense;
    if (!dense) {
      const edgeIds = new Set(graph.edges.map((edge) => edge.id));
      for (const [id, line] of edgeElements)
        if (!edgeIds.has(id)) {
          line.remove();
          edgeElements.delete(id);
        }
      for (const edge of graph.edges) {
        let line = edgeElements.get(edge.id);
        if (!line) {
          line = document.createElementNS(SVG, "line");
          line.setAttribute("data-testid", "graph-edge");
          viewport.insertBefore(line, viewport.firstChild);
          edgeElements.set(edge.id, line);
        }
        const a = positions.get(edge.source),
          b = positions.get(edge.target);
        if (!a || !b) continue;
        line.setAttribute("class", "edge " + edge.kind);
        line.setAttribute("x1", String(a.x));
        line.setAttribute("y1", String(a.y));
        line.setAttribute("x2", String(b.x));
        line.setAttribute("y2", String(b.y));
        line.setAttribute("stroke-width", String(Math.min(1 + edge.count, 4)));
      }
      for (const [id, g] of nodeElements)
        if (!nodes.has(id)) {
          g.remove();
          nodeElements.delete(id);
        }
      for (const node of graph.nodes) ensureNode(node);
    } else {
      for (const g of nodeElements.values()) g.remove();
      nodeElements.clear();
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        1.5,
        Math.sqrt(4_000_000 / (width * height)),
      );
      if (
        canvas.width !== Math.ceil(width * dpr) ||
        canvas.height !== Math.ceil(height * dpr)
      ) {
        canvas.width = Math.ceil(width * dpr);
        canvas.height = Math.ceil(height * dpr);
      }
    }
    hitGrid.clear();
    for (const node of graph.nodes) {
      const p = positions.get(node.id)!;
      const key = Math.floor(p.x / 24) + ":" + Math.floor(p.y / 24);
      const cell = hitGrid.get(key);
      if (cell) cell.push(node.id);
      else hitGrid.set(key, [node.id]);
    }
    updateViewport();
  }
  function ensureNode(node: MemoryGraphNode) {
    let g = nodeElements.get(node.id);
    if (!g) {
      g = document.createElementNS(SVG, "g");
      g.setAttribute("data-testid", "graph-node");
      g.setAttribute("data-node-id", node.id);
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      const title = document.createElementNS(SVG, "title"),
        circle = document.createElementNS(SVG, "circle");
      circle.setAttribute("class", "node-core");
      g.append(title, circle);
      $("viewport").insertBefore(g, labelLayer);
      nodeElements.set(node.id, g);
    }
    const p = positions.get(node.id)!;
    g.setAttribute(
      "class",
      "node " +
        node.nodeKind +
        (node.match ? " match-" + node.match : "") +
        (state.selected === node.id ? " selected" : ""),
    );
    g.setAttribute("transform", "translate(" + p.x + " " + p.y + ")");
    g.setAttribute(
      "aria-label",
      node.title +
        ", " +
        (node.nodeKind === "unresolved" ? "unresolved link" : "memory note"),
    );
    g.querySelector("title")!.textContent = node.title;
    const circle = g.querySelector("circle")!;
    circle.setAttribute("r", String(circleRadius(node)));
    circle.style.setProperty(
      "--node-fill",
      "var(--node-" + graphNodeTone(node) + ")",
    );
    return g;
  }
  function fitNodes(list: MemoryGraphNode[]) {
    const ps = list.map((node) => positions.get(node.id)!).filter(Boolean);
    if (!ps.length) return;
    const left = Math.min(...ps.map((p) => p.x)),
      right = Math.max(...ps.map((p) => p.x)),
      top = Math.min(...ps.map((p) => p.y)),
      bottom = Math.max(...ps.map((p) => p.y));
    const scale = Math.min(
      2.5,
      Math.max(
        0.2,
        Math.min(
          (width - 100) / Math.max(100, right - left),
          (height - 90) / Math.max(100, bottom - top),
        ),
      ),
    );
    state.scale = scale;
    state.pan = {
      x: width / 2 - ((left + right) / 2) * scale,
      y: height / 2 - ((top + bottom) / 2) * scale,
    };
  }
  function paint() {
    frame = null;
    if (state.view !== "graph" || !current) return;
    const canvas = $("graph-canvas"),
      ctx = dense ? canvas.getContext("2d") : null;
    const active = hovered ?? focused;
    for (const edge of current.edges) {
      const line = edgeElements.get(edge.id);
      if (line)
        line.style.opacity = active
          ? edge.source === active || edge.target === active
            ? "1"
            : ".12"
          : "1";
    }
    const style = window.getComputedStyle(document.documentElement);
    const color = (key: string) => style.getPropertyValue(key).trim();
    if (ctx) {
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        1.5,
        Math.sqrt(4_000_000 / (width * height)),
      );
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.translate(state.pan.x, state.pan.y);
      ctx.scale(state.scale, state.scale);
      ctx.strokeStyle = color("--edge");
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = 1 / state.scale;
      ctx.beginPath();
      for (const edge of current.edges) {
        const a = positions.get(edge.source),
          b = positions.get(edge.target);
        if (a && b) {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
      }
      ctx.stroke();
      if (active) {
        ctx.strokeStyle = color("--focus-ring");
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.5 / state.scale;
        ctx.beginPath();
        for (const edge of current.edges) {
          if (edge.source !== active && edge.target !== active) continue;
          const a = positions.get(edge.source),
            b = positions.get(edge.target);
          if (a && b) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const tone of GRAPH_NODE_TONES) {
        ctx.fillStyle = color("--node-" + tone);
        ctx.beginPath();
        for (const node of tones.get(tone) ?? []) {
          const p = positions.get(node.id)!;
          ctx.moveTo(p.x + circleRadius(node), p.y);
          ctx.arc(p.x, p.y, circleRadius(node), 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
    // One small SVG overlay keeps visible labels and keyboard targets accessible.
    measureContext ??= document.createElement("canvas").getContext("2d");
    const measure = measureContext;
    if (measure) measure.font = "600 12px system-ui";
    const placements = placeGraphLabels(
      current.nodes.map((node, index) => ({
        id: node.id,
        ...positions.get(node.id)!,
        radius: circleRadius(node),
        title: node.title,
        priority:
          node.id === hovered || node.id === focused
            ? -100
            : node.id === state.selected
              ? -90
              : node.match === "direct"
                ? index
                : 10000 - node.degree,
      })),
      {
        width,
        height,
        scale: state.scale,
        pan: state.pan,
        measure: (text) => {
          let value = measurements.get(text);
          if (value === undefined) {
            value = measure?.measureText(text).width ?? text.length * 7;
            if (measurements.size > 12000) measurements.clear();
            measurements.set(text, value);
          }
          return value;
        },
      },
    );
    const visible = new Set(placements.map((p) => p.id));
    for (const [id, text] of labelElements)
      if (!visible.has(id)) {
        text.remove();
        labelElements.delete(id);
      }
    for (const g of nodeElements.values()) g.classList.remove("show-label");
    labelLayer?.setAttribute(
      "transform",
      "translate(" +
        -state.pan.x / state.scale +
        " " +
        -state.pan.y / state.scale +
        ") scale(" +
        1 / state.scale +
        ")",
    );
    for (const placement of placements) {
      let text = labelElements.get(placement.id);
      if (!text) {
        text = document.createElementNS(SVG, "text");
        text.setAttribute("data-node-id", placement.id);
        text.setAttribute("class", "graph-title");
        text.setAttribute("role", "button");
        text.setAttribute("tabindex", "-1");
        labelLayer!.append(text);
        labelElements.set(placement.id, text);
      }
      text.setAttribute("x", String(placement.x));
      text.setAttribute("y", String(placement.y));
      text.setAttribute("text-anchor", placement.anchor);
      text.setAttribute("aria-label", nodes.get(placement.id)!.title);
      text.replaceChildren();
      for (let i = 0; i < placement.lines.length; i++) {
        const span = document.createElementNS(SVG, "tspan");
        span.setAttribute("x", String(placement.x));
        span.setAttribute("dy", i ? "14" : "0");
        span.textContent = placement.lines[i];
        text.append(span);
      }
      if (dense) ensureNode(nodes.get(placement.id)!);
      nodeElements.get(placement.id)?.classList.add("show-label");
    }
    if (focused && nodes.has(focused)) ensureNode(nodes.get(focused)!);
    if (dense)
      for (const [id, g] of nodeElements)
        if (!visible.has(id) && id !== focused) {
          g.remove();
          nodeElements.delete(id);
        }
  }
  function updateViewport() {
    $("viewport").setAttribute(
      "transform",
      "translate(" +
        state.pan.x +
        " " +
        state.pan.y +
        ") scale(" +
        state.scale +
        ")",
    );
    if (
      state.view === "graph" &&
      document.visibilityState !== "hidden" &&
      frame === null &&
      window.requestAnimationFrame
    )
      frame = window.requestAnimationFrame(paint);
  }
  function hit(clientX: number, clientY: number): string | null {
    const rect = $("graph").getBoundingClientRect(),
      x = (clientX - rect.left - state.pan.x) / state.scale,
      y = (clientY - rect.top - state.pan.y) / state.scale;
    let best: string | null = null,
      distance = Infinity;
    const reach = Math.max(24, 14 / state.scale),
      range = Math.ceil(reach / 24);
    for (
      let ix = Math.floor(x / 24) - range;
      ix <= Math.floor(x / 24) + range;
      ix++
    )
      for (
        let iy = Math.floor(y / 24) - range;
        iy <= Math.floor(y / 24) + range;
        iy++
      )
        for (const id of hitGrid.get(ix + ":" + iy) ?? []) {
          const p = positions.get(id)!;
          const d = Math.hypot(p.x - x, p.y - y);
          if (
            d < distance &&
            d <= Math.max(circleRadius(nodes.get(id)!), 10 / state.scale)
          ) {
            distance = d;
            best = id;
          }
        }
    return best;
  }
  function focusGraphNode(id: string | null) {
    focused = id;
    const node = id && nodes.get(id);
    if (node) {
      const p = positions.get(id!)!;
      const x = p.x * state.scale + state.pan.x,
        y = p.y * state.scale + state.pan.y;
      if (x < 20 || x > width - 20 || y < 20 || y > height - 20) {
        state.pan = {
          x: width / 2 - p.x * state.scale,
          y: height / 2 - p.y * state.scale,
        };
        updateViewport();
      }
      ensureNode(node).focus({ preventScroll: true });
    } else $("query").focus({ preventScroll: true });
    updateViewport();
  }
  function queueGraphLayout(delay: number, restoreSelection = false) {
    if (!state.graph || state.view !== "graph") return;
    if (state.layoutTimer) window.clearTimeout(state.layoutTimer);
    state.layoutTimer = window.setTimeout(() => {
      state.layoutTimer = null;
      if (state.view !== "graph") return;
      if (current || state.graph) render(current ?? state.graph!, true);
      if (restoreSelection) focusGraphNode(state.selected);
    }, delay || 0);
  }
  function suspend() {
    options.onWarnings?.([]);
    cancelFilterTimer();
    cancelRequest();
    if (state.layoutTimer !== null) window.clearTimeout(state.layoutTimer);
    state.layoutTimer = null;
    state.dragging = null;
    clearScene();
  }
  function zoomGraph(factor: number, clientX?: number, clientY?: number) {
    const rect = $("graph").getBoundingClientRect(),
      anchor = {
        x: clientX === undefined ? rect.width / 2 : clientX - rect.left,
        y: clientY === undefined ? rect.height / 2 : clientY - rect.top,
      };
    const scale = Math.max(0.2, Math.min(8, state.scale * factor)),
      ratio = scale / state.scale;
    state.pan = {
      x: anchor.x - (anchor.x - state.pan.x) * ratio,
      y: anchor.y - (anchor.y - state.pan.y) * ratio,
    };
    state.scale = scale;
    manualCamera = true;
    updateViewport();
  }
  function onGraphWheel(event: WheelEvent) {
    if (!event.deltaY) return;
    event.preventDefault();
    zoomGraph(event.deltaY < 0 ? 1.1 : 0.9, event.clientX, event.clientY);
  }
  function connect() {
    $("reload").addEventListener("click", loadGraph);
    for (const id of [
      "query",
      "focus",
      "include-unresolved",
      "include-orphans",
    ] as const)
      $(id).addEventListener("change", () => {
        cancelFilterTimer();
        if (graphUrl() !== requestedUrl) void loadGraph();
      });
    for (const id of ["query", "focus"] as const) {
      const input = $(id);
      let composing = false;
      input.addEventListener("compositionstart", () => {
        composing = true;
        cancelFilterTimer();
        cancelRequest();
        requestedUrl = null;
      });
      input.addEventListener("compositionend", () => {
        composing = false;
        queueFilter(input);
      });
      input.addEventListener("input", (event) => {
        if (!composing && !(event as InputEvent).isComposing)
          queueFilter(input);
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
    const identity = (target: EventTarget | null) =>
      (target as Element | null)
        ?.closest?.("[data-node-id]")
        ?.getAttribute("data-node-id") ?? null;
    svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      if (identity(event.target)) return;
      state.dragging = {
        x: event.clientX,
        y: event.clientY,
        pan: { ...state.pan },
      };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      if (down && event.pointerId !== down.pointerId) return;
      if (
        state.dragging &&
        down &&
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4
      ) {
        manualCamera = true;
        state.pan = {
          x: state.dragging.pan.x + event.clientX - state.dragging.x,
          y: state.dragging.pan.y + event.clientY - state.dragging.y,
        };
        updateViewport();
      } else {
        const next =
          identity(event.target) || hit(event.clientX, event.clientY);
        if (next !== hovered) {
          hovered = next;
          updateViewport();
        }
      }
    });
    const cancelPointer = () => {
      state.dragging = null;
      down = null;
    };
    svg.addEventListener("pointercancel", cancelPointer);
    svg.addEventListener("lostpointercapture", cancelPointer);
    svg.addEventListener("pointerup", (event) => {
      if (event.button !== 0 || !down || event.pointerId !== down.pointerId) return;
      const moved =
        down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4;
      const id =
        !moved && (identity(event.target) || hit(event.clientX, event.clientY));
      state.dragging = null;
      down = null;
      if (id && nodes.has(id)) options.openNode(nodes.get(id)!);
    });
    // Click-only activation is used by assistive technology; physical taps open on pointerup.
    svg.addEventListener("click", (event) => {
      if (event.detail !== 0) return;
      const id = identity(event.target);
      if (id && nodes.has(id)) options.openNode(nodes.get(id)!);
    });
    svg.addEventListener("focusin", (event) => {
      focused = identity(event.target);
      updateViewport();
    });
    svg.addEventListener("pointerleave", () => {
      hovered = null;
      updateViewport();
    });
    svg.addEventListener("keydown", (event) => {
      const ids = [...nodes.keys()];
      if (
        ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(
          event.key,
        ) &&
        ids.length
      ) {
        event.preventDefault();
        const index = ids.indexOf(focused ?? identity(event.target) ?? "");
        focusGraphNode(
          ids[
            (index +
              (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) +
              ids.length) %
              ids.length
          ],
        );
      } else if (event.key === "Enter" || event.key === " ") {
        const id = identity(event.target) || focused;
        if (id && nodes.has(id)) {
          event.preventDefault();
          options.openNode(nodes.get(id)!);
        }
      }
    });
    $("zoom-in").addEventListener("click", () => zoomGraph(1.2));
    $("zoom-out").addEventListener("click", () => zoomGraph(1 / 1.2));
    $("reset-view").addEventListener("click", () => {
      manualCamera = false;
      state.pan = { x: 0, y: 0 };
      state.scale = 1;
      if (current?.nodes.some((n) => n.match === "direct"))
        fitNodes(current.nodes);
      updateViewport();
    });
    window.addEventListener("resize", () => queueGraphLayout(80));
    window.addEventListener("pagehide", suspend);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") suspend();
      else if (state.view === "graph") void loadGraph();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === "jumpybrain.theme") updateViewport();
    });
    const Observer = document.defaultView?.MutationObserver;
    if (Observer)
      new Observer(() => updateViewport()).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-palette"],
      });
  }
  function hasCurrentGraph() {
    checkScope();
    return Boolean(state.graph) && loadedUrl === graphUrl();
  }
  return {
    graphUrl,
    loadGraph,
    hasCurrentGraph,
    renderGraphNotice,
    render,
    focusGraphNode,
    queueGraphLayout,
    suspend,
    reset,
    invalidateTopology,
    zoomGraph,
    onGraphWheel,
    updateViewport,
    connect,
  };
}
