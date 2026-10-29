// Eval-only metadata discovery. Scores, source repair and final selection remain
// owned by the real runtime; a name is a relevance hint, not evidence of a claim.
const MAX_ADDITIONS = 8;
const firstWord = title => typeof title === 'string' ? title.match(/^[\p{L}\p{N}]+/u)?.[0] : undefined;
const names = value => Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

/**
 * Add missing files for one unambiguous literal canonical name before repair.
 * The caller supplies the real runtime's constraint/navigation/temporal guards
 * and QMD lookup normalization. Existing candidate objects and scores survive.
 */
export function supplementNamedCandidates(candidates, documents, query, options = {}) {
  const unchanged = reason => ({ candidates, added: [], anchor: null, reason, omittedDocuments: 0 });
  if (options.constrained) return unchanged('constrained');
  if (options.exactNavigation) return unchanged('exact_navigation');
  if (options.temporal) return unchanged('temporal');

  // QMD maps can contain both canonical and normalized keys for one document.
  const entries = [...new Map([...documents.values()].map(d => [d.relativePath, d])).values()];
  const words = new Set(query.match(/[\p{L}\p{N}]+/gu) ?? []);
  const prefixes = new Map(), aliases = new Set();
  for (const doc of entries) {
    const title = doc.frontmatter?.title, first = firstWord(title);
    if (first && /^\p{Lu}/u.test(first) && words.has(first)) {
      const titles = prefixes.get(first) ?? new Set();
      titles.add(title);
      prefixes.set(first, titles);
    }
    for (const alias of names(doc.frontmatter?.aliases)) {
      if (typeof alias === 'string' && /^[\p{L}\p{N}]+$/u.test(alias)
        && /^\p{Lu}/u.test(alias) && words.has(alias)) aliases.add(alias);
    }
  }
  const anchors = new Set([...prefixes].filter(([, titles]) => titles.size >= 2).map(([name]) => name));
  for (const alias of aliases) anchors.add(alias);
  if (anchors.size !== 1) return unchanged(anchors.size ? 'ambiguous_names' : 'no_named_subject');

  const anchor = [...anchors][0], lower = anchor.toLowerCase();
  const normalizeFile = options.normalizeFile ?? (file => file);
  const candidateFiles = new Set(candidates.flatMap(candidate => {
    if (!candidate.file) return [];
    const doc = documents.get(candidate.file) ?? documents.get(normalizeFile(candidate.file));
    return doc ? [doc.relativePath] : [];
  }));
  const missing = entries.filter(doc => {
    if (candidateFiles.has(doc.relativePath)) return false;
    const fm = doc.frontmatter ?? {};
    return firstWord(fm.title) === anchor || names(fm.aliases).includes(anchor)
      || (Array.isArray(fm.tags) && fm.tags.some(tag => typeof tag === 'string' && tag.toLowerCase() === lower));
  }).sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
  const added = missing.slice(0, MAX_ADDITIONS).map(doc => ({ file: doc.relativePath, score: 0 }));
  return {
    candidates: added.length ? [...candidates, ...added] : candidates,
    added, anchor,
    reason: added.length ? 'supplemented' : 'no_missing_named_sources',
    omittedDocuments: Math.max(0, missing.length - added.length),
  };
}
