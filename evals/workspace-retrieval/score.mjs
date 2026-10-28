// Rubric access belongs to scoring, never to the interaction policy.
export const normalize = text => text.replace(/\s+/gu, ' ').trim();

export function chooseExpansions(packet, limit = 3) {
  const seen = new Set();
  return packet.passages.flatMap(passage => {
    if (!passage.expansion.available || seen.has(passage.expansion.id)) return [];
    seen.add(passage.expansion.id);
    return [{ id: passage.expansion.id, expectedContentHash: passage.expansion.expectedContentHash, startLine: 1, maxBytes: 8192 }];
  }).slice(0, limit);
}

export function scoreEvidence(units, spans) {
  return units.map(unit => ({ label: unit.label,
    covered: unit.alternatives.some(alt => alt.required.every(required => spans.some(span => span.verified
      && span.file === alt.file && normalize(span.text).includes(normalize(required))))) }));
}

export function scoreSearch(relevant, results) {
  const files = [...new Set(results.map(result => result.provenance.file))];
  const rank = files.findIndex(file => relevant.includes(file)) + 1;
  return { rank: rank || null, success5: rank > 0 && rank <= 5, success10: rank > 0 && rank <= 10,
    reciprocalRank: rank ? 1 / rank : 0, requiredFileCoverage10: relevant.filter(file => files.slice(0, 10).includes(file)).length / relevant.length };
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

export function summarize(records) {
  const mean = fn => records.length ? records.reduce((sum, row) => sum + fn(row), 0) / records.length : null;
  const full = key => records.filter(row => row[key].every(unit => unit.covered)).length;
  return { cases: records.length, searchSuccess5: mean(row => Number(row.search.success5)), searchSuccess10: mean(row => Number(row.search.success10)),
    searchMRR10: mean(row => row.search.reciprocalRank), requiredFileCoverage10: mean(row => row.search.requiredFileCoverage10),
    initialRequiredSpanCoverage: mean(row => row.initial.filter(unit => unit.covered).length / row.initial.length),
    finalRequiredSpanCoverage: mean(row => row.final.filter(unit => unit.covered).length / row.final.length),
    initialAllRequiredSpans: full('initial'), finalAllRequiredSpans: full('final'),
    interactionTokens: records.reduce((sum, row) => sum + row.cost.tokens, 0),
    interactionBytes: records.reduce((sum, row) => sum + row.cost.bytes, 0),
    expansions: records.reduce((sum, row) => sum + row.cost.expansions, 0),
    searchMs: { p50: percentile(records.map(row => row.timing.searchMs), .5), p95: percentile(records.map(row => row.timing.searchMs), .95) },
    recallMs: { p50: percentile(records.map(row => row.timing.recallMs), .5), p95: percentile(records.map(row => row.timing.recallMs), .95) },
    interactionMs: { p50: percentile(records.map(row => row.timing.interactionMs), .5), p95: percentile(records.map(row => row.timing.interactionMs), .95) },
    partialRetrievalCases: records.filter(row => row.retrieval.status !== 'complete').length,
    provenanceFailures: records.reduce((sum, row) => sum + row.provenanceFailures, 0) };
}
