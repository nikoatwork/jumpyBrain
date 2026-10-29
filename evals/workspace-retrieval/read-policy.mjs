// Evaluation-only: returned packet order/handles, never gold or source contents.
export function chooseSpreadExpansions(packet, limit = 3) {
  const seen = new Set();
  const sources = packet.passages.filter(passage => {
    if (!passage.expansion.available || seen.has(passage.expansion.id)) return false;
    seen.add(passage.expansion.id);
    return true;
  });
  const selected = sources.length <= limit ? sources
    : limit <= 0 ? [] : [...sources.slice(0, limit - 1), sources.at(-1)];
  return selected.map(({ expansion }) => ({ id: expansion.id,
    expectedContentHash: expansion.expectedContentHash, startLine: 1, maxBytes: 8192 }));
}

// Same selected sources as baseline; only the start range changes. No gold,
// source loading, query-specific rules, extra reads or cross-source exploration.
export function chooseCitedExpansions(packet, limit = 3) {
  const seen = new Set();
  return packet.passages.flatMap(passage => {
    if (!passage.expansion.available || seen.has(passage.expansion.id)) return [];
    seen.add(passage.expansion.id);
    return [{ id: passage.expansion.id, expectedContentHash: passage.expansion.expectedContentHash,
      startLine: Math.max(1, passage.startLine - 8), maxBytes: 8192 }];
  }).slice(0, limit);
}
