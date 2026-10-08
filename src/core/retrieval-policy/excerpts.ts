export interface EvidenceExcerpt {
  snippet: string;
  lineStart: number;
  lineEnd: number;
}

export interface ExcerptOptions {
  /** Canonical 1-based lines; the search window is not a claim citation. */
  bodyStartLine: number;
  lineStart: number;
  lineEnd: number;
  terms?: Array<{ text: string; weight: number }>;
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 1000;
const PARTIAL = " … [partial excerpt; expand source]";
const compact = (text: string) => text.replace(/\s+/gu, " ").trim();

/** Pure, bounded presentation policy. No filesystem, backend, or heading-name assumptions. */
export function selectEvidenceExcerpt(lines: string[], options: ExcerptOptions): EvidenceExcerpt {
  const body = Math.max(0, options.bodyStartLine - 1);
  let maximum = Math.max(100, options.maxChars ?? DEFAULT_MAX_CHARS);
  if (body >= lines.length) return { snippet: "", lineStart: body + 1, lineEnd: body + 1 };
  const start = Math.max(body, Math.min(lines.length - 1, options.lineStart - 1));
  const end = Math.max(start, Math.min(lines.length - 1, options.lineEnd - 1));
  const structure = markdownStructure(lines, body);
  const inputTerms = options.terms ?? [];
  const needles = inputTerms.map((term) => (term.text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" "));
  // Normalize once per line, not once per term. The link-label pattern excludes
  // nested opening brackets so unmatched '[' input cannot trigger quadratic work.
  const matches = lines.slice(start, end + 1).map((line) => {
    const normalized = searchableLine(line);
    return needles.map((needle) => Boolean(needle && normalized.includes(` ${needle} `)));
  });
  const terms = inputTerms.map((term, index) => ({ ...term,
    // Repeated topic/title mentions must not drown out rarer requested details.
    weight: term.weight / Math.sqrt(Math.max(1, matches.filter((row) => row[index]).length)),
  }));
  let center = start;
  let best = -1;
  // Choose inside the backend window, not the document's globally best line:
  // otherwise every hit could collapse onto one section and hide qualifications.
  for (let i = start; i <= end; i++) {
    if (!lines[i].trim()) continue;
    const score = terms.reduce((sum, term, index) => sum + (matches[i - start][index] ? term.weight : 0), 0)
      * (structure.headings.has(i) ? 0.4 : 1);
    if (score > best) { best = score; center = i; }
  }

  let sectionStart = body;
  let sectionEnd = lines.length - 1;
  const ancestors: number[] = [];
  for (const [heading, level] of structure.headings) {
    if (heading <= center) {
      while (ancestors.length && structure.headings.get(ancestors[ancestors.length - 1])! >= level) ancestors.pop();
      ancestors.push(heading);
      sectionStart = heading;
    } else { sectionEnd = heading - 1; break; }
  }
  // Parent prose may govern a subsection (e.g. 'sandbox only'). Keep the
  // contiguous governing span when it fits; otherwise explicitly flag its loss.
  const scopeOmitted = ancestors.length > 1;
  if (scopeOmitted && compact(lines.slice(ancestors[0], sectionEnd + 1).join("\n")).length <= maximum) {
    return excerpt(lines, ancestors[0], sectionEnd);
  }
  const scopeMarker = scopeOmitted ? " [ancestor context omitted; expand source]" : "";
  maximum -= scopeMarker.length;
  const finish = (result: EvidenceExcerpt): EvidenceExcerpt => ({ ...result, snippet: result.snippet + scopeMarker });
  const section = trimmedRange(lines, sectionStart, sectionEnd);
  if (structure.headings.has(sectionStart) && compact(lines.slice(section.start, section.end + 1).join("\n")).length <= maximum) {
    return finish(excerpt(lines, section.start, section.end));
  }

  // Prefer a whole fence, list item (including nested children), or paragraph.
  // Neighbor units are included only whole, within the same heading section.
  const blocks = blockRanges(lines, sectionStart, sectionEnd, structure.fences);
  let index = blocks.findIndex((block) => center >= block.start && center <= block.end);
  if (index < 0) index = Math.max(0, blocks.findIndex((block) => block.start > center));
  let { start: from, end: to } = blocks[index] ?? { start: center, end: center };
  if (compact(lines.slice(from, to + 1).join("\n")).length > maximum) {
    return finish(partialExcerpt(lines, from, to, center, terms, maximum));
  }
  let left = index - 1;
  let right = index + 1;
  // Prefer immediate following qualifications, then preceding context. Do not
  // jump over a block that cannot fit or cross an unrelated heading boundary.
  while (left >= 0 || right < blocks.length) {
    let added = false;
    if (right < blocks.length && blocks[right].start - to <= 2 && compact(lines.slice(from, blocks[right].end + 1).join("\n")).length <= maximum) {
      to = blocks[right++].end; added = true;
    } else right = blocks.length;
    if (left >= 0 && from - blocks[left].end <= 2 && compact(lines.slice(blocks[left].start, to + 1).join("\n")).length <= maximum) {
      from = blocks[left--].start; added = true;
    } else left = -1;
    if (!added) break;
  }
  return finish(excerpt(lines, from, to));
}

function searchableLine(line: string): string {
  // Link labels are evidence; targets remain in returned text but should not
  // crowd out the actual statement simply by repeating query words in URLs.
  const text = line.replace(/!?\[([^\[\]]*)\]\([^\[\]()]*\)/gu, "$1").replace(/https?:\/\/\S+/gu, "").toLowerCase();
  return ` ${(text.match(/[\p{L}\p{N}]+/gu) ?? []).join(" ")} `;
}

function markdownStructure(lines: string[], body: number) {
  const headings = new Map<number, number>();
  const fences = new Map<number, number>();
  let fence: { start: number; marker: string } | undefined;
  for (let i = body; i < lines.length; i++) {
    const marker = lines[i].match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
    if (fence) {
      if (marker?.[0] === fence.marker[0] && marker.length >= fence.marker.length && /^ {0,3}(`+|~+)\s*$/u.test(lines[i])) {
        fences.set(fence.start, i); fence = undefined;
      }
    } else if (marker) fence = { start: i, marker };
    else if (/^ {0,3}#{1,6}(?:\s|$)/u.test(lines[i])) headings.set(i, lines[i].trimStart().match(/^#+/u)![0].length);
    else if (i > body && /^ {0,3}(?:=+|-+)\s*$/u.test(lines[i]) && lines[i - 1].trim() && !/^\s*[-*+]\s/u.test(lines[i - 1])) headings.set(i - 1, lines[i].trimStart()[0] === "=" ? 1 : 2);
  }
  if (fence) fences.set(fence.start, lines.length - 1);
  return { headings, fences };
}

function blockRanges(lines: string[], start: number, end: number, fences: Map<number, number>) {
  const blocks: Array<{ start: number; end: number }> = [];
  for (let i = start; i <= end;) {
    if (!lines[i].trim()) { i++; continue; }
    const from = i;
    const fenceEnd = fences.get(i);
    if (fenceEnd !== undefined) { blocks.push({ start: i, end: Math.min(end, fenceEnd) }); i = fenceEnd + 1; continue; }
    const item = lines[i].match(/^(\s*)(?:[-*+]|\d+[.)])\s/u);
    i++;
    while (i <= end) {
      if (fences.has(i) || /^ {0,3}#{1,6}(?:\s|$)/u.test(lines[i])) break;
      const nextItem = lines[i].match(/^(\s*)(?:[-*+]|\d+[.)])\s/u);
      if (nextItem && (!item || nextItem[1].length <= item[1].length)) break;
      if (!lines[i].trim()) {
        if (!item) break;
        const next = lines[i + 1];
        if (!next || next.search(/\S/u) <= item[1].length) break;
      }
      i++;
    }
    blocks.push(trimmedRange(lines, from, i - 1));
  }
  return blocks;
}

function trimmedRange(lines: string[], start: number, end: number) {
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end].trim()) end--;
  return { start, end };
}

function excerpt(lines: string[], start: number, end: number): EvidenceExcerpt {
  const range = trimmedRange(lines, start, end);
  return { snippet: compact(lines.slice(range.start, range.end + 1).join("\n")), lineStart: range.start + 1, lineEnd: range.end + 1 };
}

function partialExcerpt(lines: string[], from: number, to: number, center: number, terms: NonNullable<ExcerptOptions["terms"]>, maximum: number): EvidenceExcerpt {
  // An oversized unit must advertise incompleteness. Center a single long line
  // around its strongest term rather than returning only the unit's prefix.
  let result = excerpt(lines, center, center);
  if (result.snippet.length > maximum - PARTIAL.length - 2) {
    const text = result.snippet;
    const term = [...terms].sort((a, b) => b.weight - a.weight).find((term) => text.toLowerCase().includes(term.text.toLowerCase()));
    const match = term ? text.toLowerCase().indexOf(term.text.toLowerCase()) : 0;
    const budget = maximum - PARTIAL.length - 2;
    let offset = Math.max(0, match - Math.floor(budget / 3));
    // Prefer whitespace edges, never silently present a mid-word fragment as whole.
    if (offset > 0) { const space = text.indexOf(" ", offset); if (space >= 0 && space < match) offset = space + 1; }
    let finish = Math.min(text.length, offset + budget);
    if (finish < text.length) { const space = text.lastIndexOf(" ", finish); if (space > match) finish = space; }
    return { ...result, snippet: (offset ? "… " : "") + text.slice(offset, finish) + PARTIAL };
  }
  let start = center, end = center;
  while (end < to && compact(lines.slice(start, end + 2).join("\n")).length <= maximum - PARTIAL.length) end++;
  while (start > from && compact(lines.slice(start - 1, end + 1).join("\n")).length <= maximum - PARTIAL.length) start--;
  result = excerpt(lines, start, end);
  return { ...result, snippet: result.snippet + PARTIAL };
}
