// THROWAWAY FEASIBILITY ONLY: deliberately not a general Markdown parser.
export type ReferenceRange = { start: number; end: number; title: string };

// Matches the production picker's exact-title safety rules (not graph resolution).
export function safeTitle(title: string): boolean {
  return Boolean(title && title === title.trim() && !/[\[\]\x00-\x1f\x7f|#\\/]/.test(title));
}
function escaped(text: string, offset: number): boolean {
  let slashes = 0;
  while (offset > 0 && text[--offset] === "\\") slashes++;
  return slashes % 2 === 1;
}

// Recognize fence-like text in unsupported containers without trying to parse
// their nesting/lazy continuations. The entire remaining suffix becomes inert;
// guessing where a quoted/list/indented fence ends could activate code examples.
function opaqueFence(line: string): boolean {
  let rest = line.trimStart();
  for (;;) {
    const prefix = rest.match(/^(?:>[ \t]*|(?:[-+*]|\d+[.)])[ \t]+)/);
    if (!prefix) return /^(?:`{3,}|~{3,})/.test(rest);
    rest = rest.slice(prefix[0].length).trimStart();
  }
}

// Offsets are UTF-16, like Lexical selections. Scan context across ALL blocks so
// changing a delimiter also invalidates links in untouched later blocks.
// Fail closed: unmatched backticks suppress the remaining document; unsupported
// container fences suppress through EOF, even after an apparent closing fence.
export function referenceRanges(text: string): ReferenceRange[] {
  const ranges: ReferenceRange[] = [];
  let offset = 0;
  let fence: { char: string; length: number } | null = null;
  let inlineTicks = 0;
  let list = false;
  for (const line of text.split("\n")) {
    const base = offset;
    offset += line.length + 1;
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    // Container fences win over pending inline spans: block boundaries can
    // terminate inline parsing. Also fail closed for an indented fence after
    // a list item rather than guessing list-continuation/dedent semantics.
    if (!fence && ((!marker && opaqueFence(line)) || (marker && list && /^[ \t]+/.test(line)))) break;
    if (!inlineTicks) {
      if (fence) {
        if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && /^ {0,3}(?:`+|~+)[ \t]*$/.test(line)) fence = null;
        continue;
      }
      if (marker) { fence = { char: marker[1][0], length: marker[1].length }; list = false; continue; }
      const bullet = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]/.test(line);
      const indented = /^(?: {4}|\t)/.test(line);
      if (indented && !(list && bullet)) continue;
      if (line.trim()) list = bullet;
    }
    for (let i = 0; i < line.length;) {
      if (line[i] === "`") {
        const length = line.slice(i).match(/^`+/)![0].length;
        // Backslashes inside code do not escape the closing delimiter.
        if (inlineTicks) { if (length === inlineTicks) inlineTicks = 0; }
        else if (!escaped(line, i)) inlineTicks = length;
        i += length;
        continue;
      }
      if (inlineTicks || line[i] !== "[") { i++; continue; }
      // Consume an entire bracket group, never link an inner nested reference.
      const start = i;
      let depth = 0;
      do {
        if (line[i] === "[") depth++;
        if (line[i] === "]") depth--;
        i++;
      } while (i < line.length && depth > 0);
      const group = line.slice(start, i);
      const match = group.match(/^\[\[([^\[\]]+)\]\]$/);
      if (match && !escaped(line, start) && line[start - 1] !== "!" && line[i] !== "]" && safeTitle(match[1])) {
        ranges.push({ start: base + start, end: base + i, title: match[1] });
      } else {
        // Non-reference brackets may contain a code opener, including an
        // unmatched group. Do not forget its state at the next line boundary.
        for (const ticks of group.matchAll(/`+/g)) {
          if (inlineTicks) { if (ticks[0].length === inlineTicks) inlineTicks = 0; }
          else if (!escaped(group, ticks.index)) inlineTicks = ticks[0].length;
        }
      }
      if (depth) break;
    }
  }
  return ranges;
}
