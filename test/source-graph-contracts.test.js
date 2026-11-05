import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { importSpecifiers, resolveSourceSpecifier, unresolvedRelativeTarget, srcRoot } from './source-graph-helpers.js';

test('source scanner covers literal static, type, re-export and dynamic imports', () => {
  const source = `import './side.js';
import type { Thing } from './types.js';
import { value as renamed } from './value.js';
export { other } from './other.js';
export * from './barrel.js';
const lazy = import('./lazy.js');
const computed = import(variable);`;
  assert.deepEqual(importSpecifiers(source), ['./side.js','./types.js','./value.js','./other.js','./barrel.js','./lazy.js']);
});
test('source resolver retains unresolved internal edges and excludes outside-root paths', () => {
  const from = path.join(srcRoot,'index.ts');
  assert.equal(resolveSourceSpecifier(from,'./runtime/index.js'),path.join(srcRoot,'runtime/index.ts'));
  assert.equal(unresolvedRelativeTarget(from,'./unclassified/missing.js'),'src/unclassified/missing');
  assert.equal(resolveSourceSpecifier(from,'node:fs'),undefined);
  assert.equal(unresolvedRelativeTarget(from,'../integrations/example.js'),undefined);
  assert.equal(unresolvedRelativeTarget(from,'../src-neighbor/example.js'),undefined);
});
