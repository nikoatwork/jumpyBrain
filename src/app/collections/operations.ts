import { randomUUID } from 'node:crypto';
import { parseFrontmatter } from '../../core/frontmatter.js';
import { validateBoards, type Board } from './index.js';

export type BoardPacket = { revision: number; boards: Board[] };
export type BoardChange = {
  action: 'create' | 'update' | 'delete' | 'add' | 'remove';
  selector?: string; name?: string; columns?: string[]; archived?: boolean;
  page?: string; column?: number; definition?: unknown; expectedRevision?: number;
};

export function selectBoard(boards: Board[], selector: string): Board {
  const byId = boards.find(board => board.id === selector);
  if (byId) return byId;
  const matches = boards.filter(board => board.name === selector);
  if (matches.length !== 1) throw new Error(matches.length ? 'Board name is ambiguous. Use its ID from board list.' : 'Board not found. Use board list.');
  return matches[0]!;
}

export function changeBoard(packet: BoardPacket, change: BoardChange): { boards: Board[]; board: Board } {
  if (change.expectedRevision !== undefined && change.expectedRevision !== packet.revision) throw new Error('Boards changed. Read the board again and use its current revision.');
  const boards = validateBoards(packet.boards);
  let board: Board;
  if (change.action === 'create') {
    board = { id: randomUUID(), name: change.name ?? '', archived: false, columns: (change.columns ?? ['To do', 'Doing', 'Done']).map(name => ({ name, pages: [] })) };
    boards.push(board);
  } else board = selectBoard(boards, change.selector!);
  if (change.definition !== undefined) {
    const input = change.definition as Partial<Board>;
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['name', 'archived', 'columns'].includes(key))) throw new Error('Board file accepts only name, archived and columns.');
    Object.assign(board, input);
  }
  if (change.name !== undefined) board.name = change.name;
  if (change.archived !== undefined) board.archived = change.archived;
  if (change.columns) board.columns = change.columns.map((name, i) => ({ name, pages: board.columns[i]?.pages ?? [] }));
  if (change.action === 'add' || change.action === 'remove') {
    if (change.action === 'remove' && !board.columns.some(column => column.pages.includes(change.page!))) throw new Error('Page is not on this board.');
    if (change.action === 'add' && (!Number.isInteger(change.column) || change.column! < 1 || change.column! > 3)) throw new Error('Choose column 1, 2 or 3.');
    for (const column of board.columns) column.pages = column.pages.filter(id => id !== change.page);
    if (change.action === 'add') board.columns[change.column! - 1]!.pages.push(change.page!);
  }
  const validated = validateBoards(boards);
  return { boards: change.action === 'delete' ? validated.filter(item => item.id !== board.id) : validated, board: validated.find(item => item.id === board.id)! };
}

type Document = { id: string; title: string; file: string; content: string; contentHash: string };
export async function boardStatus(board: Board, read: (id: string) => Promise<Document>, limit = 12) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Status limit must be 1–50.');
  let remaining = limit, omittedCards = 0, unavailableCards = 0, truncatedCards = 0;
  const columns = [];
  for (const column of board.columns) {
    const cards = [];
    for (const id of column.pages) {
      if (remaining-- <= 0) { omittedCards++; continue; }
      try {
        const doc = await read(id);
        if (doc.id !== id || typeof doc.content !== 'string' || typeof doc.file !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(doc.contentHash)) throw new Error('Invalid board document response.');
        const parsed = parseFrontmatter(doc.content);
        const lines = parsed.body.split(/\r?\n/);
        if (lines.at(-1) === '') lines.pop();
        const selected: string[] = [];
        let size = 0;
        for (const line of lines) {
          if (size + line.length + 1 > 1000) break;
          selected.push(line); size += line.length + 1;
        }
        const truncated = selected.length < lines.length;
        if (truncated) truncatedCards++;
        cards.push({ id, title: doc.title, availability: 'available', file: doc.file, contentHash: doc.contentHash,
          excerpt: selected.join('\n'), startLine: selected.length ? parsed.bodyStartLine : null,
          endLine: selected.length ? parsed.bodyStartLine + selected.length - 1 : null, truncated,
          writtenAt: parsed.frontmatter.created_at ?? null, updatedAt: parsed.frontmatter.updated_at ?? null });
      } catch (error) {
        const status = (error as { status?: number }).status;
        // Never mask scope/auth failures or unexpected protocol errors as missing notes.
        if (![404, 422, 502, 503, 504].includes(status ?? 0)) throw error;
        unavailableCards++;
        cards.push({ id, availability: status === 404 ? 'missing' : 'unavailable' });
      }
    }
    columns.push({ name: column.name, count: column.pages.length, cards });
  }
  return { id: board.id, name: board.name, archived: board.archived, observedAt: new Date().toISOString(), columns,
    totalCards: board.columns.reduce((n, column) => n + column.pages.length, 0), omittedCards, unavailableCards, truncatedCards,
    partial: omittedCards + unavailableCards + truncatedCards > 0,
    interpretation: 'Column placement is personal organization, not verified completion. Excerpts are current note evidence, not a synthesized initiative assessment.' };
}
