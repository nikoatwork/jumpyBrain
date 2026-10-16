import { randomUUID } from "node:crypto";
export { MEMORY_DOCUMENT_ID_PATTERN, isValidMemoryDocumentId } from "./document-id-format.js";

export function generateMemoryDocumentId(): string {
  return `mem_${randomUUID()}`;
}
