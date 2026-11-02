// Child process, imported before denying operational seams. Uses only a disposable root.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import promises from 'node:fs/promises';
import childProcess from 'node:child_process';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { processMemory } from '../../dist/index.js';
import { createLocalMemoryTransport } from '../../dist/cli/local-transport.js';
import { runCli } from '../../dist/cli/commands.js';

const root = process.argv[2];
// node --test also discovers fixture modules; only the owning test supplies a root.
if (!root) process.exit(0);
const calls = [];
const deny = name => () => { calls.push(name); throw new Error('Forbidden preview operation: ' + name); };
for (const [label, module] of [['fs', fs], ['promises', promises]]) {
  for (const key of Object.keys(module)) if (/^(?:append|chmod|chown|copy|cp|fchmod|fchown|fdatasync|fsync|ftruncate|futimes|link|mkdir|mkdtemp|open|rename|rm|rmdir|symlink|truncate|unlink|utimes|write|createWriteStream)/.test(key)) module[key] = deny(label + '.' + key);
}
for (const key of ['spawn', 'spawnSync', 'fork', 'exec', 'execSync', 'execFile', 'execFileSync']) childProcess[key] = deny(key);
net.Socket.prototype.connect = deny('connect');
net.Server.prototype.listen = deny('listen');
globalThis.fetch = deny('fetch');
syncBuiltinESMExports();
const options = { mode: 'lint', topic: 'Quartz ledger', limit: 1, preview: true };
const result = await processMemory(root, options);
assert.equal(result.applied, false);
assert.deepEqual(result.files, []);
assert.equal(result.runId, undefined);
assert.equal(result.scope.inspected, 1);
assert.equal(result.scope.eligible, 2);
assert.ok(result.issues.length > 0);
assert.match(result.summary.join('\n'), /1 omitted.*comparisons use 2/);
assert.deepEqual(await createLocalMemoryTransport().processMemory(root, options), result);
const log = console.log, output = [];
try {
  console.log = value => output.push(value);
  for (const prefix of [['process'], ['run', 'memory:process']]) {
    output.length = 0;
    await runCli([...prefix, '--root', root, '--mode', 'lint', '--topic', 'Quartz ledger', '--limit', '1', '--preview', '--json']);
    assert.deepEqual(JSON.parse(output.join('\n')), JSON.parse(JSON.stringify(result)));
  }
} finally { console.log = log; }
assert.deepEqual(calls, []);
console.log(JSON.stringify({ issueCount: result.issueCount, calls }));
