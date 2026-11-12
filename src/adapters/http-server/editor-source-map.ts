import { IS_BOLD, IS_CODE, IS_ITALIC } from "lexical";
import { externalLinkMatch, noteLinkMatch, relativeLinkPattern } from "./editor-markdown.js";

/** Exact UTF-16 correspondence between editable presentation and Markdown.
 * Structural prefixes/fences are outside this map. Formatting delimiters have
 * zero visible width; reference spelling and literal/code contents stay text.
 * The complete rendered text AND format runs must agree before a map is used.
 */
export interface EditorSourceMap {
  spans: Array<{ start: number; end: number; from: number; to: number; escaped?: boolean }>;
  contentStart: number; contentEnd: number; visibleLength: number;
}
export function markdownSourceMap(raw: string, visible: string, formats: ArrayLike<number>, options: { start?: number; end?: number; literal?: boolean; links?: Array<{ from: number; to: number }> } = {}): EditorSourceMap | null {
  const start = options.start ?? 0, end = options.end ?? raw.length;
  if (start < 0 || end < start || end > raw.length) return null;
  const spans: EditorSourceMap["spans"] = [];
  let position = start, rendered = 0, format = 0;
  let linkEnd: { labelEnd: number; end: number; visibleEnd: number; format: number } | null = null;
  const mask = IS_BOLD | IS_ITALIC | IS_CODE;
  const normalized = raw.slice(start, end).replace(/\r(?=\n|$)/g, "");
  const literal = options.literal || normalized === visible;
  const gap = (start: number, end: number, escaped = false) => { const previous = spans.at(-1); if (previous && !previous.escaped && !escaped && previous.from === previous.to && previous.end === start) previous.end = end; else spans.push({ start, end, from: rendered, to: rendered, ...(escaped?{escaped:true}:{}) }); };
  function emit(until: number, expected: number, checkFormat: boolean) {
    while (position < until) {
      if (raw[position] === "\r" && (raw[position + 1] === "\n" || position === end - 1)) { gap(position, position + 1); position++; continue; }
      if (raw[position] !== visible[rendered] || checkFormat && (formats[rendered] & mask) !== expected) return false;
      const previous = spans.at(-1);
      if (previous && previous.end === position && previous.to === rendered && previous.to > previous.from) { previous.end++; previous.to++; }
      else spans.push({ start: position, end: position + 1, from: rendered, to: rendered + 1 });
      position++; rendered++;
    }
    return true;
  }
  gap(start, start);
  if (literal) {
    if (!emit(end, 0, false)) return null;
  } else while (position < end) {
    if (linkEnd && position === linkEnd.labelEnd) {
      if (rendered !== linkEnd.visibleEnd || format !== linkEnd.format) return null;
      gap(position, linkEnd.end); position = linkEnd.end; linkEnd = null; continue;
    }
    if (!linkEnd && raw[position] === "[" && options.links?.some(link => link.from === rendered)) {
      // Either link kind must start exactly here; a later match of one kind must not hide the other.
      const rest = raw.slice(position, end), external = externalLinkMatch(rest);
      const parsed: { label: string; start: number; end: number } | null = external?.start === 0 ? external : noteLinkMatch(rest);
      const link = options.links.find(link => link.from === rendered);
      if (!parsed || parsed.start !== 0 || !link) return null;
      linkEnd = { labelEnd: position + 1 + parsed.label.length, end: position + parsed.end, visibleEnd: link.to, format };
      gap(position, position + 1); position++; continue;
    }
    // Lexical exports typed, not-yet-completed Markdown delimiters with an
    // escape. The backslash has no glyph in this actual rich-text leaf.
    if(raw[position]==="\\" && /[\[\]*_`~\\]/.test(raw[position+1]??"")){
      gap(position,position+1,true);position++;
      if(!emit(position+1,format,true))return null;
      continue;
    }
    const relative = raw[position] === "[" ? relativeLinkPattern.exec(raw.slice(position, end)) : null;
    if (relative?.index === 0) {
      if (!emit(position + relative[0].length, format, true)) return null;
      continue;
    }
    if (raw.startsWith("[[", position)) {
      const close = raw.indexOf("]]", position + 2);
      if (close < 0 || close + 2 > end || !emit(close + 2, format, true)) return null;
      continue;
    }
    if (raw[position] === "`") {
      const open = position, fence = /^`+/.exec(raw.slice(position, end))![0];
      let close = raw.indexOf("`", position + fence.length);
      while (close >= 0 && close < end) {
        const run = /^`+/.exec(raw.slice(close, end))![0];
        if (run.length === fence.length) break;
        close = raw.indexOf("`", close + run.length);
      }
      if (close < 0 || close >= end) return null;
      let contentStart = open + fence.length, contentEnd = close;
      const content = raw.slice(contentStart, contentEnd);
      if (content.startsWith(" ") && content.endsWith(" ") && content.trim()) { contentStart++; contentEnd--; }
      gap(open, contentStart); position = contentStart;
      if (!emit(contentEnd, format | IS_CODE, true)) return null;
      gap(contentEnd, close + fence.length); position = close + fence.length;
      continue;
    }
    const marker = raw[position] === "*" || raw[position] === "_" ? /^(\*{1,3}|_{1,3})/.exec(raw.slice(position, end))?.[0] : undefined;
    const intraword = marker?.[0] === "_" && /[\p{L}\p{N}]/u.test(raw[position - 1] ?? "") && /[\p{L}\p{N}]/u.test(raw[position + marker.length] ?? "");
    if (marker && !intraword) {
      gap(position, position + marker.length);
      format ^= marker.length === 3 ? IS_BOLD | IS_ITALIC : marker.length === 2 ? IS_BOLD : IS_ITALIC;
      position += marker.length;
      continue;
    }
    if (!emit(position + 1, format, true)) return null;
  }
  if (rendered !== visible.length || linkEnd || !literal && format !== 0) return null;
  return { spans, contentStart: start, contentEnd: end, visibleLength: visible.length };
}
export function visibleToSource(map: EditorSourceMap, position: number, association: "left" | "right" = "right"): number | null {
  if (!Number.isInteger(position) || position < 0 || position > map.visibleLength) return null;
  if (!map.visibleLength) return map.contentStart;
  const escaped=map.spans.find(span=>span.escaped&&span.from===position);
  if(escaped&&(association==="right"||position===0))return escaped.start;
  const text = map.spans.filter((span) => span.to > span.from);
  if (association === "left" && position > 0) {
    const span = text.find((span) => span.from < position && position <= span.to);
    return span ? span.start + position - span.from : null;
  }
  const span = text.find((span) => span.from <= position && position < span.to);
  return span ? span.start + position - span.from : text.at(-1)?.end ?? map.contentStart;
}
export function sourceToVisible(map: EditorSourceMap, position: number): number | null {
  if (!Number.isInteger(position)) return null;
  const span = map.spans.find((span) => span.start <= position && position <= span.end);
  return span ? span.from + (span.to === span.from ? 0 : position - span.start) : null;
}
