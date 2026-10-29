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
