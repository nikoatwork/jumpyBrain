import { compactSearchMemory } from "../local-memory/compact.js";

/** Keep the local bounded packet intact: no remote metadata envelope after packing. */
export function compactSearchServerMemory(options: {
  root: string;
  query: string;
  limit: number;
  recall?: Parameters<typeof compactSearchMemory>[3];
}): ReturnType<typeof compactSearchMemory> {
  return compactSearchMemory(options.root, options.query, options.limit, { ...options.recall, refresh: false });
}
