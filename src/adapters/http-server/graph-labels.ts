/** Screen-space label placement, independent of SVG and text measurement APIs. */
export interface GraphLabelCandidate {
  id: string; x: number; y: number; radius: number; title: string;
  /** Lower values win. Negative values denote active hover/focus/selection. */
  priority?: number;
}
export interface GraphLabelPlacement {
  id: string; x: number; y: number; anchor: "start" | "end" | "middle";
  text: string; lines: string[]; width: number; height: number;
}
export interface GraphLabelOptions {
  width: number; height: number; scale?: number; pan?: { x: number; y: number };
  /** Measure at the renderer's fixed 12 CSS-pixel font; callers may cache it. */
  measure(text: string): number;
}
interface Box { left: number; right: number; top: number; bottom: number; id: string }
const CELL = 48, LINE = 14, PAD = 3;
class BoxGrid {
  private cells = new Map<string, Box[]>();
  private keys(box: Box, visit: (key: string) => void) {
    for (let x = Math.floor(box.left / CELL); x <= Math.floor(box.right / CELL); x++)
      for (let y = Math.floor(box.top / CELL); y <= Math.floor(box.bottom / CELL); y++) visit(x + ":" + y);
  }
  add(box: Box) { this.keys(box, key => { const cell = this.cells.get(key); if (cell) cell.push(box); else this.cells.set(key, [box]); }); }
  collides(box: Box, ignoreOwn = false) {
    let found = false;
    this.keys(box, key => {
      if (found) return;
      for (const other of this.cells.get(key) ?? []) {
        if (ignoreOwn && other.id === box.id) continue;
        if (box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top) { found = true; break; }
      }
    });
    return found;
  }
}
function shorten(text: string, width: number, measure: (text: string) => number) {
  if (measure(text) <= width) return text;
  const characters = Array.from(text);
  let low = 0, high = characters.length;
  while (low < high) { const middle = Math.ceil((low + high) / 2); if (measure(characters.slice(0, middle).join("") + "…") <= width) low = middle; else high = middle - 1; }
  return characters.slice(0, low).join("") + "…";
}
function wrap(title: string, width: number, measure: (text: string) => number): string[] {
  if (measure(title) <= width) return [title];
  const words = title.split(/\s+/);
  if (words.length < 2) return [shorten(title, width, measure)];
  let first = words.shift()!;
  while (words.length && measure(first + " " + words[0]) <= width) first += " " + words.shift();
  if (measure(first) > width) return [shorten(title, width, measure)];
  return [first, shorten(words.join(" "), width, measure)];
}
/** Returns SCREEN coordinates, x matching text-anchor and y the first baseline.
 * Text stays 12px with 14px line-height regardless of camera zoom. Collision
 * boxes include node targets and all accepted labels. Only visible candidates
 * are measured; an area-derived work ceiling bounds crowded overviews. */
export function placeGraphLabels(candidates: readonly GraphLabelCandidate[], options: GraphLabelOptions): GraphLabelPlacement[] {
  const { width, height, measure } = options;
  if (width < 32 || height < 32) return [];
  const scale = options.scale ?? 1, pan = options.pan ?? { x: 0, y: 0 };
  const visible = candidates.map(candidate => ({ ...candidate, x: candidate.x * scale + pan.x, y: candidate.y * scale + pan.y, radius: Math.min(64, Math.max(5, candidate.radius * scale)) }))
    .filter(candidate => candidate.title && candidate.x >= 0 && candidate.x <= width && candidate.y >= 0 && candidate.y <= height)
    .sort((a, b) => (a.priority ?? 1e6) - (b.priority ?? 1e6) || a.id.localeCompare(b.id));
  const nodes = new BoxGrid(), labels = new BoxGrid();
  for (const node of visible) nodes.add({ id: node.id, left: node.x - node.radius, right: node.x + node.radius, top: node.y - node.radius, bottom: node.y + node.radius });
  const maxLabels = Math.max(12, Math.floor(width * height / 2200));
  const maxCandidates = Math.max(200, Math.min(10000, Math.ceil(width * height / 300)));
  const placements: GraphLabelPlacement[] = [];
  const maxWidth = Math.min(220, Math.max(72, width * .42));
  for (const candidate of visible.slice(0, maxCandidates)) {
    if (placements.length >= maxLabels) break;
    // Try readable wrapped text first, then shorter single-line alternatives.
    const variants = [wrap(candidate.title, maxWidth, measure), [shorten(candidate.title, Math.min(maxWidth, 110), measure)]];
    let placed = false;
    for (const lines of variants) {
      const textWidth = Math.max(...lines.map(measure)), textHeight = lines.length * LINE;
      const gap = candidate.radius + 7;
      const anchors = [
        { x: candidate.x + gap, y: candidate.y - textHeight / 2, anchor: "start" as const },
        { x: candidate.x - gap - textWidth, y: candidate.y - textHeight / 2, anchor: "end" as const },
        { x: candidate.x - textWidth / 2, y: candidate.y - gap - textHeight, anchor: "middle" as const },
        { x: candidate.x - textWidth / 2, y: candidate.y + gap, anchor: "middle" as const },
      ];
      for (const anchor of anchors) {
        const box = { id: candidate.id, left: anchor.x - PAD, right: anchor.x + textWidth + PAD, top: anchor.y - PAD, bottom: anchor.y + textHeight + PAD };
        if (box.left < 4 || box.right > width - 4 || box.top < 4 || box.bottom > height - 4 || labels.collides(box)) continue;
        // Active labels can cross unrelated nodes in a dense cluster so keyboard
        // focus is never made unidentifiable by an otherwise solid node cloud.
        if ((candidate.priority ?? 0) >= 0 && nodes.collides(box, true)) continue;
        labels.add(box);
        placements.push({ id: candidate.id, x: anchor.x + (anchor.anchor === "end" ? textWidth : anchor.anchor === "middle" ? textWidth / 2 : 0), y: anchor.y + 11, anchor: anchor.anchor, text: lines.join(" "), lines, width: textWidth, height: textHeight });
        placed = true; break;
      }
      if (placed) break;
    }
  }
  return placements;
}
