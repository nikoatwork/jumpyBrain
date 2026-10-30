import { MEMORY_DOCUMENT_ID_PATTERN } from '../document-id-format.js';
export type Board = { schemaVersion: 1; id: string; name: string; archived: boolean; columns: { name: string; pages: string[] }[] };
export function validateBoards(value: unknown): Board[] {
  const fail = (): never => { throw new BoardError('invalid_board', 'Invalid board configuration.'); };
  if (!Array.isArray(value) || value.length > 100) return fail();
  const ids = new Set();
  const name = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 100 && !/[\x00-\x1f]/.test(v);
  return value.map(b => {
    if (!b || b.schemaVersion !== 1 || Object.keys(b).some(key => !['schemaVersion', 'id', 'name', 'archived', 'columns'].includes(key)) || typeof b.id !== 'string' || !BOARD_ID_PATTERN.test(b.id) || ids.has(b.id) || !name(b.name) || typeof b.archived !== 'boolean' || !Array.isArray(b.columns) || b.columns.length !== 3) return fail();
    ids.add(b.id); const pages = new Set();
    return { schemaVersion: 1, id: b.id, name: b.name.trim(), archived: b.archived, columns: b.columns.map((c: any) => {
      if (!c || Object.keys(c).some(key => !['name','pages'].includes(key)) || !name(c.name) || !Array.isArray(c.pages) || c.pages.length > 100) return fail();
      for (const id of c.pages) { if (typeof id !== 'string' || !MEMORY_DOCUMENT_ID_PATTERN.test(id) || pages.has(id)) return fail(); pages.add(id); }
      return { name: c.name.trim(), pages: [...c.pages] };
    }) };
  });
}

export const BOARD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export class BoardError extends Error {
  constructor(readonly code: 'invalid_board' | 'board_missing' | 'board_conflict' | 'board_busy' | 'board_unsafe', message: string) { super(message); this.name = 'BoardError'; }
}
export function validateBoard(value: unknown): Board { return validateBoards([value])[0]!; }
export type BoardRecord = { board: Board; contentHash: string };
export type BoardList = { boards: Board[]; hashes: Record<string, string> };
