import { metadataDate } from "../../core/canonical/metadata-date.js";
import { recognitionDay, matchesRecognition } from "../../core/search-recognition.js";
import type { SearchRecognitionMetadata, SearchRecognitionOptions } from "../../types.js";
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

export function resultEditContext(metadata: SearchRecognitionMetadata | undefined, actorId?: string, now = new Date()) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = metadataDate(metadata?.updatedAt), created = metadataDate(metadata?.createdAt);
  const editor = metadata?.editor;
  const who = editor?.kind === "human" ? (actorId && editor.id === actorId ? "You" : "Human") : editor?.kind === "agent" ? "Agent" : "Editor unknown";
  const exact = (value: string) => value.length === 10 ? value : new Date(value).toLocaleString(undefined, { timeZoneName: "short" });
  let label = "Edit date unknown";
  if (date) {
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const day = recognitionDay(date, timeZone);
    const relative = day === recognitionDay(now.toISOString(), timeZone) ? "Today" : day === recognitionDay(yesterday.toISOString(), timeZone) ? "Yesterday" : "";
    const value = new Date(date.length === 10 ? date + "T12:00:00" : date);
    label = "Edited " + (relative || value.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(value.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) }))
      + (relative && date.length > 10 ? ", " + value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");
  }
  const details = [date ? "Last edited " + exact(date) : "Edit date unknown", created ? "Created " + exact(created) : "Creation date unknown",
    editor ? `Declared editor: ${who}${editor.name ? " (" + editor.name + ")" : ""}. This is not verified identity.` : "Editor unknown",
    metadata?.metadataStatus === "unavailable" ? "Current metadata unavailable" : ""].filter(Boolean).join(". ");
  return { label: label + " · " + who, details };
}

export function browserMemoryActor(storage: Storage | undefined): { kind: "human"; id?: string } {
  try {
    let id = storage?.getItem("jumpybrain.editor-id");
    if (!id || !/^browser:[a-f0-9-]{36}$/.test(id)) { id = "browser:" + crypto.randomUUID(); storage?.setItem("jumpybrain.editor-id", id); }
    return { kind: "human", ...(storage ? { id } : {}) };
  } catch { return { kind: "human" }; }
}

export function searchRecognitionControls(doc: Document, actorId?: string) {
  const get = (id: string) => doc.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function options(offset = 0): SearchRecognitionOptions {
    const result: SearchRecognitionOptions = { timeZone, offset, sort: get("search-sort").value as "relevance" | "edited", dateField: get("search-date-field").value as "edited" | "created" };
    const editor = get("search-editor").value;
    if (editor) result.editor = editor as SearchRecognitionOptions["editor"];
    if (actorId) result.actorId = actorId;
    const preset = get("search-date").value;
    const now = new Date(), from = new Date(now);
    if (preset === "yesterday") { now.setDate(now.getDate() - 1); from.setDate(from.getDate() - 1); }
    if (preset === "week") from.setDate(from.getDate() - 6);
    if (preset && preset !== "custom") {
      result.from = recognitionDay(from.toISOString(), timeZone); result.to = recognitionDay(now.toISOString(), timeZone);
    } else if (preset === "custom") {
      if (get("search-from").value) result.from = get("search-from").value;
      if (get("search-to").value) result.to = get("search-to").value;
    }
    return result;
  }
  if (!actorId) get("search-editor").querySelector('option[value="you"]')?.remove();
  return { options, clear() { for (const id of ["search-editor", "search-date", "search-from", "search-to"]) get(id).value = ""; get("search-sort").value = "relevance"; get("search-date-field").value = "edited"; } };
}
