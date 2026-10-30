// Disposable CLI -> lexical retrieval -> actual browser/editor -> rerun trace.
// Optional candidate package path tests an unpacked distribution without installing it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, editorMarkdown } from "./editor-smoke-helpers.mjs";

const packageRoot = path.resolve(process.env.JUMPYBRAIN_SMOKE_PACKAGE_DIR || ".");
const { startJumpyBrainHttpServer } = await import(pathToFileURL(path.join(packageRoot, "dist/server/index.js")));
const { migrateObsidian } = await import(pathToFileURL(path.join(packageRoot, "dist/index.js")));
assert.equal(typeof migrateObsidian, "function", "package must export the runtime operation");
const base = await realpath(await mkdtemp(path.join(os.tmpdir(), "jumpybrain-obsidian-trace-")));
const source = path.join(base, "source"), root = path.join(base, "memory");
const screenshots = path.resolve(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || ".local-pack/obsidian-import");
const body = "---\r\nid: source-only\r\ntype: page\r\ndream: true\r\naliases: [Harbor alias]\r\n---\r\n# Obsidian import\r\n\r\nHarbor evidence marker amber-harbor-73 remains historical.\r\n\r\n- Intentional list item\r\n- [ ] Intentional task\r\n\r\n[[Other#Heading|alias]] ![[assets/image.png]]\r\n";
const { parseMigrationEnvelope, hashMigrationBytes } = await import(pathToFileURL(path.join(packageRoot, "dist/core/migration/index.js")));
const expected = body.replace(/\r\n/g, "\n");
let server, browser;
function cli(args, ok = true) {
  const result = spawnSync(process.execPath, [path.join(packageRoot, "dist/cli.js"), ...args], {
    encoding: "utf8", timeout: 120000,
    env: { ...process.env, JUMPYBRAIN_CLI_CONFIG: path.join(base, "cli-policy.json"), JUMPYBRAIN_API_KEY: "" },
  });
  assert.equal(result.status === 0, ok, result.stderr || result.stdout);
  return ok ? JSON.parse(result.stdout) : result;
}
try {
  await mkdir(source, { recursive: true });
  await mkdir(path.join(source, ".obsidian"));
  await mkdir(path.join(source, "assets"));
  await writeFile(path.join(source, "Harbor.md"), body);
  await writeFile(path.join(source, "Other.md"), "# Other\n\n## Heading\nHistorical observation.\n");
  await writeFile(path.join(source, "assets/image.png"), "synthetic omitted asset");
  await writeFile(path.join(source, ".obsidian/workspace.json"), "{}\n");
  const snapshotSource = async () => Promise.all((await readdir(source, { recursive: true })).sort().map(async file => { const { lstat } = await import("node:fs/promises"); const info = await lstat(path.join(source, file)); return [file, info.isFile() ? hashMigrationBytes(await readFile(path.join(source, file))) : null]; }));
  const sourceBefore = await snapshotSource();
  const args = ["migrate", "obsidian", "--source", source, "--root", root];
  const preview = cli([...args, "--json"]);
  assert.equal(preview.created, 2); assert.equal(preview.applied, false);
  assert.equal((await readdir(base)).includes("memory"), false);
  const imported = cli([...args, "--apply", "--json"]);
  assert.equal(imported.created, 2); assert.equal(imported.indexed, false);
  assert.equal(imported.notes, 2);
  assert.deepEqual(imported.omissions, { hidden: 1, nonMarkdown: 1, symlinks: 0 });
  const entry = imported.entries.find(entry => entry.sourcePath === "Harbor.md");
  const original = await readFile(path.join(root, entry.outputPath));
  assert.deepEqual(parseMigrationEnvelope(original).body, Buffer.from(body));
  assert.equal(parseMigrationEnvelope(original).metadata.dream, undefined);
  assert.equal(entry.bodyHash, hashMigrationBytes(Buffer.from(body)));
  assert.equal(cli([...args, "--apply", "--json"]).unchanged, 2);
  cli(["index", "--root", root, "--lexical", "--json"]);
  const recalled = cli(["recall", "--root", root, "--topic", "amber-harbor-73", "--depth", "deep", "--json"]);
  assert.ok(recalled.results.some(hit => hit.provenance.file === entry.outputPath));
  const shown = cli(["show", "--root", root, "--id", entry.id, "--json"]);
  assert.equal(shown.content, original.toString());
  const expanded = cli(["expand", "--root", root, "--id", entry.id, "--if-match", shown.contentHash, "--max-bytes", "8192", "--json"]);
  assert.match(expanded.text, /amber-harbor-73/);
  assert.equal(expanded.id, entry.id);
  server = await startJumpyBrainHttpServer({ root, apiKeys: ["disposable-obsidian-key"], port: 0, autoIndex: false });
  const chromium = await loadPlaywrightChromium(); browser = await launchPlaywrightChromium({ chromium });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors = [], puts = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.method() === "PUT") puts.push(request); });
  await page.goto(`${server.url}/?note=${entry.id}#apiKey=disposable-obsidian-key`);
  await page.locator("#note-editor").waitFor({ state: "visible" });
  assert.equal(await page.locator("#note-editor h1").innerText(), "Obsidian import");
  assert.ok(await page.locator("#note-editor").innerText().then(text => text.includes("Intentional list item")));
  assert.equal((await editorMarkdown(page)).trimEnd(), expected.trimEnd());
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "desktop.png") });
  await page.evaluate(() => colorTheme.setPreference(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshots, "narrow-dark.png") });
  assert.deepEqual(await readFile(path.join(root, entry.outputPath)), original, "opening must preserve canonical bytes");
  assert.equal(puts.length, 0);
  await appendEditorText(page, "An explicit destination edit.");
  await page.locator("#note-name").click();
  await page.getByTestId("graph-note-save-state").filter({ hasText: "Saved" }).waitFor();
  const edited = cli(["show", "--root", root, "--id", entry.id, "--json"]);
  assert.match(edited.content, /explicit destination edit/);
  assert.equal(edited.frontmatter.id, entry.id);
  await page.reload(); await page.locator("#note-editor").waitFor({ state: "visible" });
  assert.match(await editorMarkdown(page), /explicit destination edit/);
  cli([...args, "--apply", "--fail-on-conflict", "--json"], false);
  assert.equal(cli(["show", "--root", root, "--id", entry.id, "--json"]).content, edited.content);
  const replaced = cli([...args, "--apply", "--json"]);
  assert.equal(replaced.overwritten, 1);
  assert.equal(replaced.entries.find(item => item.sourcePath === entry.sourcePath).id, entry.id);
  const manifestBefore = await readFile(path.join(root, replaced.manifest));
  assert.equal(cli([...args, "--apply", "--json"]).unchanged, 2);
  assert.deepEqual(await readFile(path.join(root, replaced.manifest)), manifestBefore);
  cli(["index", "--root", root, "--lexical", "--json"]);
  assert.ok(cli(["recall", "--root", root, "--topic", "amber-harbor-73", "--json"]).results.some(hit => hit.provenance.file === entry.outputPath));
  assert.equal(await readFile(path.join(source, "Harbor.md"), "utf8"), body);
  assert.deepEqual(await snapshotSource(), sourceBefore);
  assert.equal((await readdir(root)).includes("assets"), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, sourceDocuments: 2, outputs: 2, bodyFormat: "preserve", lexicalRecall: true, editorOpenSave: true, conflictGuard: true, stableRerun: true, sourceUntouched: true, screenshots }, null, 2));
} finally {
  await browser?.close(); await server?.close(); await rm(base, { recursive: true, force: true });
}
