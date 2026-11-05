// Explicit opt-in: exercise the candidate shell against an already running local
// brain, through a temporary read-only profile. Never installs or edits notes.
// npx --package=playwright node scripts/related-pages-local-smoke.mjs --root /absolute/brain
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listServerMemoryFiles } from '../dist/app/server-memory/folder-explorer.js';
import { readBackendDescriptor } from '../dist/adapters/backend-host/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { launchPlaywrightChromium } from './playwright-runtime.mjs';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--root' || !path.isAbsolute(args[1])) throw new Error('Supply --root /absolute/local/brain explicitly.');
const root = args[1];
const temporary = await mkdtemp(path.join(os.tmpdir(), 'jb-related-local-'));
const directory = path.join(temporary, 'support'); await mkdir(directory, { mode: 0o700 });
const controlKey = randomBytes(32).toString('hex');
async function fingerprint() {
  const { files } = await listServerMemoryFiles({ root });
  const entries = await Promise.all(files.map(async ({file}) => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')]));
  entries.push(['jumpybrain.json', createHash('sha256').update(await readFile(path.join(root, 'jumpybrain.json'))).digest('hex')]);
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}
const before = await fingerprint();
let gateway, browser;
const errors = [], mutations = [], searches = [];
try {
  const descriptor = await readBackendDescriptor(root);
  if (!descriptor) throw new Error('Open the local brain in the app first; this test will not start or replace its backend.');
  gateway = await startCompanionGateway({ runtimeRoot: process.cwd(), directory, initialRoot: root, port: 0, controlKey,
    credentials: { get: async () => null, set: async () => {}, delete: async () => {} },
    localFactory: async () => ({ url: descriptor.url, token: descriptor.token, close: async () => {}, current: async () => {
      const current = await readBackendDescriptor(root); return current?.instanceId === descriptor.instanceId;
    } }),
  });
  const snapshot = gateway.store.snapshot();
  await gateway.store.save({ ...snapshot.profiles.find(p => p.id === snapshot.activeId), allowWrites: false }, snapshot.revision);
  browser = await launchPlaywrightChromium();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  const searchDurations = [];
  page.on('requestfinished', request => { if (new URL(request.url()).pathname === '/memories/all/search') searchDurations.push(Math.round(request.timing().responseEnd)); });
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/memories/all/search') searches.push(Date.now());
    if (/^\/memories\//.test(pathname) && (['PUT', 'PATCH', 'DELETE'].includes(request.method()) || /\/(index|notes|ensure-title)$/.test(pathname))) mutations.push(pathname);
  });
  const { files } = await listServerMemoryFiles({ root });
  let found = false;
  const terms = file => [...new Set((file.title?.toLowerCase().match(/[\p{L}]{4,}/gu) ?? []))];
  const frequencies = new Map();
  for (const file of files) for (const term of terms(file)) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const overlap = file => terms(file).reduce((sum, term) => sum + (frequencies.get(term) ?? 0), 0);
  const candidates = files.filter(file => file.id).sort((a, b) => overlap(b) - overlap(a));
  for (const note of candidates.slice(0, 8)) {
    await page.goto(gateway.url + '/?note=' + encodeURIComponent(note.id) + '&brain=' + snapshot.activeId + '#companion=' + controlKey);
    await page.locator('#note-editor').waitFor();
    await page.waitForFunction(() => state.editor?.state.loaded && document.querySelector('#note-name').readOnly);
    try { await page.locator('#related-pages-list a').first().waitFor({ timeout: 12000 }); found = true; break; } catch {}
  }
  assert.ok(found, 'actual indexed local notes must produce at least one recommendation');
  const count = searches.length;
  const links = await page.locator('#related-pages-list a').count();
  assert.ok(links > 0 && links <= 5);
  await page.evaluate(() => window.relatedAnchor = document.querySelector('#related-pages-list a'));
  console.log('Local brain: actual recommendations loaded in candidate read-only shell; observing minute cadence.');
  await new Promise(resolve => setTimeout(resolve, 25000));
  assert.equal(searches.length, count, 'no per-save or two-second search polling');
  await new Promise(resolve => setTimeout(resolve, 25000));
  assert.equal(searches.length, count, 'no refresh before a minute');
  assert.equal(await page.evaluate(() => window.relatedAnchor === document.querySelector('#related-pages-list a')), true);
  await new Promise(resolve => setTimeout(resolve, 16000));
  assert.equal(searches.length, count + 1, 'one minute triggers one real backend refresh');
  assert.ok(await page.locator('#related-pages-list a').count() > 0);
  const target = new URL(await page.locator('#related-pages-list a').first().getAttribute('href'), gateway.url);
  await page.locator('#related-pages-list a').first().click();
  await page.waitForURL(url => url.searchParams.get('note') === target.searchParams.get('note'));
  await page.waitForFunction(() => state.editor?.state.loaded);
  assert.deepEqual(mutations, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(await fingerprint(), before, 'every canonical note and root policy stays byte-identical');
  console.log(JSON.stringify({ result: 'PASS', canonicalFilesUnchanged: Object.keys(before).length - 1, relatedLinks: links, minuteRefreshes: 1, noteMutations: 0, pageErrors: 0, searchDurationsMs: searchDurations, installed: false }));
} finally {
  await browser?.close(); await gateway?.close(); await rm(temporary, { recursive: true, force: true });
  assert.deepEqual(await fingerprint(), before, 'verification must leave canonical notes and policy unchanged');
}
