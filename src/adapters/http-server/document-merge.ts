// Conservative three-way draft merge: each side is one changed range against
// the last confirmed body. Broad/multiple edits may require review; never guess
// through overlapping replacements. Code points keep surrogate pairs intact.
export function mergeDocumentEdits(base: string, local: string, remote: string): string | null {
  if (local === remote || remote === base) return local;
  if (local === base) return remote;
  const original = Array.from(base);
  function change(value: string) {
    const next = Array.from(value);
    let start = 0, suffix = 0;
    while (start < original.length && start < next.length && original[start] === next[start]) start++;
    while (suffix < original.length - start && suffix < next.length - start
      && original[original.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
    return { start, end: original.length - suffix, text: next.slice(start, next.length - suffix).join("") };
  }
  const ours = change(local), theirs = change(remote);
  if (ours.start === original.length && theirs.start === original.length) {
    // Both writers appended to the same saved end. Keep both additions as text,
    // with the user's current writing first and a paragraph boundary if needed.
    return base + ours.text + (ours.text.endsWith("\n") || theirs.text.startsWith("\n") ? "" : "\n\n") + theirs.text;
  }
  if (ours.start === theirs.start) return null;
  const [first, second] = ours.start < theirs.start ? [ours, theirs] : [theirs, ours];
  if (first.end > second.start) return null;
  // Even disjoint character edits in one source line can change the same word
  // or sentence. Resolve those explicitly; independent paragraph appends remain
  // safe, including an append beside a change to the old final paragraph.
  const separateLines = original.slice(first.end, second.start).includes("\n") || original[first.end - 1] === "\n";
  const finalParagraph = second.start === original.length && second.end === second.start
    && (second.text.startsWith("\n") || original.at(-1) === "\n");
  if (!separateLines && !finalParagraph) return null;
  return original.slice(0, first.start).join("") + first.text
    + original.slice(first.end, second.start).join("") + second.text + original.slice(second.end).join("");
}
