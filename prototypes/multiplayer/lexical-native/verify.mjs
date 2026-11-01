import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrototype } from "./build.mjs";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "../../../scripts/playwright-runtime.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const output = process.env.JUMPYBRAIN_M1_NATIVE_OUT ?? path.join(root, ".local-pack/multiplayer/M1-lexical-native.json");
const { script, metrics } = await buildPrototype();
const browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
const page = await browser.newPage();
const cases = [];
const started = Date.now();
try {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: script });
  const run = async (id, operation) => {
    await page.evaluate(() => nativePrototype.reset());
    try {
      const details = await operation();
      assert.deepEqual(await page.evaluate(() => nativePrototype.errors()), [], "native editor errors must not be hidden by successful convergence");
      cases.push({ id, status: "passed", ...details });
    }
    catch (error) {
      let state = null;
      try { state = await snapshots(); } catch {}
      cases.push({ id, status: error.code === "ERR_ASSERTION" ? "counterexample" : "error",
        message: error.message, expected: error.expected ?? null, observed: error.actual ?? null, state });
    }
  };
  const setup = async (body) => page.evaluate(async (source) => {
    nativePrototype.add("a"); nativePrototype.add("b");
    await nativePrototype.seed("a", source);
    await nativePrototype.sync("a", "b");
    nativePrototype.clearQueue("a"); nativePrototype.clearQueue("b");
    return { a: nativePrototype.snapshot("a"), b: nativePrototype.snapshot("b") };
  }, body);
  const snapshots = () => page.evaluate(() => ({ a: nativePrototype.snapshot("a"), b: nativePrototype.snapshot("b"), errors: nativePrototype.errors() }));
  const exchange = () => page.evaluate(async () => {
    await nativePrototype.deliver("a", "b");
    await nativePrototype.deliver("b", "a");
    await nativePrototype.sync("a", "b");
    await nativePrototype.sync("b", "a");
  });
  const corpusBytes = await readFile(path.join(root, "prototypes/multiplayer/corpus.json"));
  const shared = JSON.parse(corpusBytes);
  assert.equal(shared.version, 1, "A versioned shared corpus is required");
  assert.ok(Array.isArray(shared.cases) && shared.cases.length > 0, "Shared corpus cannot be empty");
  const corpus = shared.cases;
  for (const item of corpus) {
    const body = item.body ?? item.markdown ?? item.source;
    if (typeof body !== "string") continue;
    await run("native-roundtrip-" + item.id, async () => {
      const observed = await setup(body);
      assert.equal(observed.a.markdown, body, "seed client preserves original Markdown");
      assert.equal(observed.b.markdown, body, "fresh native-bound collaborator must preserve exact Markdown");
      return { expected: body, observed };
    });
    if (item.probe) await run("native-unrelated-source-" + item.id, async () => {
      const expected = await page.evaluate(({ body, probe }) => nativePrototype.controlProbe(body, probe.needle, probe.insert), { body, probe: item.probe });
      await setup(body);
      await page.evaluate(({ probe }) => nativePrototype.insertAfter("a", probe.needle, probe.insert), { probe: item.probe });
      await exchange(); const observed = await snapshots();
      assert.equal(observed.a.markdown, expected, "native seed client must match current editor's supported edit semantics");
      assert.equal(observed.b.markdown, expected, "fresh collaborator must preserve source outside the current editor's allowed normalization");
      return { expected, observed };
    });
  }
  await run("native-independent-concurrent-edits", async () => {
    await setup("Alpha\nBeta");
    await page.evaluate(async () => { await nativePrototype.edit("a", 0, 5, 0, " human"); await nativePrototype.edit("b", 1, 4, 0, " agent"); });
    await exchange(); const observed = await snapshots();
    assert.equal(observed.a.markdown, "Alpha human\nBeta agent");
    assert.equal(observed.b.markdown, observed.a.markdown);
    assert.deepEqual(observed.errors, []); return { observed };
  });
  await run("native-same-position-concurrent-inserts", async () => {
    await setup("Alpha Beta");
    await page.evaluate(async () => {
      await nativePrototype.edit("a", 0, 6, 0, "HUMAN ");
      await nativePrototype.edit("b", 0, 6, 0, "AGENT ");
    });
    await exchange(); const observed = await snapshots();
    const allowed = ["Alpha HUMAN AGENT Beta", "Alpha AGENT HUMAN Beta"];
    assert.ok(allowed.includes(observed.a.markdown), "same-position inserts must retain both complete runs in a documented CRDT order");
    assert.equal(observed.b.markdown, observed.a.markdown);
    return { expected: allowed, observed };
  });
  await run("native-streaming-and-duplicate-delivery", async () => {
    await setup("Alpha\nBeta");
    await page.evaluate(async () => {
      await nativePrototype.edit("a", 0, 5, 0, " human");
      for (const chunk of [" stream", "ed", " agent"]) { await nativePrototype.edit("b", 1, nativePrototype.snapshot("b").blocks[1].text.length, 0, chunk); await nativePrototype.deliver("b", "a", true); }
    });
    await exchange(); const observed = await snapshots();
    assert.equal(observed.a.markdown, "Alpha human\nBeta streamed agent");
    assert.equal(observed.b.markdown, observed.a.markdown); return { observed };
  });
  await run("native-local-undo-keeps-remote-edit", async () => {
    await setup("Alpha\nBeta");
    await page.evaluate(async () => { await nativePrototype.edit("a", 0, 5, 0, " human"); await nativePrototype.edit("b", 1, 4, 0, " agent"); });
    await exchange();
    await page.evaluate(async () => nativePrototype.undo("a"));
    await exchange(); const observed = await snapshots();
    assert.equal(observed.a.markdown, "Alpha\nBeta agent"); assert.equal(observed.b.markdown, observed.a.markdown); return { observed };
  });
  await run("native-real-contenteditable-input", async () => {
    await setup("Alpha\nBeta");
    await page.locator("#editor-a").evaluate((element) => {
      element.focus();
      const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.insertText(" browser");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await exchange(); const observed = await snapshots();
    assert.equal(observed.a.markdown, "Alpha\nBeta browser");
    assert.equal(observed.b.markdown, observed.a.markdown);
    return { observed };
  });
  await run("native-container-delete-versus-concurrent-human", async () => {
    await setup("Keep\nTarget");
    await page.evaluate(async () => { await nativePrototype.edit("a", 1, 6, 0, " HUMAN"); await nativePrototype.removeBlock("b", 1); });
    await exchange(); const observed = await snapshots();
    assert.ok(observed.a.markdown.includes("HUMAN"), "converged document must preserve concurrent human intent or return explicit recovery");
    assert.equal(observed.b.markdown, observed.a.markdown); return { observed };
  });
  await run("native-stale-offset-repeated-text", async () => {
    await setup("same same");
    await page.evaluate(async () => {
      await nativePrototype.edit("a", 0, 0, 0, "prefix ");
      await nativePrototype.deliver("a", "b");
      // An agent computed offset 5 from its old read. Applying it directly to the
      // current rich-text leaf must not be mistaken for a stable read anchor.
      await nativePrototype.edit("b", 0, 5, 4, "SECOND");
    });
    await exchange(); const observed = await snapshots();
    assert.equal(observed.a.markdown, "prefix same SECOND", "stale integer offsets require a read-state adapter");
    return { observed };
  });
  const report = { version: 1, candidate: "lexical-native-v1", status: cases.some((item) => item.status === "error") ? "error" : cases.every((item) => item.status === "passed") ? "passed" : "rejected",
    metrics: { ...metrics, lockSha256: createHash("sha256").update(await readFile(path.join(directory, "package-lock.json"))).digest("hex") },
    corpusFileSha256: createHash("sha256").update(corpusBytes).digest("hex"),
    corpusSha256: createHash("sha256").update(corpusBytes).digest("hex"),
    caseListSha256: createHash("sha256").update(JSON.stringify(corpus)).digest("hex"),
    environment: { node: process.version, platform: process.platform, arch: process.arch, browser: browser.version() }, cases,
    durationMs: Date.now() - started, scope: "Actual production createNoteEditor with guarded prototype-only hooks; queued in-memory Yjs deliveries, no server/production transport.",
    limits: ["Counterexamples reject the native binding as a drop-in design; no backend implementation is enabled.", "Physical IME, browser selection/accessibility, durable Markdown publication and raw-file coordination are not established by this candidate runner."] };
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output, status: report.status, metrics, cases: cases.map(({ id, status }) => ({ id, status })) }, null, 2));
  process.exitCode = report.status === "passed" ? 0 : 1;
} finally { await browser.close(); }
