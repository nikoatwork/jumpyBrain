#!/usr/bin/env node
// Thin Node adapter over the installation policy, never the canonical-memory engine.
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const helper = fileURLToPath(new URL('../integrations/electron/installation-retention.py', import.meta.url));
export function softwareStorage(operation, options = {}) {
  const result = spawnSync('python3', ['-B', helper], {
    input: JSON.stringify({ operation, home: os.homedir(), root: path.join(os.homedir(), '.jumpybrain'), ...options }),
    encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`Software retention deferred: ${(result.stderr || result.error?.message || 'helper unavailable').slice(-1200)}`);
  return JSON.parse(result.stdout);
}
export function maintainSoftware(options = {}) {
  try { return softwareStorage('apply', options); }
  catch (error) { console.error(error.message); return { deferred: true, reason: error.message }; }
}
export function finishSoftware(generation, options = {}) {
  try { return softwareStorage('finish', { generation, ...options }); }
  catch (error) { console.error(error.message); return null; }
}

function main(args) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/installation-storage.mjs [--preview | --apply] [--home <home>] [--install-root <root>]\nPreview is observational (the default). Apply replans under the shared installer lock.\nOnly receipt-owned software is eligible; unknown historical copies require explicit inspection.'); return;
  }
  let operation = 'preview', home = os.homedir(), root, selected = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--apply', '--preview'].includes(arg)) {
      if (selected) throw new Error('Choose either --preview or --apply.');
      operation = arg.slice(2); selected = true;
    } else if (['--home', '--install-root'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (arg === '--home') home = path.resolve(args[++i]); else root = path.resolve(args[++i]);
    } else throw new Error('Unknown storage option; use --help.');
  }
  console.log(JSON.stringify(softwareStorage(operation, { home, root: root || path.join(home, '.jumpybrain') }), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
