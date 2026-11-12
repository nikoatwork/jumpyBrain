import { parseFrontmatter } from '../frontmatter.js';
import { DRAWING_EXTENSION, isDrawingName } from './model.js';

export type DrawingMentionRewrite = { content: string; count: number };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
// `[[Name.excalidraw]]`, optionally `![[…]]`, `#heading` or `|alias`. Escaped openers stay literal.
const MENTION = /(\\?)(!?)\[\[([^\]\n|#]*?)([ \t]*)((?:[#|][^\]\n]*)?)\]\]/g;

function targetName(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed.toLowerCase().endsWith(DRAWING_EXTENSION)) return null;
  return trimmed.slice(0, -DRAWING_EXTENSION.length);
}

/** Split a line into [text, isCode] segments; a backtick run closes only at a run of equal length. */
function codeSegments(line: string): Array<[string, boolean]> {
  const segments: Array<[string, boolean]> = [];
  let position = 0, cursor = 0;
  while (cursor < line.length) {
    const open = line.indexOf('`', cursor);
    if (open < 0) break;
    let length = 1;
    while (line[open + length] === '`') length++;
    let search = open + length, close = -1;
    while (search < line.length) {
      const next = line.indexOf('`', search);
      if (next < 0) break;
      let run = 1;
      while (line[next + run] === '`') run++;
      if (run === length) { close = next; break; }
      search = next + run;
    }
    if (close < 0) { cursor = open + length; continue; }
    segments.push([line.slice(position, open), false], [line.slice(open, close + length), true]);
    position = cursor = close + length;
  }
  segments.push([line.slice(position), false]);
  return segments;
}

/** Replace mentions outside inline code spans on one line. */
function rewriteLine(line: string, from: string, to: string): DrawingMentionRewrite {
  let count = 0;
  const content = codeSegments(line).map(([segment, code]) => code ? segment : segment.replace(MENTION,
    (match, escape: string, embed: string, target: string, space: string, suffix: string) => {
      if (escape || targetName(target) !== from) return match;
      const leading = target.match(/^\s*/)![0], extension = target.trim().slice(-DRAWING_EXTENSION.length);
      count++;
      return embed + '[[' + leading + to + extension + space + suffix + ']]';
    })).join('');
  return { content, count };
}

/**
 * Rewrite body mentions of one drawing name, preserving every other byte.
 * Frontmatter, fenced code and inline code are left untouched; names compare exactly.
 */
export function rewriteDrawingMentions(content: string, from: string, to: string): DrawingMentionRewrite {
  if (!isDrawingName(from) || !isDrawingName(to) || from === to || !content.includes('[[')) return { content, count: 0 };
  const bodyStart = parseFrontmatter(content).bodyStartLine - 1;
  const parts = content.split(/(\r?\n)/);
  let count = 0, fence: string | null = null;
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index]!;
    if (index / 2 < bodyStart) continue;
    const opener = line.match(FENCE)?.[1];
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length && !line.slice(line.indexOf(opener) + opener.length).trim()) fence = null;
      continue;
    }
    if (opener && !(opener[0] === '`' && line.slice(line.indexOf(opener) + opener.length).includes('`'))) { fence = opener; continue; }
    const rewritten = rewriteLine(line, from, to);
    if (rewritten.count) { parts[index] = rewritten.content; count += rewritten.count; }
  }
  return { content: count ? parts.join('') : content, count };
}
