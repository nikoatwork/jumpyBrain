import { MEMORY_DOCUMENT_ID_PATTERN } from '../../core/document-id-format.js';
export type Board = { id: string; name: string; archived: boolean; columns: { name: string; pages: string[] }[] };
export function validateBoards(value: unknown): Board[] {
  const fail = () => { throw new Error('Invalid board configuration.'); };
  if (!Array.isArray(value) || value.length > 100) return fail();
  const ids = new Set();
  const name = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 100 && !/[\x00-\x1f]/.test(v);
  return value.map(b => {
    if (!b || typeof b.id !== 'string' || !/^[a-f0-9-]{36}$/.test(b.id) || ids.has(b.id) || !name(b.name) || typeof b.archived !== 'boolean' || !Array.isArray(b.columns) || b.columns.length !== 3) return fail();
    ids.add(b.id); const pages = new Set();
    return { id: b.id, name: b.name.trim(), archived: b.archived, columns: b.columns.map((c: any) => {
      if (!c || !name(c.name) || !Array.isArray(c.pages) || c.pages.length > 100) return fail();
      for (const id of c.pages) { if (typeof id !== 'string' || !MEMORY_DOCUMENT_ID_PATTERN.test(id) || pages.has(id)) return fail(); pages.add(id); }
      return { name: c.name.trim(), pages: [...c.pages] };
    }) };
  });
}
