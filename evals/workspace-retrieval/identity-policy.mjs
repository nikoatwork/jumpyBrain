// Experimental, deterministic metadata-only reranking. No query/entity allowlist.
export function prioritizeNamedIdentity(results, documents, query) {
  const entries = [...new Map([...documents.values()].map(d => [d.relativePath, d])).values()];
  const words = new Set(query.match(/[\p{L}\p{N}]+/gu) ?? []);
  const prefixes = new Map(), aliases = new Set();
  const token = title => typeof title === 'string' ? title.match(/^[\p{L}\p{N}]+/u)?.[0] : undefined;
  for (const doc of entries) {
    const title = doc.frontmatter?.title;
    const first = token(title);
    if (first && /^\p{Lu}/u.test(first) && words.has(first)) {
      const titles = prefixes.get(first) ?? new Set(); titles.add(title); prefixes.set(first, titles);
    }
    const raw = doc.frontmatter?.aliases;
    for (const alias of Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []) {
      if (typeof alias === 'string' && /^[\p{L}\p{N}]+$/u.test(alias) && /^\p{Lu}/u.test(alias) && words.has(alias)) aliases.add(alias);
    }
  }
  const anchors = new Set([...prefixes].filter(([,titles]) => titles.size >= 2).map(([name]) => name));
  for (const alias of aliases) anchors.add(alias);
  if (anchors.size !== 1) return results;
  const anchor = [...anchors][0], lower = anchor.toLowerCase();
  const match = result => {
    const doc = documents.get(result.provenance.file);
    if (!doc) return false;
    const fm = doc.frontmatter ?? {};
    const raw = fm.aliases, names = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
    return token(fm.title) === anchor || names.includes(anchor)
      || (Array.isArray(fm.tags) && fm.tags.some(tag => typeof tag === 'string' && tag.toLowerCase() === lower));
  };
  return [...results.filter(match), ...results.filter(result => !match(result))];
}
