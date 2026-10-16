import { createHash } from "node:crypto";

/** Display-only abbreviations, never replacement addresses for navigation. */
export function compactEvidenceLinks(text: string): { text: string; shortened: boolean } {
  let shortened = false;
  const shorten = (target: string) => {
    if (target.length <= 80) return target;
    shortened = true;
    // Retain recognizable ends plus an identity hint: different destinations
    // with the same basename/shared prefix must not look like the same link.
    const identity = createHash("sha256").update(target).digest("hex").slice(0, 8);
    return `${target.slice(0, 24)}…${target.slice(-24)}~${identity}`;
  };
  const transform = (prose: string) => prose.replace(
    /(\[[^\[\]\n]*\]\()([^\s()[\]<>]+)(\))|https?:\/\/[^\s<>()\[\]`]+/gu,
    (whole, label: string | undefined, target: string | undefined, close: string | undefined) =>
      label !== undefined ? `${label}${shorten(target!)}${close}` : shorten(whole),
  );
  // Snippets have compacted whitespace, but backtick-delimited code still needs
  // literal preservation. Leave unmatched code delimiters and their tail alone.
  let output = "", offset = 0;
  const ticks = /`+/gu;
  let match: RegExpExecArray | null;
  while ((match = ticks.exec(text))) {
    output += transform(text.slice(offset, match.index));
    const marker = match[0];
    let closing: RegExpExecArray | null;
    do { closing = ticks.exec(text); } while (closing && closing[0].length !== marker.length);
    if (!closing) return { text: output + text.slice(match.index), shortened };
    offset = closing.index + closing[0].length;
    output += text.slice(match.index, offset);
  }
  output += transform(text.slice(offset));
  return { text: output, shortened };
}
