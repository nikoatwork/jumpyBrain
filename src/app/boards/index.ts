import { discoverCanonicalMemoryDocumentsById } from '../../core/canonical/index.js';
import { readBoardFile, listBoardFiles, saveBoardFile, deleteBoardFile } from '../../core/boards/store.js';
import { BoardError } from '../../core/boards/model.js';
import { boardStatus } from './operations.js';
export { readBoardFile as readBoard, listBoardFiles as listBoards, saveBoardFile as saveBoard, deleteBoardFile as deleteBoard };
export { BoardError, validateBoards, validateBoard, type Board, type BoardRecord, type BoardList } from '../../core/boards/model.js';
export { changeBoard, selectBoard, type BoardChange } from './operations.js';

export async function getBoardStatus(root: string, id: string, limit = 12, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new BoardError('invalid_board', 'Status limit must be 1–50.');
  const record = await readBoardFile(root, id);
  const ids = record.board.columns.flatMap(column => column.pages).slice(0, limit);
  const discovery = await discoverCanonicalMemoryDocumentsById(root, ids, signal);
  const status = await boardStatus(record.board, async noteId => {
    try { return await discovery.read(noteId, { guarded: true, signal }); }
    catch (error) {
      if ((error as {code?: string}).code === 'missing_id') throw Object.assign(new Error('Missing note.'), {status:404});
      throw error;
    }
  }, limit);
  if ((await readBoardFile(root, id)).contentHash !== record.contentHash) throw new BoardError('board_conflict', 'Board changed during status. Read it again.');
  return { ...status, contentHash: record.contentHash };
}
