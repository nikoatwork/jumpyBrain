// Validate the fields used to recognize canonical success. Additive envelope
// fields remain compatible; this is not a second complete protocol schema.
export const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const hash = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const text = (value: unknown) => typeof value === "string";
export function validDocumentRead(value: Record<string, unknown>, id: string): boolean {
  return value.id === id && text(value.file) && text(value.title) && text(value.type)
    && record(value.frontmatter) && text(value.content) && hash(value.contentHash);
}
export function validDocumentUpdate(value: Record<string, unknown>, id: string, ifMatch: string): boolean {
  return value.id === id && text(value.file) && value.oldContentHash === ifMatch && hash(value.oldContentHash)
    && hash(value.newContentHash) && text(value.updatedAt) && typeof value.indexed === "boolean";
}
export function validBoardReceipt(value: Record<string, unknown>, id: string): boolean {
  const board = value.board;
  return hash(value.contentHash) && record(board) && board.id === id && board.schemaVersion === 1
    && text(board.name) && typeof board.archived === "boolean" && Array.isArray(board.columns)
    && board.columns.length === 3 && board.columns.every(column => record(column) && text(column.name)
      && Array.isArray(column.pages) && column.pages.every(text));
}
