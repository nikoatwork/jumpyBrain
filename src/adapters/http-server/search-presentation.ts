import { metadataDate } from "../../core/canonical/metadata-date.js";
import { recognitionDay, matchesRecognition } from "../../core/search-recognition.js";
import type { SearchRecognitionMetadata } from "../../types.js";
export { matchesRecognition };

/** Presentation only. Deliberately conservative; never rewrites source/evidence. */
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

export function searchPreview(snippet: string, title: string, query = "", fallback = ""): string {
  const excerpt = readablePreview(snippet, title), body = readablePreview(fallback, title);
  const queryWords = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => queryWords.some(word => text.toLocaleLowerCase().includes(word));
  return (excerpt && (matches(excerpt) || !body) ? excerpt : body || excerpt) || "No preview text";
}

export function appendSearchHighlight(element: HTMLElement, text: string, query: string): void {
  const words = [...new Set(query.trim().split(/\s+/).filter(word => word.length > 1))].slice(0, 20).sort((a, b) => b.length - a.length);
  if (!words.length) { element.textContent = text; return; }
  const pattern = new RegExp(words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "giu");
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    element.append(element.ownerDocument.createTextNode(text.slice(start, match.index)));
    const mark = element.ownerDocument.createElement("mark"); mark.textContent = match[0]; element.append(mark);
    start = match.index! + match[0].length;
  }
  element.append(element.ownerDocument.createTextNode(text.slice(start)));
}

export function resultEditContext(metadata: SearchRecognitionMetadata | undefined, now = new Date()) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = metadataDate(metadata?.updatedAt);
  const exact = (value: string) => value.length === 10 ? value : new Date(value).toLocaleString(undefined, { timeZoneName: "short" });
  let label = "";
  if (date) {
    // Compare local calendar days, so a DST boundary still counts as one day.
    const days = Math.round((Date.parse(recognitionDay(now.toISOString(), timeZone)!) - Date.parse(recognitionDay(date, timeZone)!)) / 86400000);
    if (days !== 0) label = days > 0 ? days + "d" : "in " + -days + "d";
    else if (date.length === 10) label = "Today";
    else {
      const minutes = Math.floor((now.getTime() - Date.parse(date)) / 60000);
      const age = Math.abs(minutes);
      label = age < 1 ? "now" : (minutes < 0 ? "in " : "") + (age < 60 ? age + "m" : Math.floor(age / 60) + "h");
    }
  }
  return { label, details: date ? "Last edited " + exact(date) : "" };
}

export function browserMemoryActor(storage: Storage | undefined): { kind: "human"; id?: string } {
  try {
    let id = storage?.getItem("jumpybrain.editor-id");
    if (!id || !/^browser:[a-f0-9-]{36}$/.test(id)) { id = "browser:" + crypto.randomUUID(); storage?.setItem("jumpybrain.editor-id", id); }
    return { kind: "human", ...(storage ? { id } : {}) };
  } catch { return { kind: "human" }; }
}
