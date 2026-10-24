import type { LogseqBodyFormat } from "./types.js";

export const LOGSEQ_BODY_VERSION = 1;
export interface LogseqBodyConversion {
  body: Buffer;
  removedOutlineMarkers: number;
  retainedNestedBlocks: number;
  warnings: string[];
}

interface Line { text: string; end: string }
const outline = /^-(?:[ \t]|$)/;
const task = /^(?:\[[ xX-]\]|TODO|DOING|DONE|NOW|LATER|WAITING|CANCELED|CANCELLED)(?:\s|$)/;
const opaque = /^(?:[^\s:]+::(?:\s|$)|\{\{)/;
const fenceStart = /^ {0,3}(`{3,}|~{3,})(.*)$/;

// A Logseq continuation uses two spaces or one tab per outer block level.
// Remove just that level; additional indentation can be meaningful Markdown/code.
function dedent(text: string): string {
  return text.startsWith("\t") ? text.slice(1) : text.startsWith("  ") ? text.slice(2) : text;
}

function kind(text: string): string {
  if (/^\s*(?:[-+*]\s|\d+[.)]\s)/.test(text)) return "list";
  if (/^ {0,3}>/.test(text)) return "quote";
  if (/^\s*\|/.test(text)) return "table";
  return "block";
}

/** Remove outer prose wrappers, retaining ambiguous child lists and opaque syntax.
 * No model execution, grammar guessing, link rewriting or source mutation.
 */
export function convertLogseqBody(source: Buffer, format: LogseqBodyFormat): LogseqBodyConversion {
  const preserved = (warning?: string): LogseqBodyConversion => ({
    body: source, removedOutlineMarkers: 0, retainedNestedBlocks: 0, warnings: warning ? [warning] : [],
  });
  if (format === "preserve") return preserved();
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(source); }
  catch { return preserved("Invalid UTF-8: original body preserved."); }
  if (/\r(?!\n)|\x00/.test(text)) return preserved("Unsupported control/line-ending syntax: original body preserved.");
  const lines: Line[] = Array.from(text.matchAll(/([^\r\n]*)(\r\n|\n|$)/g), match => ({ text: match[1]!, end: match[2]! }));
  if (lines.at(-1)?.text === "" && lines.at(-1)?.end === "") lines.pop();
  const newline = lines.find(line => line.end)?.end ?? "\n";
  const output: Line[] = [];
  let removedOutlineMarkers = 0, retainedNestedBlocks = 0, opaqueBlocks = 0;
  let previousKind: string | undefined;
  let index = 0;
  // Source YAML is source text, never generated control metadata or outline syntax.
  if (lines[0]?.text.replace(/^\uFEFF/, "") === "---") {
    const closing = lines.findIndex((line, i) => i > 0 && /^(?:---|\.\.\.)\s*$/.test(line.text));
    if (closing < 0) return preserved("Unclosed source frontmatter: original body preserved.");
    output.push(...lines.slice(0, closing + 1));
    index = closing + 1;
  }
  for (; index < lines.length;) {
    const first = lines[index]!;
    if (!outline.test(first.text)) {
      const opening = fenceStart.exec(first.text);
      if (opening) {
        let closing = index + 1;
        for (; closing < lines.length; closing++) {
          const marker = fenceStart.exec(lines[closing]!.text);
          if (marker && marker[1]![0] === opening[1]![0] && marker[1]!.length >= opening[1]!.length && !marker[2]!.trim()) break;
        }
        if (closing === lines.length) return preserved("Unclosed code fence: original body preserved.");
        output.push(...lines.slice(index, closing + 1));
        previousKind = undefined;
        index = closing + 1;
        continue;
      }
      output.push(first);
      previousKind = undefined;
      index++;
      continue;
    }
    const content = first.text === "-" ? "" : first.text.slice(2);
    const retain = task.test(content) || opaque.test(content);
    if (opaque.test(content)) opaqueBlocks++;
    const block: Line[] = [{ text: retain ? first.text : content, end: first.end }];
    const opening = fenceStart.exec(content);
    let fence = opening ? { char: opening[1]![0]!, length: opening[1]!.length } : undefined;
    let next = index + 1;
    for (; next < lines.length; next++) {
      const line = lines[next]!;
      if (!fence && outline.test(line.text)) break;
      // A nonindented line is outside this outline block. Preserve it separately.
      if (!fence && line.text && !/^[ \t]/.test(line.text)) break;
      const inner = dedent(line.text);
      if (!fence && /^[ \t]*-\s/.test(line.text)) retainedNestedBlocks++;
      block.push({ text: retain ? line.text : inner, end: line.end });
      const marker = fenceStart.exec(inner);
      if (fence) {
        if (marker && marker[1]![0] === fence.char && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
      } else if (marker) fence = { char: marker[1]![0]!, length: marker[1]!.length };
    }
    if (fence) return preserved("Unclosed code fence: original body preserved.");
    const currentKind = kind(block[0]!.text);
    // Separate prose blocks, while keeping adjacent table rows, quotes and lists intact.
    if (output.length && output.at(-1)!.text.trim() && block[0]!.text.trim() &&
        !(previousKind === currentKind && currentKind !== "block")) {
      output.push({ text: "", end: first.end || newline });
    }
    output.push(...block);
    previousKind = currentKind;
    if (!retain) removedOutlineMarkers++;
    index = next;
  }
  const warnings: string[] = [];
  if (retainedNestedBlocks) warnings.push("Nested outline lists retained to preserve parent/child meaning; list intent is ambiguous.");
  if (opaqueBlocks) warnings.push("Logseq property/macro blocks retained as source text; not evaluated.");
  return { body: Buffer.from(output.map(line => line.text + line.end).join("")), removedOutlineMarkers, retainedNestedBlocks, warnings };
}
