/** Pure browser presentation policy. No simulation, timers or DOM ownership. */
export interface GraphPosition { x: number; y: number }
interface LayoutNode { id: string; degree?: number }
interface LayoutEdge { source: string; target: string }
interface Region { x: number; y: number; width: number; height: number }

/** Weak components occupy distinct regions; a radial breadth-first tree keeps
 * linked families together. Non-tree edges remain visible evidence. Work is
 * O((V + E) log V), with bounded passes and no all-pairs relaxation. Previously
 * placed surviving identities keep their exact coordinates across filtering. */
export function layoutGraph(
  nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], width: number, height: number,
  previous?: ReadonlyMap<string, GraphPosition>,
): Map<string, GraphPosition> {
  const ordered = [...nodes].sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0) || a.id.localeCompare(b.id));
  const adjacency = new Map(ordered.map(node => [node.id, new Set<string>()]));
  for (const edge of edges) {
    if (edge.source === edge.target || !adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }
  const components: string[][] = [];
  const seen = new Set<string>();
  // Degree/identity ordering is independent of response order.
  const rank = new Map(ordered.map((node, index) => [node.id, index]));
  for (const node of ordered) {
    if (seen.has(node.id)) continue;
    const component = [node.id]; seen.add(node.id);
    for (let index = 0; index < component.length; index++) {
      const neighbors = [...adjacency.get(component[index])!].sort((a, b) => rank.get(a)! - rank.get(b)!);
      for (const neighbor of neighbors) if (!seen.has(neighbor)) { seen.add(neighbor); component.push(neighbor); }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  const regions = new Map<string[], Region>();
  const canvas = { x: 24, y: 24, width: Math.max(48, width - 48), height: Math.max(48, height - 48) };
  // Balanced weighted subdivisions avoid quadratic packing of many isolates.
  const weights = components.map(component => Math.max(3, component.length));
  const prefix = [0]; for (const weight of weights) prefix.push(prefix[prefix.length - 1] + weight);
  const pending = components.length ? [{ start: 0, end: components.length, region: canvas }] : [];
  while (pending.length) {
    const { start, end, region } = pending.pop()!;
    if (end - start === 1) { regions.set(components[start], region); continue; }
    const total = prefix[end] - prefix[start];
    let lo = start + 1, hi = end - 1;
    while (lo < hi) { const middle = (lo + hi) >>> 1; if (prefix[middle] - prefix[start] < total / 2) lo = middle + 1; else hi = middle; }
    let split = lo;
    if (split > start + 1 && Math.abs(prefix[split - 1] - prefix[start] - total / 2) < Math.abs(prefix[split] - prefix[start] - total / 2)) split--;
    const fraction = (prefix[split] - prefix[start]) / total;
    if (region.width >= region.height) {
      const first = region.width * fraction;
      pending.push({ start, end: split, region: { ...region, width: first } }, { start: split, end, region: { ...region, x: region.x + first, width: region.width - first } });
    } else {
      const first = region.height * fraction;
      pending.push({ start, end: split, region: { ...region, height: first } }, { start: split, end, region: { ...region, y: region.y + first, height: region.height - first } });
    }
  }
  const result = new Map<string, GraphPosition>();
  for (const component of components) {
    const region = regions.get(component)!;
    const cx = region.x + region.width / 2, cy = region.y + region.height / 2;
    const root = component[0];
    const children = new Map(component.map(id => [id, [] as string[]]));
    const depths = new Map([[root, 0]]);
    const queue = [root];
    let maxDepth = 0;
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      for (const neighbor of [...adjacency.get(id)!].sort((a, b) => rank.get(a)! - rank.get(b)!)) {
        if (depths.has(neighbor)) continue;
        const depth = depths.get(id)! + 1;
        depths.set(neighbor, depth); maxDepth = Math.max(maxDepth, depth);
        children.get(id)!.push(neighbor); queue.push(neighbor);
      }
    }
    const leaves = new Map<string, number>();
    for (let index = queue.length - 1; index >= 0; index--) {
      const id = queue[index];
      leaves.set(id, Math.max(1, children.get(id)!.reduce((sum, child) => sum + leaves.get(child)!, 0)));
    }
    const wedges = new Map([[root, { start: -Math.PI / 2, size: Math.PI * 2 }]]);
    const rx = Math.max(4, region.width / 2 - 25), ry = Math.max(4, region.height / 2 - 25);
    for (const id of queue) {
      const wedge = wedges.get(id)!;
      const depth = depths.get(id)!;
      const angle = wedge.start + wedge.size / 2;
      const distance = depth / Math.max(1, maxDepth);
      result.set(id, { x: cx + Math.cos(angle) * rx * distance, y: cy + Math.sin(angle) * ry * distance });
      let start = wedge.start;
      for (const child of children.get(id)!) {
        const size = wedge.size * leaves.get(child)! / leaves.get(id)!;
        wedges.set(child, { start, size }); start += size;
      }
    }
  }
  // Reuse valid coordinates, never retaining absent identities in the returned map.
  if (previous) for (const node of ordered) {
    const old = previous.get(node.id);
    if (old && Number.isFinite(old.x) && Number.isFinite(old.y)) result.set(node.id, { ...old });
  }
  return result;
}
