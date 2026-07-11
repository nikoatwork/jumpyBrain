import { randomUUID } from "node:crypto";

export const MEMORY_DOCUMENT_ID_PATTERN = /^mem_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function generateMemoryDocumentId(): string {
  return `mem_${randomUUID()}`;
}

export function isValidMemoryDocumentId(value: unknown): value is string {
  return typeof value === "string" && MEMORY_DOCUMENT_ID_PATTERN.test(value);
}
