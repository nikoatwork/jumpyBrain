/** Derived display text only. Deliberately conservative; never rewrites source/evidence.
 * Shared by the browser and the server attention packet so both produce the same line. */
export function readablePreview(input: string, title = "", maximum = 280): string {
  let source = input.slice(0, 16384).replace(/\r\n/g, "\n");
  if (source.startsWith("---\n")) {
    const end = source.indexOf("\n---", 4);
    if (end >= 0) source = source.slice(end + 4);
  }
  let fence = "";
  const lines: string[] = [];
  for (let line of source.split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (marker && (!fence || (marker[1]![0] === fence[0] && marker[1]!.length >= fence.length))) { fence = fence ? "" : marker[1]!; continue; }
    if (!fence) {
      if (/^\s*(?:([-*_])(?:\s*\1){2,}|={3,})\s*$/.test(line) || /^\s{0,3}\[[^\]]+\]:\s+/.test(line)) continue;
      line = line.replace(/^\s{0,3}(?:>\s*)+/, "").replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "")
        .replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "");
      line = line.replace(/\[\[([^\]\n]+)\]\]/g, "$1").replace(/!?\[([^\]\n]+)\]\([^\n)]*\)/g, "$1").replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, "$1")
        .replace(/(`+)([^`\n]+)\1/g, "$2").replace(/(\*\*|__|~~)(\S(?:.*?\S)?)\1/g, "$2")
        .replace(/(?<!\w)([*_])(\S(?:.*?\S)?)\1(?!\w)/g, "$2").replace(/\\([\\`*{}\[\]()#+.!_>-])/g, "$1");
    }
    const trimmed = line.trim();
    if (!lines.length && title && trimmed.normalize("NFKC").toLocaleLowerCase() === title.normalize("NFKC").trim().toLocaleLowerCase()) continue;
    if (trimmed) lines.push(trimmed);
  }
  let text = lines.join(" ").replace(/\s+/g, " ").trim();
  // Indexed snippets may already have collapsed lines, including the title heading.
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (title) text = text.replace(new RegExp("^" + escapedTitle + "(?=\\s|$)\\s*(?:#{1,6}\\s+)?", "i"), "");
  text = text.replace(/\s+#{1,6}\s+(?=\S)/g, " ");
  return text.length > maximum ? text.slice(0, maximum - 1).trimEnd() + "…" : text;
}
