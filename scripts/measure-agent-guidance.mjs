#!/usr/bin/env node
// Byte accounting, not a tokenizer or a model-efficiency claim. No memory operations.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { formatHumanResults } from '../dist/cli/formatting.js';
import { packCompactRecall, serializeCompactRecall } from '../dist/core/retrieval-policy/compact.js';
const baseline = process.argv[2] ?? 'fc6f8594eb8bd30fb91a946f46498c5e66a1d8d4';
const old = file => execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' });
const current = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
async function instructions(source) {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
  return (await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))).agentInstructions;
}
const before = await instructions(old('src/cli/instructions.ts')), after = await instructions(current('src/cli/instructions.ts'));
const bytes = text => Buffer.byteLength(text, 'utf8');
const render = source => source.replaceAll('__JUMPYBRAIN_CLI_COMMAND__', "'/fixture/bin/jumpybrain'").replaceAll('__JUMPYBRAIN_ROOT_ARGUMENT__', "'/fixture/memory'").replaceAll('__JUMPYBRAIN_CLI__', '/fixture/bin/jumpybrain').replaceAll('__JUMPYBRAIN_MEMORY_ROOT__', '/fixture/memory');
const skillBefore = render(old('skills/jumpybrain-memory/SKILL.md')), skillAfter = render(current('skills/jumpybrain-memory/SKILL.md'));
const dreamBefore = old('skills/how-to-dream/SKILL.md'), dreamAfter = current('skills/how-to-dream/SKILL.md');
const comparison = (before, after) => ({ before: bytes(before), after: bytes(after), delta: bytes(after) - bytes(before) });
const journeys = {
  // Full guidance acquisition, including follow-up topic reads once per journey.
  recall: ['recall'],
  'recall-expand-continue': ['recall', 'expand'],
  'recall-remember-pending-index': ['recall', 'write'],
  'recall-dream-check-update': ['maintenance'],
};
const variants = {};
for (const [name, topics] of Object.entries(journeys)) {
  const dream = name.includes('dream');
  const details = topics.map(topic => after(topic) + '\n').join('');
  variants[name] = {
    cli: comparison(before() + '\n' + (dream ? dreamBefore : ''), after() + '\n' + details + (dream ? dreamAfter : '')),
    installedSkill: comparison(skillBefore + (dream ? dreamBefore : ''), skillAfter + details + (dream ? dreamAfter : '')),
  };
}
// Matched one-passage representation costs; same exact evidence and source coordinates.
// Readiness/handles differ by supported contract, so compare payload sizes, not information parity.
const snippet = "Approved only in sandbox. NOT approved for production.";
const result = { id: "chunk-1", score: 0.75, snippet,
  provenance: { file: "notes/trial.md", lineStart: 1, lineEnd: 2 } };
const envelope = { query: "approval", depth: "normal", readiness: { freshness: "fresh", modes: ["lexical"], embedding: "disabled" }, retrieval: { status: "complete", warnings: [] } };
const compact = packCompactRecall(envelope, [{ passages: [{ filePath: result.provenance.file, pathBasis: "canonical_root", startLine: 1, endLine: 2, text: snippet, scope: "excerpt", partial: true,
  date: { basis: "unknown" }, expansion: { available: false, reason: "missing_id" } }] }]);
const outputs = { text: formatHumanResults([result]) + "\n", rich: JSON.stringify({ root: "/fixture/memory", query: "approval", depth: "normal", results: [result], mode: "search" }, null, 2) + "\n", compact: serializeCompactRecall(compact) };
const matchedRecall = Object.fromEntries(Object.entries(outputs).map(([format, output]) => [format, {
  outputBytes: bytes(output),
  // Commands/results are fixed on both revisions: full interaction delta equals guidance delta.
  cliGuidanceAndResult: comparison(before() + "\n" + output, after() + "\n" + after("recall") + "\n" + output),
  skillGuidanceAndResult: comparison(skillBefore + output, skillAfter + after("recall") + "\n" + output),
}]));
console.log(JSON.stringify({ baseline, unit: 'UTF-8 bytes', tokenizer: null,
  limits: 'No pinned tokenizer in project dependencies; no tiktoken in the checked Python environment. These are exact guidance bytes, not token estimates. Unchanged command/result payloads are excluded; no latency, model activation or answer-quality claim. Topics are read once per journey; command help or repeated reads add cost. Fixtures use local paths; remote guidance is identical and explicitly replaces --root with --target-url.',
  initial: { cli: comparison(before() + '\n', after() + '\n'), installedSkill: comparison(skillBefore, skillAfter) },
  matchedRecall,
  full: comparison(before() + '\n', after('all') + '\n'), journeys: variants,
}, null, 2));
