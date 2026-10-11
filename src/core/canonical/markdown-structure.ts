/** Shared lightweight Markdown structure: zero-based headings/fences, excluding frontmatter. */
export function markdownStructure(lines: string[], body: number) {
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
