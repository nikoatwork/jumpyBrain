// Evaluation-only pure policies. No gold, query IDs or expected answers.

export function evidenceContext(passage, content, { markdownStructure, excerptMatchesSource, parseFrontmatter }) {
  const lines = content.split(/\r?\n/u), { bodyStartLine } = parseFrontmatter(content);
  const spans = [];
  const add = (start, end) => {
    while (end >= start && !lines[end]?.trim()) end--;
    while (start <= end && !lines[start]?.trim()) start++;
    if (end < start || (start + 1 >= passage.startLine && end + 1 <= passage.endLine)) return;
    const text = lines.slice(start, end + 1).join('\n').replace(/\s+/gu, ' ').trim();
    if (!text) return;
    // Oversized governing prose remains explicitly omitted; never summarize it.
    if (text.length > 2000) return;
    const span = { startLine: start + 1, endLine: end + 1, text };
    if (!excerptMatchesSource(text, span.startLine, span.endLine, content)) throw new Error('Invalid context citation');
    spans.push(span);
  };
  if (bodyStartLine > 1) add(0, bodyStartLine - 2); // Original identity, not a generated label.
  const structure = markdownStructure(lines, bodyStartLine - 1);
  const ancestors = [];
  for (const [line, level] of structure.headings) {
    if (line >= passage.endLine) break;
    while (ancestors.length && ancestors.at(-1).level >= level) ancestors.pop();
    ancestors.push({ line, level });
  }
  for (const { line } of ancestors) {
    const next = [...structure.headings.keys()].find(n => n > line) ?? lines.length;
    add(line, next - 1); // Heading plus actual governing introductory prose.
  }
  return spans;
}

export function relationshipProjection(documents, { buildCanonicalLinkTargetLookup, resolveCanonicalLinkTarget }) {
  const lookup = buildCanonicalLinkTargetLookup(documents);
  const edges = new Map();
  for (const doc of documents) {
    const targets = new Set();
    for (const field of ['sources', 'supersedes', 'conflicts_with']) {
      const raw = doc.frontmatter[field];
      for (const value of Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []) {
        const target = resolveCanonicalLinkTarget(doc.relativePath, value, 'wiki-link', lookup);
        if (target && target !== doc.relativePath) targets.add(target);
      }
    }
    edges.set(doc.relativePath, [...targets]);
  }
  return edges;
}

export function injectNeighbors(candidates, documents, edges, constrained) {
  if (constrained || !candidates.length) return { candidates, added: [] };
  const ordered = [...candidates].sort((a,b) => b.score - a.score);
  const seeds = [...new Set(ordered.map(c => c.file).filter(Boolean))].slice(0, 3);
  const existing = new Set(ordered.map(c => c.file)), seen = new Set(seeds), added = [];
  // Round-robin bounded unique one-hop targets; cycles/hubs cannot recurse.
  const lists = seeds.map(seed => edges.get(seed) ?? []);
  for (let offset = 0; offset < Math.max(0, ...lists.map(l => l.length)) && seen.size < 9 && added.length < ordered.length; offset++) {
    for (const list of lists) {
      const file = list[offset];
      if (!file || seen.has(file)) continue;
      seen.add(file);
      if (documents.has(file) && !existing.has(file)) added.push({ file, score: 0 });
      if (seen.size >= 9 || added.length >= ordered.length) break;
    }
  }
  return { candidates: [...ordered.slice(0, Math.max(0, ordered.length - added.length)), ...added], added };
}
