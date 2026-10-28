#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name || !/^[\w-]+$/.test(name)) throw new Error('Pass a completed run name.');
const dir = path.join(here, '.runs', name);
const raw = JSON.parse(await readFile(path.join(dir, 'REPORT.json'), 'utf8'));
const lifecycle = JSON.parse(await readFile(path.join(dir, 'lifecycle.json'), 'utf8'));
const pack = JSON.parse(await readFile(path.join(dir, 'pack-audit.json'), 'utf8'));
const first = raw.reports.filter(r => r.repeat === 1);
const archive = process.argv[3];
let archiveHash;
if (archive) { const hash = createHash('sha256'); for await (const bytes of createReadStream(archive)) hash.update(bytes); archiveHash = hash.digest('hex'); }
const pct = n => `${(Math.round(n * 1000) / 10).toFixed(1)}%`;
const report = { protocol: raw.manifest.protocol, sourceCommit: raw.manifest.sourceCommit, productDigest: raw.manifest.productDigest,
  inputDigest: raw.manifest.inputDigest, freezeSha256: raw.freezeSha256, sourceUnchanged: raw.manifest.sourceUnchanged,
  corpus: { documents: 160, cases: 80, development: 24, reserved: 56, scenarios: 10 },
  tokenizer: raw.manifest.tokenizer, qmd: raw.manifest.qmd, model: raw.manifest.model, environment: { node: raw.manifest.node, ...raw.manifest.os },
  comparisons: raw.comparisons, runObservations: raw.reports.map(r => ({ mode: r.mode, repeat: r.repeat, searchMs: r.overall.searchMs, recallMs: r.overall.recallMs, interactionMs: r.overall.interactionMs, observedProcessTree: r.observedProcessTree })), modes: first.map(({ mode, overall, navigation, development, reserved, byJourney, index, observedProcessTree, records }) => ({
    mode, overall, navigation, development, reserved, byJourney,
    answerableOnly: { cases: records.filter(r => r.answerability === 'answerable').length, allRequiredSpans: records.filter(r => r.answerability === 'answerable' && r.final.every(u => u.covered)).length },
    unknownApprover: { cases: records.filter(r => r.answerability === 'unknown_approver').length, explicitUnknownRecordShown: records.filter(r => r.answerability === 'unknown_approver' && r.final.every(u => u.covered)).length, actualAbstention: 'not evaluated' },
    index: { initialMs: index.initialIndex.ms, noOpMs: index.noOpIndex.ms, initialWork: index.initialIndex.value.work, noOpWork: index.noOpIndex.value.work, databaseBytes: index.databaseBytes,
      readiness: index.initialIndex.value.readiness }, observedProcessTree,
    warningCounts: Object.fromEntries([...new Set(records.flatMap(r => r.retrieval.warnings))].map(w => [w, records.filter(r => r.retrieval.warnings.includes(w)).length])),
    records: records.map(({ timing, ...r }) => r) })),
  lifecycle, packaging: pack, archive: archive ? { path: archive, sha256: archiveHash, excludes: 'rebuildable memory roots/indexes' } : null,
  supplementalTools: Object.fromEntries(await Promise.all(['report.mjs', 'check-lifecycle.mjs'].map(async file => [file, createHash('sha256').update(await readFile(path.join(here, file))).digest('hex')]))),
  limits: [...raw.limits, 'Navigation cases are exact checklist-title queries; alias/partial-title/identifier navigation is not measured by that 10/10 result.',
    'All scenarios share dates and structural templates; duplicated scaffolding may amplify cross-project distractors.',
    'The 160 pages contain about 27,600 words (157–192 whitespace-separated words per page, including frontmatter); long-document and large-workspace quality are not measured.',
    'Supplemental lexical lifecycle/parity checks overlapped part of the first semantic pass; timing is not an isolated performance comparison.',
    'Historical cases supply explicit upper bounds; natural-language date resolution is not evaluated.',
    'The fixed first-three whole-document read policy does not follow source links and is not a model of optimal agent behavior.',
    'Evidence rubrics require specified original-source clauses; alternative sufficient wording/sources can be missed.',
    'Latency and RSS are observational, not quiet-window experiment acceptance evidence.'] };
const rows = first.map(r => `| ${r.mode} | ${r.navigation.searchSuccess5 * 10}/10 | ${pct(r.overall.searchSuccess5)} | ${pct(r.overall.initialRequiredSpanCoverage)} | ${pct(r.overall.finalRequiredSpanCoverage)} | ${r.overall.finalAllRequiredSpans}/80 | ${Math.round(r.overall.interactionTokens / 80).toLocaleString('en-US')} |`).join('\n');
const journeyRows = Object.keys(first[0].byJourney).map(j => `| ${j} | ${first.map(r => `${r.byJourney[j].finalAllRequiredSpans}/10 (${pct(r.byJourney[j].finalRequiredSpanCoverage)} coverage)`).join(' | ')} |`).join('\n');
const diagnostic = first.map(r => {
  const failed = r.records.filter(x => !x.final.every(u => u.covered));
  const unvisited = failed.filter(x => x.diagnosis === 'required_file_not_in_search10').length;
  return `- **${r.mode}:** ${failed.length} incomplete cases; ${unvisited} have a required source absent from the separate search top ten, and ${failed.length - unvisited} have the required files in search top ten but incomplete displayed recall/read evidence. Top-ten absence does not distinguish candidate-generation failure from low rank. Follow-up reads complete ${r.overall.finalAllRequiredSpans - r.overall.initialAllRequiredSpans} additional tasks.`;
}).join('\n');
const md = `# Workspace retrieval baseline v1 — 2026-10-28

This is a real QMD-backed evaluation of unchanged jumpyBrain retrieval, over 160 fictional pages and 80 authored tasks. **These are source-verified required-span scores, not answer accuracy or an independent user study.** No answer agent or retrieval experiment ran.

## Baseline scorecard

| Mode | Named-page hit@5 | Any required source hit@5, all queries | Initial unit coverage | Unit coverage after reads | All required spans after reads | Mean interaction tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

The all-query source-hit diagnostic needs only one useful source; multi-source tasks can still lack necessary evidence. Navigation's ten exact-title cases are an easier separate task, not general search accuracy. Unit coverage is macro-averaged per task; complete-span count requires every unit. Both include the ten questions whose correct evidence says the approver is unknown.

| Journey | ${first.map(r => r.mode + ' complete / unit coverage').join(' | ')} |
| --- | ${first.map(() => '---:').join(' | ')} |
${journeyRows}

## Reproduction and identity

- Source commit: \`${raw.manifest.sourceCommit}\`; production source unchanged: **${raw.manifest.sourceUnchanged}**. The eval/package/docs edits are identified separately; the baseline is not a claim that the whole working tree was clean.
- Product SHA-256 file-map digest: \`${raw.manifest.productDigest}\`.
- Eval input-map digest: \`${raw.manifest.inputDigest}\`; complete freeze file SHA-256: \`${raw.freezeSha256}\`.
- ${raw.manifest.node}, ${raw.manifest.os.platform}/${raw.manifest.os.arch}, ${raw.manifest.os.cpu}; pinned QMD ${raw.manifest.qmd.version}. Tokenizer: js-tiktoken 1.0.21 / cl100k_base, concatenated serialized response/request streams counted separately; these are not provider billing tokens.
- Model: ${raw.manifest.model?.name ?? 'none'}, ${raw.manifest.model?.bytes ?? 0} bytes, SHA-256 \`${raw.manifest.model?.sha256 ?? 'n/a'}\`; lexical never uses it. Models/native runtime were already provisioned; execution blocked downloads and source builds.
- ${raw.comparisons.map(c => `${c.mode}: ${c.repeats} clean-root repetitions, identical per-case non-timing scores/costs: **${c.deterministicScoresAndCosts}**`).join('; ')}.
- See [the protocol](../PROTOCOL.md), [run guide](../README.md), [compact machine-readable report](2026-10-28-baseline-v1.json) and [full input/runtime map](2026-10-28-baseline-v1.freeze.json).

\`npm run eval:workspace -- --modes lexical,semantic --model /absolute/provisioned/embedding.gguf --repeats 2 --name unique-name\` reruns both modes after the documented build/dependency setup. It creates a fresh ignored root and refuses an existing run name. A lexical-only rerun requires no model/API credentials.

## Failure inventory and interpretation

${diagnostic}

Packet inspection found three distinct mechanisms: unrelated projects consuming early slots; relevant original sources ranking below recall's smaller file limit; and source text/qualifications absent from the displayed passage. Shallow orientation can find a useful map without reading its linked brief or accepted decision. The fixed follow-up policy reads the first three returned documents; it does not follow those links or choose a gold source. This measures an explicit interaction baseline, not the engine's best possible answer with arbitrary searches.

Same-author rubric review covered the task/source contracts; detailed packet spot-checks included Harbor discovery/current/multi-source, Ridge orientation, Mosaic historical and Forum current, plus successful named-page and rationale cases. Expected clauses were authored before runs, verified against original sources and never tuned to improve these results. The review does not turn mechanical presence into an independently judged entailment score. Future experiment adoption still needs query-bound support judgments and fresh scenarios.

## Correctness, transport and package checks

- ${lifecycle.checks.filter(c => c.passed).length}/${lifecycle.checks.length} supplemental checks passed: public-runtime/local-CLI/hosted-CLI compact parity for three queries; external decision edit and source-version invalidation; incremental repair; rename; deletion; derived-state rebuild. These are separate from quality scores.
- Every scored recalled/expanded span was checked against its canonical source/range/hash: ${first.map(r => `${r.mode} ${r.overall.provenanceFailures} observed failures`).join(', ')}. No response budget violations occurred. Historical bounded retrieval remains explicitly partial. The semantic-enabled run has seven questions with intentional \`query_constraints_lexical_only\` warnings; ten historical questions report bounded temporal discovery (one overlaps), and one also exhausts temporal backfill. No model-query failure was observed. The score includes these actual production-policy outcomes rather than pretending every question used vectors.
- Pack dry run: ${pack.files} files, ${pack.validation.required} required installable files checked, **${pack.evalFiles} eval files shipped**. The runtime already builds into ignored \`dist/\`; versioning development eval tooling does not put it in the installable package.
- Normal build and focused scoring/packaging checks ran separately; final repository test evidence is recorded in the baseline task list. No version bump, installation, push or release is part of this work.

## Limits and next experiments

${report.limits.map(limit => '- ' + limit).join('\n')}

The three active plans test evidence completeness, bounded QMD reranking and explicit relationship neighbors independently. This score establishes a reproducible starting point and visible failures; it does not establish which experiment will win. Quiet-window performance, browser recognition, Linux/VPS capacity and autonomous answer correctness remain unmeasured.

${archive ? `Raw archive (excluding rebuildable roots/indexes): \`${archive}\`; SHA-256 \`${archiveHash}\`.` : 'Full packets and logs remain in the ignored local run directory.'}
`;
const reports = path.join(here, 'reports');
await mkdir(reports, { recursive: true });
await writeFile(path.join(reports, '2026-10-28-baseline-v1.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(path.join(reports, '2026-10-28-baseline-v1.md'), md);
await writeFile(path.join(reports, '2026-10-28-baseline-v1.freeze.json'), await readFile(path.join(dir, 'FREEZE.json')));
console.log(rows);
