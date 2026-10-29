import type { Frontmatter } from "../../types.js";

function firstWord(value: unknown): string | undefined {
  return typeof value === "string" ? value.match(/^[\p{L}\p{N}]+/u)?.[0] : undefined;
}

function declaredNames(value: unknown): unknown[] {
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

/** Recognize one literal canonical name; supplied metadata never proves a claim. */
export function namedSubjectFor(query: string, records: Iterable<Frontmatter>): string | undefined {
  const words = new Set(query.match(/[\p{L}\p{N}]+/gu) ?? []);
  const prefixes = new Map<string, Set<string>>();
  const aliases = new Set<string>();
  for (const metadata of records) {
    const title = metadata.title;
    const first = firstWord(title);
    if (typeof title === "string" && first && /^\p{Lu}/u.test(first) && words.has(first)) {
      const titles = prefixes.get(first) ?? new Set<string>();
      titles.add(title);
      prefixes.set(first, titles);
    }
    for (const alias of declaredNames(metadata.aliases)) {
      if (typeof alias === "string" && /^[\p{L}\p{N}]+$/u.test(alias)
        && /^\p{Lu}/u.test(alias) && words.has(alias)) aliases.add(alias);
    }
  }
  const subjects = new Set([...prefixes].filter(([, titles]) => titles.size >= 2).map(([name]) => name));
  for (const alias of aliases) subjects.add(alias);
  return subjects.size === 1 ? [...subjects][0] : undefined;
}

/** Match the recognized name against declared title, aliases or exact tags. */
export function matchesNamedSubject(metadata: Frontmatter, subject: string): boolean {
  return firstWord(metadata.title) === subject || declaredNames(metadata.aliases).includes(subject)
    || (Array.isArray(metadata.tags) && metadata.tags.some(tag => typeof tag === "string" && tag.toLowerCase() === subject.toLowerCase()));
}
