import { open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { constants } from 'node:fs';
import type { ParsedCliArgs } from './args.js';
import { boardUsage } from './board-args.js';
import { liveCompanion } from './companion.js';
import { boardStatus, changeBoard, selectBoard, validateBoards, type BoardChange, type BoardPacket } from '../runtime/boards.js';

const resolvePath = (value: string) => path.resolve(value === '~' ? os.homedir() : value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value);
const oneLine = (value: unknown) => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');

async function definitionFile(filename: string): Promise<unknown> {
  const file = await open(resolvePath(filename), constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 32768) throw new Error('Board file must be a regular JSON file of at most 32 KiB.');
    const bytes = Buffer.alloc(32769);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 32768) throw new Error('Board file exceeds 32 KiB.');
    try { return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')); }
    catch { throw new Error('Board file must contain valid JSON.'); }
  } finally { await file.close(); }
}

export async function boardsCli(args: ParsedCliArgs): Promise<void> {
  if (args.help) { console.log(boardUsage()); return; }
  const command = args._[1]!;
  const definition = args.file ? await definitionFile(String(args.file)) : undefined;
  const directory = resolvePath(String(args.directory ?? path.join(os.homedir(), 'Library/Application Support/jumpyBrain Companion')));
  const companion = await liveCompanion(directory, 'board operation', AbortSignal.timeout(60000));
  if (!companion) throw new Error('Open the jumpyBrain Mac app and select a brain to use board commands.');
  const state = await companion.request('/companion/state');
  if (state.boards?.cliVersion !== 1) throw new Error('This Mac app does not support board CLI access. Update the app and CLI together.');
  if (!state.active?.id || !Number.isSafeInteger(state.generation)) throw new Error('Select a brain in the Mac app first.');
  if (args.brain && args.brain !== state.active.id) throw new Error('The requested brain is not selected in the Mac app. No board changes made.');
  const request = (route: string, body?: unknown) => companion.request(route, body, state.generation, state.active.id);
  const readPacket = async (): Promise<BoardPacket> => {
    const packet = await request('/companion/collections');
    if (!Number.isSafeInteger(packet.revision) || packet.revision < 0) throw new Error('Invalid board revision from companion.');
    return { revision: packet.revision, boards: validateBoards(packet.boards) };
  };
  const packet = await readPacket();
  const brain = { id: state.active.id, name: state.active.name, kind: state.active.kind,
    ...(state.active.kind === 'local' ? { root: state.active.root } : { url: state.active.url }) };
  let result: any;
  if (command === 'list') result = { brain, ...packet };
  else if (command === 'show') result = { brain, revision: packet.revision, board: selectBoard(packet.boards, String(args.board)) };
  else if (command === 'status') {
    const board = selectBoard(packet.boards, String(args.board));
    const status = await boardStatus(board, id => request('/memories/all/documents/' + id), Number(args.limit ?? 12));
    // A multi-note read is observational, but never present a changed layout as this revision.
    if ((await readPacket()).revision !== packet.revision) throw new Error('Boards changed during status. Read the board again.');
    result = { brain, revision: packet.revision, ...status };
  } else {
    const change: BoardChange = { action: command as BoardChange['action'], selector: args.board as string | undefined,
      name: args.name as string | undefined, columns: Array.isArray(args.column) ? args.column : undefined,
      ...(args.archived === undefined ? {} : { archived: args.archived === 'true' }), definition,
      page: args.page as string | undefined, column: command === 'add' ? Number(args.column) : undefined,
      expectedRevision: args['if-match'] === undefined ? undefined : Number(args['if-match']) };
    const changed = changeBoard(packet, change);
    const body = { revision: packet.revision, boards: changed.boards };
    if (Buffer.byteLength(JSON.stringify(body)) > 32768) throw new Error('Board save exceeds the companion 32 KiB request limit. Reduce the layout before retrying.');
    const saved = await request('/companion/collections', body);
    result = { brain, revision: saved.revision, board: changed.board, ...(command === 'delete' ? { deleted: true, notesPreserved: true } : {}) };
  }
  if (args.json) { console.log(JSON.stringify(result, null, 2)); return; }
  console.log(`Brain: ${oneLine(brain.name)} (${brain.id}) · board revision ${result.revision}`);
  if (command === 'list') {
    if (!result.boards.length) console.log('No boards. Use jumpybrain board create --name "Initiative".');
    for (const board of result.boards) console.log(`${oneLine(board.name)} [${board.id}]${board.archived ? ' · settled' : ''}: ${board.columns.map((column: any) => `${oneLine(column.name)} ${column.pages.length}`).join(' · ')}`);
  } else if (command === 'status') {
    console.log(`${oneLine(result.name)}${result.archived ? ' · settled' : ''} · ${result.totalCards} cards`);
    for (const column of result.columns) {
      console.log(`\n${oneLine(column.name)} (${column.count})`);
      for (const card of column.cards) {
        console.log(`- ${oneLine(card.title ?? card.id)} [${card.id}] · ${card.availability}`);
        if (card.file) console.log(`  ${oneLine(card.file)}${card.startLine ? `:${card.startLine}-${card.endLine}` : ''} · ${card.contentHash}`);
        if (card.excerpt) console.log(card.excerpt.split('\n').map((line: string) => '  ' + oneLine(line)).join('\n'));
        if (card.truncated) console.log('  [Excerpt incomplete; expand this note for more evidence.]');
      }
    }
    console.log(`\nOmitted cards: ${result.omittedCards}; unavailable: ${result.unavailableCards}; truncated excerpts: ${result.truncatedCards}.`);
    console.log(result.interpretation);
  } else console.log(`${result.deleted ? 'Deleted board (notes preserved)' : command === 'show' ? 'Board' : 'Saved board'}: ${oneLine(result.board.name)} [${result.board.id}]\n${result.board.columns.map((column: any, i: number) => `${i + 1}. ${oneLine(column.name)}: ${column.pages.join(', ') || '(empty)'}`).join('\n')}`);
}
