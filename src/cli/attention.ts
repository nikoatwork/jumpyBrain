import type { ParsedCliArgs } from './args.js';
import { commandMemoryTarget } from './memory-target.js';
import { createLocalMemoryTransport, localBackendCall } from './local-transport.js';
import { listMemoryAttention, patchMemoryDocumentAttention } from '../runtime/index.js';
import type { MemoryAttentionAction } from '../core/attention.js';

const oneLine = (value: unknown) => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
export async function attentionCli(args: ParsedCliArgs): Promise<void> {
  const command = args._[1];
  const target = await commandMemoryTarget(args, createLocalMemoryTransport());
  let result;
  if (command === 'list') {
    const packet = target.kind === 'remote' ? await target.memory.listMemoryAttention() : await listMemoryAttention(target.root);
    result = { ...packet, omittedNotes: Math.max(0, packet.total - packet.notes.length),
      omittedSettled: Math.max(0, packet.settledTotal - packet.settled.length),
      interpretation: 'Attention is resurfacing state, not read or approval status. Missing creator declarations are unknown.' };
    if (args.json) { console.log(JSON.stringify(result, null, 2)); return; }
    for (const note of result.notes) console.log(`${oneLine(note.title)} [${note.id}] · ${oneLine(note.creator?.name ?? note.creator?.kind ?? 'unknown creator')}`);
    console.log(`Resurfacing: ${packet.total}; settled: ${packet.settledTotal}; omitted: ${result.omittedNotes} active, ${result.omittedSettled} settled.`);
    if (packet.nextWakeAt) console.log(`Next scheduled return: ${packet.nextWakeAt}`);
    console.log(result.interpretation);
    return;
  }
  const mutation: MemoryAttentionAction = command === 'bring-back' ? { action: 'reactivate' }
    : command === 'snooze' ? { action: 'snooze', until: String(args.until) } : { action: 'settle' };
  const options = { ifMatch: String(args['if-match']), mutation };
  result = target.kind === 'remote' ? await target.memory.patchMemoryDocumentAttention(String(args.id), options)
    : await localBackendCall<Awaited<ReturnType<typeof patchMemoryDocumentAttention>>>(target.root, 'patchMemoryDocumentAttention', [String(args.id), options]);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Attention ${command === 'bring-back' ? 'reactivated' : command === 'snooze' ? 'snoozed' : 'settled'}: ${args.id}. Canonical state saved; indexing pending.`);
}
