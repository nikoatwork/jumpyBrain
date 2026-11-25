import path from 'node:path';
import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
export const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
// Homebrew upgrades replace a versioned Cellar keg and the shared libraries it
// links, so a pinned Cellar path can exist yet fail to load. Pin the formula's
// stable opt link instead, but only when it resolves to this exact executable.
// Every other Node (private runtime, version managers, system) keeps its path.
export function durableNode(executable = process.execPath, { resolve = realpathSync } = {}) {
  const match = /^(.+)\/Cellar\/(node(?:@\d+)?)\/[^/]+\/bin\/node$/.exec(executable);
  if (!match) return executable;
  const stable = `${match[1]}/opt/${match[2]}/bin/node`;
  try { return resolve(stable) === resolve(executable) ? stable : executable; } catch { return executable; }
}
export const NODE_READY_PROBE = 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)';
// Existence is not enough: the dynamic loader can still refuse the executable.
export function nodeRuns(node, { probe = spawnSync } = {}) {
  if (typeof node !== 'string' || !path.isAbsolute(node)) return false;
  const result = probe(node, ['-e', NODE_READY_PROBE], { stdio: 'ignore', timeout: 15000 });
  return !result.error && result.status === 0;
}
export function cliShim({ appDir, cliConfigPath, node = durableNode(), qmd }) {
  return ['#!/usr/bin/env sh', `export PATH=${shellQuote(path.dirname(node))}:"$PATH"`,
    'if [ -z "${JUMPYBRAIN_CLI_CONFIG+x}" ]; then', `  export JUMPYBRAIN_CLI_CONFIG=${shellQuote(cliConfigPath)}`, 'fi',
    ...(qmd ? ['if [ -z "${JUMPYBRAIN_QMD_BIN:-}" ]; then', `  export JUMPYBRAIN_QMD_BIN=${shellQuote(qmd)}`, 'fi'] : []),
    `exec ${shellQuote(node)} ${shellQuote(path.join(appDir, 'dist/cli.js'))} "$@"`, ''].join('\n');
}
