// Run in a child process: every operation seam fails before touching the host.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import childProcess from 'node:child_process';
import os from 'node:os';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { runCli } from '../../dist/cli/commands.js';
import { commandHelp } from '../../dist/cli/usage.js';

const calls = [];
const deny = name => () => { calls.push(name); throw new Error(`Forbidden help side effect: ${name}`); };
for (const [label, module] of [['fs', fs], ['fsPromises', fsPromises], ['childProcess', childProcess]]) {
  for (const key of Object.keys(module)) {
    if (typeof module[key] === 'function' && /^[a-z]/u.test(key)) module[key] = deny(`${label}.${key}`);
  }
}
os.homedir = deny('home discovery');
process.cwd = deny('cwd discovery');
Object.defineProperty(process, 'stdin', { get: deny('stdin') });
process.env = new Proxy({ ...process.env, JUMPYBRAIN_API_KEY: '', JUMPYBRAIN_CLI_CONFIG: '/unreadable/config.json' }, {
  get(target, key) {
    if (/^(JUMPYBRAIN_|QMD_|HOME$)/u.test(String(key))) return deny(`environment ${String(key)}`)();
    return target[key];
  },
});
net.Socket.prototype.connect = deny('socket connect');
net.Server.prototype.listen = deny('server listen');
tls.connect = deny('tls connect');
for (const module of [http, https]) for (const key of ['request', 'get']) module[key] = deny(`http ${key}`);
globalThis.fetch = deny('fetch');
syncBuiltinESMExports();

const paths = Object.entries(commandHelp).flatMap(([name, help]) => [[name], ...Object.keys(help.children ?? {}).map(child => [name, child])]);
paths.push(['overview'], ['agent-hint'], ['--version'], ['-v']);
let count = 0;
const log = console.log;
try {
  for (const path of paths) {
    let expected;
    for (const argv of [[...path, '--help'], [...path, '-h'], ['help', ...path]]) {
      const lines = [];
      console.log = (...values) => lines.push(values.join(' '));
      await runCli(argv);
      const output = lines.join('\n');
      assert.match(output, /^Usage: jumpybrain /u, argv.join(' '));
      expected ??= output;
      assert.equal(output, expected, argv.join(' '));
      count++;
    }
  }
  for (const path of paths.filter(path => !path[0].startsWith('-'))) {
    const output = [];
    console.log = (...values) => output.push(values.join(' '));
    await runCli([...path, '--root', '--unknown', '--apply', '--target-url', 'https://help.invalid', '--help']);
    assert.match(output.join('\n'), /^Usage:/u);
    count++;
  }
  // Root/no-args and namespace aliases also terminate before parser/config work.
  for (const argv of [[], ['--help'], ['-h'], ['help'], ['board', 'help', 'create'], ['run', 'help', 'memory:recall']]) {
    console.log = () => {};
    await runCli(argv);
    count++;
  }
  for (const argv of [['typo', '--help'], ['help', 'board', 'typo'], ['run', 'memory:typo', '-h'], ['help', 'run', 'memory:status', 'extra']]) {
    await assert.rejects(runCli(argv), /Unknown (help command|recipe)/u);
    count++;
  }
  assert.deepEqual(calls, [], 'help must never attempt an operation, even if an error is caught');
} finally { console.log = log; }
console.log(JSON.stringify({ cases: count, sideEffects: calls }));
