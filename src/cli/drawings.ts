import { open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { constants } from 'node:fs';
import type { ParsedCliArgs } from './args.js';
import { drawingsUsage } from './drawing-args.js';
import { commandMemoryTarget } from './memory-target.js';
import { localBackendCall, createLocalMemoryTransport } from './local-transport.js';
import { listDrawings, readDrawing, DRAWING_MAX_BYTES, type DrawingRecord } from '../runtime/drawings.js';

const resolvePath = (value: string) => path.resolve(value === '~' ? os.homedir() : value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value);
const oneLine = (value: unknown) => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
const MAX_TEXT_LABELS = 50, MAX_LABEL_CHARS = 200;

/** Reads a standard Excalidraw file, or the scene inside a saved `drawings show --json` packet. */
async function sceneFile(filename: string): Promise<unknown> {
  const limit = DRAWING_MAX_BYTES + 1024 * 1024;
  const file = await open(resolvePath(filename), constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit) throw new Error('Drawing file must be a regular JSON file of at most 5 MiB.');
    const bytes = Buffer.alloc(limit + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > limit) throw new Error('Drawing file exceeds 5 MiB.');
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')); }
    catch { throw new Error('Drawing file must contain valid JSON.'); }
    const packet = parsed as Record<string, unknown> | null;
    return packet && typeof packet === 'object' && packet.type !== 'excalidraw' && packet.scene && typeof packet.scene === 'object' ? packet.scene : parsed;
  } finally { await file.close(); }
}

function sceneSummary(record: DrawingRecord) {
  const live = record.scene.elements.filter((element): element is Record<string, unknown> =>
    Boolean(element) && typeof element === 'object' && (element as Record<string, unknown>).isDeleted !== true);
  const types: Record<string, number> = {};
  for (const element of live) { const type = String(element.type ?? 'unknown'); types[type] = (types[type] ?? 0) + 1; }
  const labels = live.filter(element => element.type === 'text' && typeof element.text === 'string' && element.text.trim())
    .map(element => (element.text as string).trim());
  return { elements: live.length, types, labels };
}

export async function drawingsCli(args: ParsedCliArgs): Promise<void> {
  if (args.help) { console.log(drawingsUsage()); return; }
  const command = args._[1]!;
  const scene = command === 'update' ? await sceneFile(String(args.file)) : undefined;
  const target = await commandMemoryTarget(args, createLocalMemoryTransport());
  const name = args.drawing as string | undefined;
  const transport = target.kind === 'remote' ? target.memory : {
    listDrawings: () => listDrawings(target.root),
    readDrawing: (drawing: string) => readDrawing(target.root, drawing),
    saveDrawing: (drawing: string, next: unknown, ifMatch: string) => localBackendCall(target.root, 'saveDrawing', [drawing, next, ifMatch]),
  };
  const brain = target.kind === 'local' ? { kind: 'local', root: target.root } : { kind: 'remote', url: target.url };
  const result: any = command === 'list' ? await transport.listDrawings()
    : command === 'show' ? await transport.readDrawing(name!)
    : await transport.saveDrawing(name!, scene, String(args['if-match']));
  if (args.json) { console.log(JSON.stringify({ brain, ...result }, null, 2)); return; }
  console.log(`Brain: ${oneLine(target.kind === 'local' ? target.root : target.url)}`);
  if (command === 'list') {
    if (!result.drawings.length) console.log('No drawings in drawings/.');
    for (const drawing of result.drawings) console.log(`${oneLine(drawing.name)} · ${drawing.bytes} bytes · updated ${drawing.updatedAt}`);
    if (result.skipped) console.log(`Skipped ${result.skipped} unsupported or excess drawings/ entries.`);
    if (result.drawings.length) console.log('Use drawings show --drawing <name> for labels and the content hash.');
    return;
  }
  const summary = sceneSummary(result);
  console.log(`${command === 'show' ? 'Drawing' : 'Saved drawing'}: ${oneLine(result.name)} · ${result.contentHash} · updated ${result.updatedAt}`);
  console.log(`Elements: ${summary.elements}${summary.elements ? ` (${Object.entries(summary.types).map(([type, count]) => `${oneLine(type)} ${count}`).join(', ')})` : ''}`);
  if (command !== 'show') return;
  if (summary.labels.length) console.log(`Text labels:\n${summary.labels.slice(0, MAX_TEXT_LABELS)
    .map(label => `- ${oneLine(label.length > MAX_LABEL_CHARS ? label.slice(0, MAX_LABEL_CHARS) + '…' : label)}`).join('\n')}`);
  if (summary.labels.length > MAX_TEXT_LABELS) console.log(`(${summary.labels.length - MAX_TEXT_LABELS} more text labels omitted.)`);
  console.log('Use --json for the full scene; update with --if-match set to this hash.');
}
