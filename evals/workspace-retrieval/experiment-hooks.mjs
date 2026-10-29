// Eval-only instrumentation of compiled real runtime. It never ships or enables a product flag.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { prioritizeNamedIdentity } from './identity-policy.mjs';
import { supplementNamedCandidates } from './discovery-policy.mjs';
import { evidenceContext, relationshipProjection, injectNeighbors } from './experiment-policy.mjs';

export async function installExperiment(config) {
  const fromRuntime = relative => import(pathToFileURL(path.join(config.repo, 'dist', relative)));
  const dependencies = Object.assign({}, ...await Promise.all(['core/canonical/markdown-structure.js', 'core/retrieval-policy/compact.js', 'core/frontmatter.js', 'core/canonical/links.js'].map(fromRuntime)));
  let projection = new Map(), llm, events = [], last = {};
  const hook = registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.startsWith(pathToFileURL(path.join(config.repo, 'dist/')).href)) return result;
    let source = String(result.source);
    const replace = (before, after) => { assert.equal(source.split(before).length, 2, `Instrumentation seam changed: ${url}`); source = source.replace(before, after); };
    if (url.endsWith('/adapters/qmd/qmd-driver.js')) {
      if (['ordering-all', 'ordering-all-read-spread'].includes(config.arm)) {
        // Replace production's actual partition, rather than stack a second one.
        replace('const pool = namedSubject ? grouped.slice(0, 40) : [];', 'const pool = namedSubject ? grouped : [];');
        replace('...grouped.slice(40)]', ']');
      }
      replace('candidates.sort((a, b) => b.score - a.score);', 'await globalThis.__workspaceCandidates(candidates, documents, query, Boolean(options.temporal));\n    candidates.sort((a, b) => b.score - a.score);');
      replace('const grouped = groupResultsByFile(ranked, diversityDepth);', 'let grouped = groupResultsByFile(ranked, diversityDepth);\n    grouped = await globalThis.__workspaceRank(grouped, documents, query, Boolean(options.temporal));');
    }
    if (url.endsWith('/app/local-memory/compact.js')) replace('passages.push(passage);', 'if (passage.expansion.available) await globalThis.__workspaceEvidence(passage, await sourceFor(passage.documentId));\n            passages.push(passage);');
    return { ...result, source };
  }});
  globalThis.__workspaceCandidates = async (candidates, documents, query, temporal) => {
    const { normalizeQmdLookupPath } = await fromRuntime('adapters/qmd/qmd-cli.js');
    const canonical = candidate => candidate.file && (documents.get(candidate.file) ?? documents.get(normalizeQmdLookupPath(candidate.file)))?.relativePath;
    const files = rows => [...new Set(rows.map(canonical).filter(Boolean))];
    last = { query, rawCandidateCount: candidates.length, rawFilesBefore: files(candidates) };
    const finish = () => {
      last.rawCandidateCountAfter = candidates.length;
      last.rawFilesAfter = files(candidates);
      last.evictedFiles = last.rawFilesBefore.filter(file => !last.rawFilesAfter.includes(file));
    };
    if (['discovery', 'discovery-identity'].includes(config.arm)) {
      const { hasQueryConstraints } = await fromRuntime('adapters/qmd/qmd-query.js');
      const { isExactTitleMatch } = await fromRuntime('adapters/qmd/qmd-ranking.js');
      const changed = supplementNamedCandidates(candidates, documents, query, {
        constrained: hasQueryConstraints(query), temporal,
        exactNavigation: [...documents.values()].some(document => isExactTitleMatch(query, document)),
        normalizeFile: normalizeQmdLookupPath,
      });
      candidates.splice(0, candidates.length, ...changed.candidates);
      last.discovery = { anchor: changed.anchor, reason: changed.reason, added: changed.added.map(candidate => candidate.file), omittedDocuments: changed.omittedDocuments };
      finish();
      return;
    }
    if (config.arm !== 'neighbors') { finish(); return; }
    // Constraint syntax cannot be rechecked by a source link: conservatively skip.
    const { hasQueryConstraints } = await fromRuntime('adapters/qmd/qmd-query.js');
    const changed = injectNeighbors(candidates, documents, projection, hasQueryConstraints(query));
    candidates.splice(0, candidates.length, ...changed.candidates);
    last.neighbors = changed.added.map(c => c.file);
    finish();
  };
  globalThis.__workspaceRank = async (grouped, documents, query, temporal) => {
    last.pool = grouped.slice(0, 40).map(r => ({ file: r.provenance.file, text: r.snippet, score: r.score }));
    last.fullPool = grouped.slice(0, 40);
    last.groupedCount = grouped.length;
    last.groupedFiles = grouped.map(result => result.provenance.file);
    if (!['rerank', 'identity', 'discovery-identity'].includes(config.arm) || !grouped.length) return grouped;
    const { hasQueryConstraints } = await fromRuntime('adapters/qmd/qmd-query.js');
    const { isExactTitleMatch } = await fromRuntime('adapters/qmd/qmd-ranking.js');
    if (hasQueryConstraints(query) || grouped.some(r => isExactTitleMatch(query, documents.get(r.provenance.file)))) return grouped;
    if (['identity', 'discovery-identity'].includes(config.arm)) return temporal ? grouped : [...prioritizeNamedIdentity(grouped.slice(0, 40), documents, query), ...grouped.slice(40)];
    const start = performance.now();
    if (!llm) {
      const { LlamaCpp } = await import(pathToFileURL(path.join(config.qmdRoot, 'dist/llm.js')));
      llm = new LlamaCpp({ rerankModel: config.rerankModel });
    }
    const pool = grouped.slice(0, 40);
    const result = await llm.rerank(query, pool.map(r => ({ file: r.provenance.file, text: `${r.provenance.metadata?.title ?? ''}\n${r.snippet}\n${(r.passages ?? []).map(p => p.snippet).join('\n')}` })));
    assert.notEqual(result.model, 'fallback', 'Reranker unavailable; no successful rerank can be claimed.');
    last.rerankMs = performance.now() - start;
    events.push({ query, ms: last.rerankMs, candidates: pool.length });
    return [...result.results.map(r => pool[r.index]), ...grouped.slice(40)];
  };
  globalThis.__workspaceEvidence = async (passage, source) => {
    if (config.arm !== 'evidence' || !source.document) return;
    const context = evidenceContext(passage, source.document.content, dependencies);
    if (context.length) passage.context = context; // Atomic with the passage in the real whole-passage packer.
  };
  return {
    async index() {
      if (config.arm !== 'neighbors') return null;
      const start = performance.now();
      const { loadManifest } = await fromRuntime('adapters/qmd/index.js');
      const manifest = await loadManifest(config.root);
      projection = relationshipProjection(manifest.documents, dependencies);
      const content = JSON.stringify({ generation: createHash('sha256').update(JSON.stringify(manifest.documents)).digest('hex'), edges: [...projection] });
      await writeFile(path.join(config.root, '.jumpybrain/experiment-adjacency.json'), content);
      return { ms: performance.now() - start, bytes: Buffer.byteLength(content), edges: [...projection.values()].reduce((n,v) => n + v.length, 0) };
    },
    diagnostics: () => structuredClone(last),
    async dispose() { if (llm) await llm.dispose(); hook.deregister(); await writeFile(path.join(path.dirname(config.indexOutput), 'experiment.json'), JSON.stringify({ events }, null, 2)); },
  };
}
