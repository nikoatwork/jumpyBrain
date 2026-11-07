/** Similarity is a suggestion, never a canonical reference or confidence probability. */
export const SEMANTIC_LINK_POLICY = Object.freeze({ minSimilarity: 0.7, neighbors: 3, maxDocuments: 1000, maxChunksPerDocument: 64, maxChunks: 8192, maxDimensions: 4096 });
export interface DocumentVector { file: string; vector: Float32Array }
export interface SemanticLink { source: string; target: string; similarity: number }

/** Normalized mean of complete document chunks; never silently truncate a long document. */
export function meanDocumentVector(chunks: readonly Float32Array[]): Float32Array | undefined {
  const size = chunks[0]?.length ?? 0;
  if (!size || size > SEMANTIC_LINK_POLICY.maxDimensions || chunks.length > SEMANTIC_LINK_POLICY.maxChunksPerDocument) return;
  const mean = new Float32Array(size);
  for (const chunk of chunks) {
    if (chunk.length !== size) return;
    let norm = 0;
    for (const value of chunk) { if (!Number.isFinite(value)) return; norm += value * value; }
    if (!norm) return;
    for (let i = 0; i < size; i++) mean[i] += chunk[i]! / Math.sqrt(norm);
  }
  const norm = Math.sqrt(mean.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return;
  return mean.map(value => value / norm);
}

/** Exact cosine within the supplied bounded pool, mutual top-k, stable ties. */
export function strongSemanticLinks(input: readonly DocumentVector[]): SemanticLink[] {
  if (input.length > SEMANTIC_LINK_POLICY.maxDocuments) throw new Error("Semantic graph document budget exceeded");
  const documents = [...input].sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  const neighbors = documents.map(() => [] as Array<{ index: number; similarity: number }>);
  const admit = (source: number, target: number, similarity: number) => {
    const list = neighbors[source]!;
    list.push({ index: target, similarity });
    list.sort((a, b) => b.similarity - a.similarity || a.index - b.index);
    if (list.length > SEMANTIC_LINK_POLICY.neighbors) list.pop();
  };
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i]!, b = documents[j]!;
    if (a.file === b.file || a.vector.length !== b.vector.length) continue;
    let similarity = 0;
    for (let k = 0; k < a.vector.length; k++) similarity += a.vector[k]! * b.vector[k]!;
    if (!Number.isFinite(similarity) || similarity < SEMANTIC_LINK_POLICY.minSimilarity) continue;
    similarity = Math.min(1, similarity);
    admit(i, j, similarity); admit(j, i, similarity);
  }
  return neighbors.flatMap((list, source) => list.flatMap(({ index: target, similarity }) =>
    target > source && neighbors[target]!.some(item => item.index === source)
      ? [{ source: documents[source]!.file, target: documents[target]!.file, similarity: Math.round(similarity * 10000) / 10000 }] : []));
}
