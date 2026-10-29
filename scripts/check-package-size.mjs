#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { validatePackageBudget } from './package-budget.mjs';
import { validateLocalPackFiles } from './local-pack-manifest.mjs';

const [info] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 60_000, maxBuffer: 10 * 1024 * 1024,
}));
validateLocalPackFiles(info.files.map(file => `package/${file.path}`));
console.log(JSON.stringify(validatePackageBudget(info), null, 2));
