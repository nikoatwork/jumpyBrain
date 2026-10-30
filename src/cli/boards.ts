import { open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { constants } from 'node:fs';
import type { ParsedCliArgs } from './args.js';
import { boardUsage } from './board-args.js';
import { commandMemoryTarget } from './memory-target.js';
import { createLocalMemoryTransport } from './local-transport.js';
import { listBoards, saveBoard, deleteBoard, getBoardStatus, changeBoard, selectBoard, type BoardChange } from '../runtime/boards.js';

const resolvePath = (value: string) => path.resolve(value === '~' ? os.homedir() : value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value);
const oneLine = (value: unknown) => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');

async function definitionFile(filename: string): Promise<unknown> {
  const file = await open(resolvePath(filename), constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 65536) throw new Error('Board file must be a regular JSON file of at most 64 KiB.');
    const bytes = Buffer.alloc(65537);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 65536) throw new Error('Board file exceeds 64 KiB.');
    try { return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')); }
    catch { throw new Error('Board file must contain valid JSON.'); }
  } finally { await file.close(); }
}

export async function boardsCli(args: ParsedCliArgs): Promise<void> {
  if (args.help) { console.log(boardUsage()); return; }
  const command = args._[1]!;
  const definition = args.file ? await definitionFile(String(args.file)) : undefined;
  const target = await commandMemoryTarget(args, createLocalMemoryTransport());
  const transport = target.kind === 'remote' ? target.memory : {
    listBoards: () => listBoards(target.root),
    saveBoard: (board: Parameters<typeof saveBoard>[1], ifMatch?: string) => saveBoard(target.root, board, ifMatch),
    deleteBoard: (id: string, ifMatch: string) => deleteBoard(target.root, id, ifMatch),
    getBoardStatus: (id: string, limit: number) => getBoardStatus(target.root, id, limit),
  };
  const packet = await transport.listBoards();
  const brain = target.kind === 'local' ? {kind:'local',root:target.root} : {kind:'remote',url:target.url};
  let result: any;
  if (command === 'list') result = { brain, ...packet };
  else if (command === 'show') {
    const board = selectBoard(packet.boards, String(args.board));
    result = { brain, board, contentHash: packet.hashes[board.id] };
  } else if (command === 'status') {
    const board = selectBoard(packet.boards, String(args.board));
    result = { brain, ...await transport.getBoardStatus(board.id, Number(args.limit ?? 12)) };
  } else {
    const change: BoardChange = { action: command as BoardChange['action'], selector: args.board as string | undefined,
      name: args.name as string | undefined, columns: Array.isArray(args.column) ? args.column : undefined,
      ...(args.archived === undefined ? {} : { archived: args.archived === 'true' }), definition,
      page: args.page as string | undefined, column: command === 'add' ? Number(args.column) : undefined };
    const changed = changeBoard(packet, change);
    const ifMatch = args['if-match'] as string | undefined;
    if (command !== 'create' && packet.hashes[changed.board.id] !== ifMatch) throw new Error('Board changed. Read it again and use its current content hash.');
    result = command === 'delete' ? {brain, board:changed.board, ...await transport.deleteBoard(changed.board.id, ifMatch!)}
      : {brain, ...await transport.saveBoard(changed.board, ifMatch)};
  }
  if (args.json) { console.log(JSON.stringify(result, null, 2)); return; }
  console.log(`Brain: ${oneLine(brain.root ?? brain.url)}${result.contentHash ? " · " + result.contentHash : ""}`);
  if (command === 'list') {
    if (!result.boards.length) console.log('No boards. Use board create --name "Initiative" with this root/target.');
    for (const board of result.boards) console.log(`${oneLine(board.name)} [${board.id}]${board.archived ? ' · settled' : ''} · ${result.hashes[board.id]}: ${board.columns.map((column: any) => `${oneLine(column.name)} ${column.pages.length}`).join(' · ')}`);
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
