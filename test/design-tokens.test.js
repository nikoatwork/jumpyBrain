// Design-token guard for the browser UI (docs/design-system.md#primitives).
// Scans every style template in src/adapters/http-server (exported *Styles, the graph-page <style>
// shell and `.style.cssText` strings) for values that bypass the shared tokens, then ratchets the
// per-file counts against `baseline`. Lower a count in the same change that removes drift; a count
// that goes up is new drift: use a token or primitive instead (or add a reasoned `allowlist` entry).
// Print current counts with: DESIGN_TOKENS_PRINT=1 node --test test/design-tokens.test.js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { designTokens, motion, narrowDesignTokens } from "../dist/adapters/http-server/browser-design-system.js";
import { builtInPalettes } from "../dist/adapters/http-server/browser-palettes.js";
import { themeStyles } from "../dist/adapters/http-server/browser-theme.js";
import { sourceFilesFor } from "./source-graph-helpers.js";

// Remaining drift per file and rule. Migrations lower these; the test fails if a count rises or falls.
const baseline = {
  "browser-appearance.ts": { "color-literal": 6 },
  "notes-browser.ts": { "spacing": 2 },
};

// Permanent exceptions. `selector` matches the innermost rule prelude; `text` matches the declaration.
const allowlist = [
  { file: "graph-page.ts", rules: ["duration"], selector: /^\*, \*::before, \*::after$/, reason: "global Reduced Motion kill switch" },
  { file: "graph-page.ts", rules: ["opacity", "duration", "easing", "font-size", "font-weight", "tracking"], selector: /^(?:\.node|\.edge|\.match-context|#graph\[|\.graph-title)/, reason: "graph canvas geometry (out of scope, R9)" },
  { file: "browser-appearance.ts", rules: ["color-literal", "radius", "opacity", "shadow"], selector: /\.(?:mini-|appearance-mini|palette-(?:preview|ember|ocean|pride|mono))/, reason: "scaled appearance miniatures and palette swatches (R9)" },
  { file: "lexical-editor.ts", rules: ["color-literal"], selector: /^style\.cssText$/, text: /^color:white$/, reason: "collaborator identity label ink on hashed identity colours (R9)" },
  { file: "editor-task-presentation.ts", rules: ["duration", "easing"], text: /780ms/, reason: "task Quiet sweep choreography (R6 named exception)" },
  { file: "notes-browser.ts", rules: ["duration", "easing"], text: /(?:^|[\s,])4s\b/, reason: "external-change fade (R6 named exception)" },
];

// Custom properties assigned at runtime in a way the declaration scan cannot see (it already
// counts `--x:` declarations, inline style attributes and setProperty calls). Entries must stay
// necessary: the test fails when one is unused or already found by the scan.
const runtimeVariables = new Set([]);

const httpServerDir = "adapters/http-server";
const tokenSources = new Set(["browser-theme.ts", "browser-palettes.ts"]);
const rules = ["color-literal", "font-size", "font-weight", "line-height", "tracking", "spacing", "radius", "shadow", "z-index", "opacity", "duration", "easing", "media"];

// Replace `${…}` interpolations (and their contents) with spaces so offsets/newlines stay aligned.
function blankTemplate(text, start, closer) {
  let out = "", i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") { out += text.slice(i, i + 2); i += 2; continue; }
    if (ch === closer) return { end: i, body: out };
    if (closer === "`" && ch === "$" && text[i + 1] === "{") {
      let depth = 0, j = i + 1;
      for (; j < text.length; j++) {
        const c = text[j];
        if (c === "'" || c === '"' || c === "`") { j = skipString(text, j); continue; }
        if (c === "{") depth++;
        else if (c === "}" && --depth === 0) break;
      }
      out += text.slice(i, j + 1).replace(/[^\n]/g, " ");
      i = j + 1;
      continue;
    }
    out += ch; i++;
  }
  return { end: text.length, body: out };
}
function skipString(text, start) {
  const quote = text[start];
  if (quote === "`") return blankTemplate(text, start + 1, "`").end;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i;
  }
  return text.length;
}

function styleRegions(text) {
  const regions = [];
  for (const match of text.matchAll(/export const (\w+Styles)\s*=\s*(?:\/\*\s*@__PURE__\s*\*\/\s*\(\(\)\s*=>\s*)?(?:String\.raw)?`/g)) {
    const start = match.index + match[0].length;
    regions.push({ name: match[1], offset: start, css: blankTemplate(text, start, "`").body });
  }
  for (const match of text.matchAll(/<style\b[^>]*>/g)) {
    const start = match.index + match[0].length, end = text.indexOf("</style>", start);
    const slice = text.slice(start, end) + "`";
    regions.push({ name: "<style>", offset: start, css: blankTemplate(slice, 0, "`").body });
  }
  for (const match of text.matchAll(/\.style\.cssText\s*=\s*(["'`])/g)) {
    const start = match.index + match[0].length;
    const body = match[1] === "`" ? blankTemplate(text, start, "`").body : text.slice(start, skipString(text, start - 1));
    regions.push({ name: "cssText", offset: start, css: `style.cssText{${body}}`, shift: -"style.cssText{".length });
  }
  return regions;
}

// Yields declarations and at-rule preludes with absolute offsets and the enclosing prelude stack.
function* cssItems(region) {
  const css = region.css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const stack = [];
  let segment = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch !== "{" && ch !== "}" && ch !== ";") continue;
    const raw = css.slice(segment, i), text = raw.trim().replace(/\s+/g, " ");
    const offset = region.offset + (region.shift || 0) + segment + (raw.length - raw.trimStart().length);
    if (ch === "{") { stack.push(text); yield { kind: "prelude", text, offset }; }
    else {
      if (text.includes(":") && stack.length) yield { kind: "declaration", text, offset, selector: stack.at(-1) };
      if (ch === "}") stack.pop();
    }
    segment = i + 1;
  }
}

const stripVars = (value) => {
  let previous;
  do { previous = value; value = value.replace(/var\(--[\w-]+(?:,[^()]*)?\)/g, ""); } while (value !== previous);
  return value.replace(/!important/g, "").trim();
};
const pxNumbers = (value) => [...value.matchAll(/(?<![\w.#-])(-?\d*\.?\d+)px\b/g)].map((m) => Number(m[1]));

function violations(property, value) {
  const found = [];
  const custom = property.startsWith("--");
  if (/#[0-9a-f]{3,8}\b/i.test(value) || /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/i.test(value) || /(?<![\w-])(?:white|black)(?![\w-])/i.test(value)) found.push("color-literal");
  if (custom) return found;
  const bare = stripVars(value);
  const shorthand = property === "font";
  if ((property === "font-size" || shorthand) && /(?<![\w.-])\d*\.?\d+(?:px|rem)\b/.test(bare)) found.push("font-size");
  if ((property === "font-weight" && /^(?:[1-9]00|bold|bolder|lighter)$/.test(bare)) || (shorthand && /(?:^|\s)[1-9]00(?=\s)/.test(` ${bare} `))) found.push("font-weight");
  if ((property === "line-height" && bare && !/^(?:1|0|normal)$/.test(bare)) || (shorthand && /\/\s*(?!1(?:\s|$))[\d.]+/.test(bare))) found.push("line-height");
  if (property === "letter-spacing" && bare && !/^(?:0|normal)$/.test(bare)) found.push("tracking");
  if (/^(?:padding|margin|inset|scroll-padding|scroll-margin)(?:-[a-z-]+)?$|^(?:gap|row-gap|column-gap|top|right|bottom|left)$/.test(property) && pxNumbers(bare).some((n) => Math.abs(n) > 1)) found.push("spacing");
  if (/^border(?:-[a-z]+)*-radius$/.test(property) && /(?<![\w.-])\d*\.?\d+/.test(bare) && !/^0(?:px)?$/.test(bare)) found.push("radius");
  if (/^(?:box|text)-shadow$/.test(property) && bare && bare !== "none" && !/^inset 0 0 0 1px var\(--[\w-]+\)$/.test(value)) found.push("shadow");
  if (property === "z-index" && /^-?\d+$/.test(bare) && (Number(bare) < -1 || Number(bare) > 4)) found.push("z-index");
  if (property === "opacity" && bare && !/^(?:0|1)$/.test(bare)) found.push("opacity");
  if (/^(?:transition|animation)(?:-duration|-delay)?$/.test(property) && /(?<![\w.-])\d*\.?\d+m?s\b/.test(bare)) found.push("duration");
  if (/^(?:transition|animation)(?:-timing-function)?$/.test(property) && /(?<![\w-])(?:ease(?:-in|-out|-in-out)?|linear|step-start|step-end)(?![\w-])|cubic-bezier\(|steps\(/.test(bare)) found.push("easing");
  return found;
}

const lineOf = (text, offset) => text.slice(0, offset).split("\n").length;

async function scan() {
  const hits = [], used = [], declared = new Set(), allowlistUsed = new Set();
  for (const absolute of await sourceFilesFor(httpServerDir)) {
    const name = path.basename(absolute);
    const text = await readFile(absolute, "utf8");
    for (const match of text.matchAll(/(--[\w-]+)\s*:/g)) declared.add(match[1]);
    for (const match of text.matchAll(/setProperty\(\s*["'`](--[\w-]+)/g)) declared.add(match[1]);
    for (const match of text.matchAll(/matchMedia(?:\?\.)?\(\s*(["'`])([\s\S]*?)\1/g)) {
      if (/\d+px/.test(match[2])) hits.push({ file: name, rule: "media", line: lineOf(text, match.index), text: match[0], selector: "matchMedia" });
    }
    if (tokenSources.has(name)) continue;
    for (const region of styleRegions(text)) {
      for (const match of region.css.matchAll(/var\((--[\w-]+)/g)) used.push({ file: name, variable: match[1], line: lineOf(text, region.offset + match.index) });
      for (const item of cssItems(region)) {
        if (item.kind === "prelude") {
          if (/^@media\b/.test(item.text) && /\d+px/.test(item.text)) hits.push({ file: name, rule: "media", line: lineOf(text, item.offset), text: item.text, selector: item.text });
          continue;
        }
        const colon = item.text.indexOf(":");
        const property = item.text.slice(0, colon).trim().toLowerCase(), value = item.text.slice(colon + 1).trim();
        if (!/^-{0,2}[a-z][a-z0-9-]*$/.test(property)) continue;
        for (const rule of violations(property, value)) {
          const allowed = allowlist.find((entry) => entry.file === name && entry.rules.includes(rule)
            && (!entry.selector || entry.selector.test(item.selector)) && (!entry.text || entry.text.test(item.text)));
          if (allowed) allowlistUsed.add(allowed);
          else hits.push({ file: name, rule, line: lineOf(text, item.offset), text: item.text, selector: item.selector });
        }
      }
    }
  }
  return { hits, used, declared, allowlistUsed };
}

const scanned = scan();

test("style templates only add raw values through the ratcheted baseline", async () => {
  const { hits } = await scanned;
  const counts = {};
  for (const hit of hits) (counts[hit.file] ??= {})[hit.rule] = (counts[hit.file][hit.rule] ?? 0) + 1;
  if (process.env.DESIGN_TOKENS_PRINT) {
    const sorted = Object.fromEntries(Object.keys(counts).sort().map((file) => [file, Object.fromEntries(rules.filter((rule) => counts[file][rule]).map((rule) => [rule, counts[file][rule]]))]));
    console.log(JSON.stringify(sorted, null, 2));
  }
  const problems = [];
  for (const file of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
    for (const rule of new Set([...Object.keys(counts[file] ?? {}), ...Object.keys(baseline[file] ?? {})])) {
      const actual = counts[file]?.[rule] ?? 0, expected = baseline[file]?.[rule] ?? 0;
      if (actual > expected) {
        const examples = hits.filter((hit) => hit.file === file && hit.rule === rule).map((hit) => `    ${file}:${hit.line} ${hit.text}`).join("\n");
        problems.push(`${file} ${rule}: ${actual} raw values (baseline ${expected}). Use a token from docs/design-system.md#primitives or a shared primitive:\n${examples}`);
      } else if (actual < expected) {
        problems.push(`${file} ${rule}: ${actual} raw values, below baseline ${expected}. Lower the baseline in test/design-tokens.test.js.`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("every allowlist exception still matches a declaration", async () => {
  const { allowlistUsed } = await scanned;
  const stale = allowlist.filter((entry) => !allowlistUsed.has(entry)).map((entry) => `${entry.file}: ${entry.reason}`);
  assert.deepEqual(stale, [], "remove stale allowlist entries");
});

test("every var(--token) used by browser styles is defined", async () => {
  const { used, declared } = await scanned;
  const defined = new Set([...declared, ...runtimeVariables,
    ...Object.keys(designTokens).map((key) => `--${key}`), ...Object.keys(narrowDesignTokens).map((key) => `--${key}`),
    ...Object.values(builtInPalettes).flatMap((modes) => Object.values(modes).flatMap((tokens) => Object.keys(tokens).map((key) => `--${key}`)))]);
  const missing = used.filter((use) => !defined.has(use.variable)).map((use) => `${use.file}:${use.line} ${use.variable}`);
  assert.deepEqual(missing, [], `undefined custom properties:\n${missing.join("\n")}`);
  const stale = [...runtimeVariables].filter((variable) => declared.has(variable) || !used.some((use) => use.variable === variable));
  assert.deepEqual(stale, [], "runtime variable allowlist entries must be used and not otherwise declared");
});

test("design tokens and their script mirrors stay in sync", () => {
  assert.equal(designTokens["duration-fast"], `${motion.fast}ms`);
  assert.equal(designTokens["duration-base"], `${motion.base}ms`);
  assert.equal(designTokens["duration-slow"], `${motion.slow}ms`);
  assert.equal(designTokens["writing-font"], undefined, "use --font-writing; the alias is retired");
});

test("every palette and mode defines the same semantic color roles", () => {
  const keys = (css) => new Set([...css.matchAll(/--([\w-]+):/g)].map((match) => match[1]));
  const emberLight = keys(themeStyles.slice(themeStyles.indexOf(":root {"), themeStyles.indexOf("}", themeStyles.indexOf(":root {"))));
  const darkStart = themeStyles.indexOf(':root[data-theme="dark"] {');
  const emberDark = keys(themeStyles.slice(darkStart, themeStyles.indexOf("}", darkStart)));
  assert.deepEqual([...emberDark].sort(), [...emberLight].sort(), "Ember light and dark define the same roles");
  for (const required of ["shadow-sm", "shadow-md", "shadow-lg", "find-fill", "find-fill-current", "map-wash", "backdrop"]) {
    assert.ok(emberLight.has(required), `Ember defines --${required}`);
  }
  for (const [name, modes] of Object.entries(builtInPalettes)) for (const [mode, tokens] of Object.entries(modes)) {
    const own = new Set(Object.keys(tokens));
    const missing = [...emberLight].filter((key) => !own.has(key));
    const extra = [...own].filter((key) => !emberLight.has(key) && key !== "sidebar-wash");
    assert.deepEqual(missing, [], `${name}/${mode} is missing roles`);
    assert.deepEqual(extra, [], `${name}/${mode} defines roles Ember lacks`);
  }
});
