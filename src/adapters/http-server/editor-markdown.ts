// Conservative editor grammar. Canonical Markdown policy stays in core.
export function inlineCodeRanges(text: string) {
  const runs = Array.from(text.matchAll(/`+/g));
  const ranges: { start: number; end: number }[] = [];
  for (let i = 0; i < runs.length; i++) {
    const open = runs[i];
    let slashes = 0;
    for (let p = open.index! - 1; p >= 0 && text[p] === "\\"; p--) slashes++;
    if (slashes % 2) continue;
    let close = -1;
    for (let j = i + 1; j < runs.length; j++) if (runs[j][0].length === open[0].length) { close = j; break; }
    if (close < 0) continue;
    ranges.push({ start: open.index!, end: runs[close].index! + runs[close][0].length });
    i = close;
  }
  return ranges;
}

export function taskMarker(line: string, previousIndent: number | null) {
  const match = line.match(/^( {0,6})- \[([ xX])\] (.*)$/);
  if (!match || match[1].length % 2 || (match[1].length && (previousIndent === null || match[1].length > previousIndent + 2))) return null;
  return { indent: match[1].length, checked: match[2] !== " ", label: match[3] };
}

// Only closed, column-zero backtick fences with a simple language token become
// code blocks. Tilde, container, indented, attributes and unclosed forms stay literal.
export function codeFence(lines: string[], start: number) {
  const open = lines[start].match(/^(`{3,})([A-Za-z0-9_+.#-]*)[ \t]*$/);
  if (!open) return null;
  for (let end = start + 1; end < lines.length; end++) {
    const close = lines[end].match(/^(`{3,})[ \t]*$/);
    if (close && close[1].length >= open[1].length) return { end, language: open[2], text: lines.slice(start + 1, end).join("\n") };
  }
  return null;
}

export function exportCodeFence(text: string, language: string) {
  let longest = 2;
  for (const match of text.matchAll(/^`+/gm)) longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(longest + 1);
  return fence + language + "\n" + text + "\n" + fence;
}

// Deliberately bounded pipe tables. Escaped pipes and matching inline-code
// spans do not split cells. Unequal widths/ambiguous forms stay literal source.
export function tableCells(line: string): string[] | null {
  if (!line.trim().includes("|") || /^(?: {4}| *\t)/.test(line)) return null;
  const code = inlineCodeRanges(line);
  const cuts: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "|" || code.some((range) => i >= range.start && i < range.end)) continue;
    let escapes = 0;
    for (let j = i - 1; j >= 0 && line[j] === "\\"; j--) escapes++;
    if (!(escapes % 2)) cuts.push(i);
  }
  if (!cuts.length) return null;
  const cells: string[] = [];
  let start = 0;
  for (const cut of cuts) { cells.push(line.slice(start, cut).trim()); start = cut + 1; }
  cells.push(line.slice(start).trim());
  if (!cells[0] && line.trimStart().startsWith("|")) cells.shift();
  if (!cells.at(-1) && line.trimEnd().endsWith("|")) cells.pop();
  return cells.length >= 2 ? cells : null;
}

export function markdownTable(lines: string[], start = 0) {
  if (/^ {0,3}(?:>|[-+*]\s|\d+[.)]\s|#{1,6}\s)/.test(lines[start] ?? "")) return null;
  const header = tableCells(lines[start] ?? ""), divider = tableCells(lines[start + 1] ?? "");
  if (!header || !divider || header.length !== divider.length || !divider.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
  const rows = [header];
  let end = start + 1;
  for (let i = start + 2; i < lines.length; i++) {
    const cells = tableCells(lines[i]);
    if (!cells) { if (/^\s*\|/.test(lines[i])) return null; break; }
    if (cells.length !== header.length) return null;
    rows.push(cells); end = i;
  }
  const align = divider.map((cell) => cell.startsWith(":") ? cell.endsWith(":") ? "center" : "left" : cell.endsWith(":") ? "right" : "left");
  return { end, rows, align };
}
