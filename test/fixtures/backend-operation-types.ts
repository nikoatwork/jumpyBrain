// Compile-only binding: Node's test discovery may load this fixture, but must not load source runtime imports.
declare const localBackendCall: typeof import('../../src/cli/local-transport.js').localBackendCall;
import type { BackendArgs, BackendResult } from '../../src/adapters/backend-protocol.js';

async function check(root: string) {
  const read = await localBackendCall(root, 'readMemoryDocument', ['id']);
  const hash: string = read.contentHash;
  await localBackendCall(root, 'updateMemoryDocument', ['id', 'content', { contentHash: hash }]);
  await localBackendCall(root, 'updateMemoryDocument', ['id', 'content', undefined]);
  await localBackendCall(root, 'indexMemory', []);
  // @ts-expect-error Unknown methods cannot silently dispatch through the typed caller.
  await localBackendCall(root, 'typo', []);
  // @ts-expect-error Required argument cannot be omitted.
  await localBackendCall(root, 'readMemoryDocument', []);
  // @ts-expect-error Positional content is a string, not an options object.
  await localBackendCall(root, 'updateMemoryDocument', ['id', { ifMatch: hash }]);
  // @ts-expect-error Numeric index timeout belongs in an options object.
  await localBackendCall(root, 'indexMemory', [123]);
  // @ts-expect-error A read result is not an arbitrary caller-supplied generic.
  const wrong: number = read;
  // @ts-expect-error A guarded deletion requires explicit apply:true.
  const deletion: BackendArgs<'deleteMemoryDocument'> = ['id', { ifMatch: hash, apply: false }];
  // @ts-expect-error Attention receipts do not promise an ordinary update timestamp.
  const timestamp: string = (null as unknown as BackendResult<'patchMemoryDocumentAttention'>).updatedAt;
}
void check;
