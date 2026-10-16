// Pure document identity format, also safe for browser bundles.
export const MEMORY_DOCUMENT_ID_PATTERN = /^mem_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidMemoryDocumentId(value: unknown): value is string {
  return typeof value === "string" && MEMORY_DOCUMENT_ID_PATTERN.test(value);
}
