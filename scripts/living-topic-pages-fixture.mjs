// Disposable real-server fixture for T3 preview QA; no QMD, personal memory or provider calls.
// node scripts/living-topic-pages-fixture.mjs; inspect /tmp/jumpybrain-living-preview.json.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashMemoryDocumentContent } from '../dist/core/canonical/markdown-store.js';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
const root = await mkdtemp(path.join(os.tmpdir(), 'living-preview-'));
await initializeMemoryRoot(root);
const ids = [1, 2, 3, 4, 5].map(n => `mem_92000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const source = `---\nid: ${ids[0]}\ntype: decision\ntitle: Confirmed release decision\ndate: 2026-10-12\n---\nOn October 12 we confirmed October 27 as the launch date.\n`;
const plan = `---\nid: ${ids[3]}\ntype: note\ntitle: Original release plan\ndate: 2026-10-01\n---\nThe current plan targets October 20 for launch.\n`;
const proposal = `---\nid: ${ids[4]}\ntype: note\ntitle: Proposed release delay\ndate: 2026-10-10\n---\nI propose delaying launch beyond October 20. This is a proposal, not an approved decision.\n`;
const planCite = `[October 1 plan](${ids[3]} "${hashMemoryDocumentContent(plan)}")`;
const proposalCite = `[October 10 proposal](${ids[4]} "${hashMemoryDocumentContent(proposal)}")`;
const cite = `[October 12 decision](${ids[0]} "${hashMemoryDocumentContent(source)}")`;
const body = `# Release plan\n\nSynthesis date: 2026-10-12. Evidence period: October 1–12 (UTC).\n\nThe confirmed launch is October 27. ${cite}\n\nThe October 1 plan targeted October 20. ${planCite} October 10 proposed a delay. ${proposalCite} The October 12 decision confirms the new date, rather than merely proposing it.\n\nHuman contribution: notify the customer before announcing the release.\n\n## Latest substantive change\nOctober 12 confirmed October 27, replacing the October 20 plan.\n\n## Open questions\nWho owns customer notification?\n`;
await writeFile(path.join(root, 'decisions/confirmed.md'), source);
await writeFile(path.join(root, 'notes/original-plan.md'), plan);
await writeFile(path.join(root, 'notes/delay-proposal.md'), proposal);
await writeFile(path.join(root, 'pages/release.md'), `---\nid: ${ids[1]}\ntype: page\ntitle: Release plan\ndream: true\ncreated_at: 2026-10-12T12:00:00Z\nupdated_at: 2026-10-12T12:00:00Z\n---\n${body}`);
await writeFile(path.join(root, 'notes/ordinary.md'), `---\nid: ${ids[2]}\ntitle: Human planning note\ntype: note\n---\nHuman-authored note, outside ordinary Dream update scope.\n`);
const key = 'disposable-living-preview';
const server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
const info = { root, url: server.url, page: ids[1], source: ids[0], ordinary: ids[2], citation: cite, key };
await writeFile('/tmp/jumpybrain-living-preview.json', JSON.stringify(info));
console.log(JSON.stringify(info));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); await rm(root, { recursive: true, force: true }); process.exit(0); });
