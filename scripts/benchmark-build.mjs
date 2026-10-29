#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import os from 'node:os';

if (process.argv.length > 2) {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log('Usage: npm run benchmark:build (three clean builds; JUMPYBRAIN_BUILD_MAX_MS defaults to 10000)');
    process.exit(0);
  }
  throw new Error('Usage: npm run benchmark:build; no positional arguments are supported.');
}

// Run sequentially on an idle machine. A generous ceiling catches runaway work;
// timings are intentionally outside the ordinary concurrent test suite.
const runs = 3;
const maxBuildMs = Number(process.env.JUMPYBRAIN_BUILD_MAX_MS ?? 10_000);
if (!Number.isSafeInteger(maxBuildMs) || maxBuildMs <= 0) throw new Error('JUMPYBRAIN_BUILD_MAX_MS must be a positive integer.');
const samplesMs = [];
for (let run = 0; run < runs; run++) {
  const started = performance.now();
  execFileSync('npm', ['run', 'build'], { cwd: new URL('..', import.meta.url), stdio: 'pipe', timeout: maxBuildMs });
  const elapsed = Math.round(performance.now() - started);
  samplesMs.push(elapsed);
  if (elapsed > maxBuildMs) throw new Error(`Build exceeded ${maxBuildMs} ms: ${elapsed} ms.`);
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
  cpu: os.cpus()[0]?.model, samplesMs, medianMs: [...samplesMs].sort((a, b) => a - b)[1], maxBuildMs }, null, 2));
