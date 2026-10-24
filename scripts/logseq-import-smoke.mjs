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
const { migrateLogseq } = await import(pathToFileURL(path.join(packageRoot, "dist/index.js")));
assert.equal(typeof migrateLogseq, "function", "package must export the runtime operation");
const base = await realpath(await mkdtemp(path.join(os.tmpdir(), "jumpybrain-logseq-trace-")));
const source = path.join(base, "source"), root = path.join(base, "memory");
const screenshots = path.resolve(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || ".local-pack/logseq-readable-import");
const body = "- # Readable import\r\n- Harbor evidence marker amber-harbor-73 remains historical.\r\n- A separate paragraph.\r\n";
const expected = "# Readable import\n\nHarbor evidence marker amber-harbor-73 remains historical.\n\nA separate paragraph.\n";
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
  await mkdir(path.join(source, "pages"), { recursive: true });
  await mkdir(path.join(source, "journals"));
  await mkdir(path.join(source, "assets"));
  await writeFile(path.join(source, "pages/Harbor.md"), body);
  await writeFile(path.join(source, "journals/2024_02_29.md"), "- Historical observation.\n");
  await writeFile(path.join(source, "assets/image.png"), "synthetic omitted asset");
  const args = ["migrate", "logseq", "--source", source, "--root", root];
  const preview = cli([...args, "--json"]);
  assert.equal(preview.created, 2); assert.equal(preview.applied, false);
  assert.equal((await readdir(base)).includes("memory"), false);
  const imported = cli([...args, "--apply", "--json"]);
  assert.equal(imported.created, 2); assert.equal(imported.indexed, false);
  assert.equal(imported.conversion.changedDocuments, 2);
  const entry = imported.entries.find(entry => entry.sourcePath === "pages/Harbor.md");
  const original = await readFile(path.join(root, entry.outputPath));
  assert.equal(cli([...args, "--apply", "--json"]).unchanged, 2);
  cli(["index", "--root", root, "--lexical", "--json"]);
  const recalled = cli(["recall", "--root", root, "--topic", "amber-harbor-73", "--depth", "deep", "--json"]);
  assert.ok(recalled.results.some(hit => hit.provenance.file === entry.outputPath));
  const shown = cli(["show", "--root", root, "--id", entry.id, "--json"]);
  assert.equal(shown.content, original.toString());
  server = await startJumpyBrainHttpServer({ root, apiKeys: ["disposable-logseq-key"], port: 0, autoIndex: false });
  const chromium = await loadPlaywrightChromium(); browser = await launchPlaywrightChromium({ chromium });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors = [], puts = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.method() === "PUT") puts.push(request); });
  await page.goto(`${server.url}/?note=${entry.id}#apiKey=disposable-logseq-key`);
  await page.locator("#note-editor").waitFor({ state: "visible" });
  assert.equal(await page.locator("#note-editor h1").innerText(), "Readable import");
  assert.equal(await page.locator("#note-editor li").count(), 0, "ordinary prose must not render as list items");
  assert.equal(await editorMarkdown(page), expected);
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "desktop.png") });
  await page.locator("#color-theme").click();
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
  assert.equal(await readFile(path.join(source, "pages/Harbor.md"), "utf8"), body);
  assert.deepEqual((await readdir(source)).sort(), ["assets", "journals", "pages"]);
  assert.equal((await readdir(root)).includes("assets"), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, sourceDocuments: 2, outputs: 2, bodyFormat: "readable", lexicalRecall: true, editorOpenSave: true, conflictGuard: true, stableRerun: true, sourceUntouched: true, screenshots }, null, 2));
} finally {
  await browser?.close(); await server?.close(); await rm(base, { recursive: true, force: true });
}
