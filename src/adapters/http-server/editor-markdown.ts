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
