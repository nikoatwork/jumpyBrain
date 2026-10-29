// Eval-only; query text alone. Never receives corpus, gold, IDs or rich search.
export function naturalQuestion(value) {
  if (!/^(?:what|why|who|when|where|which|how|has|have|does|do|did|is|are|can|could|should|would)\b/i.test(value)
    || !/\?\s*$/.test(value)) return null;
  // Preserve all explicit syntax and identifier-like forms. Only alphabetic
  // single hyphens and lowercase negation are candidates for reinterpretation.
  const query = value.replace(/\b[a-zA-Z]+(?:-[a-zA-Z]+)+\b/g, word => word.replaceAll('-', ' '));
  const constraintProbe = query.replace(/\b(?:not|no|without|except|exclude|excluding)\b/g, '');
  if (/["“”‘’`+#=\\*()[\]{}<>|]/.test(constraintProbe)
    || /(?:^|[^a-z])'|'(?=$|[^a-z])/i.test(constraintProbe)
    || /(?:^|\s)-\S|\b(?:NOT|AND|OR)\b/.test(constraintProbe)
    || /[a-z0-9]:[a-z0-9]|\b(?:file|path|title|tag|collection|exact):/i.test(constraintProbe)
    || /[a-z0-9][._/-][a-z0-9]|[a-z]\d|\d[a-z]/i.test(constraintProbe)
    || /[a-z][A-Z]/.test(constraintProbe)) return null;
  return { query, constraintProbe };
}
