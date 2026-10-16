// Production HTTP graph + browser shell, with 501 disposable Markdown notes.
// No QMD/index build, installed app, personal memory, or CLI configuration needed.
// npm run build && npx --package=playwright node scripts/graph-warning-smoke.mjs
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium } from "./playwright-runtime.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-graph-warning-"));
const apiKey = "graph-warning-disposable-key";
let server, browser;
try {
  await initializeMemoryRoot(root);
  await Promise.all(Array.from({ length: 501 }, (_, index) => writeFile(path.join(root, "notes", `fixture-${String(index).padStart(3, "0")}.md`),
    `---\ntitle: "${index < 3 ? "Narrow" : "Synthetic"} fixture ${index}"\ntype: "note"\n---\n\nDisposable graph warning fixture.\n`)));
  server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false });
  const chromium = await loadPlaywrightChromium();
  try { browser = await chromium.launch(); }
  catch (error) {
    if (!error.message.includes("Executable doesn't exist")) throw error;
    browser = await chromium.launch({ channel: process.env.JUMPYBRAIN_PLAYWRIGHT_CHANNEL || "chrome" });
  }
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: width === 320 ? 568 : 844 } });
    const errors = [];
    let releaseGraph;
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      const responseSeen = page.waitForResponse((response) => response.url().includes("/graph.json?"));
      await page.goto(server.url + "/graph#apiKey=" + apiKey);
      const capped = await (await responseSeen).json();
      await page.getByTestId("graph-ready").waitFor({ state: "visible" });
      assert.equal(capped.stats.documents, 501);
      assert.equal(capped.nodes.length, 500, "server default cap must stay bounded");
      assert.equal(capped.options.limit, 500);
      assert.equal(await page.locator("#graph-notice").count(), 1, "map needs an accessible persistent notice region");
      assert.equal(await page.locator("#graph-notice").getAttribute("role"), "status");
      assert.equal(await page.locator("#graph-notice").getAttribute("aria-atomic"), "true");
      assert.equal(await page.locator("#graph-scope").innerText(), "500 notes shown · 501 notes in this brain.");
      assert.match(await page.locator("#graph-warnings").innerText(), /limited to 500 nodes/);
      assert.match(await page.locator("#graph-limit-hint").innerText(), /Filter to narrow the view/);
      await visibleNotice(page, width);

      await filter(page, "Narrow");
      assert.equal(await page.getByTestId("graph-node-count").innerText(), "3");
      assert.equal(await page.locator("#graph-scope").innerText(), "3 notes shown · 501 notes in this brain.");
      assert.doesNotMatch(await page.locator("#graph-warnings").innerText(), /limited to/);
      assert.equal(await page.locator("#graph-limit-hint").isVisible(), false);
      await filter(page, "no such fixture");
      assert.equal(await page.getByTestId("graph-node-count").innerText(), "0");
      assert.match(await page.locator("#graph-empty").innerText(), /No notes match/);
      assert.equal(await page.locator("#graph-scope").innerText(), "0 notes shown · 501 notes in this brain.");
      await filter(page, "");
      assert.match(await page.locator("#graph-warnings").innerText(), /limited to 500 nodes/);

      // Read-only response fixtures for edge cases not produced by this simple brain.
      let packet = { ...capped, nodes: capped.nodes.slice(0, 2), edges: [], stats: { documents: 1636 },
        options: { limit: 3, query: "exactly-limit" }, warnings: ["Graph response was limited to 3 nodes.", '<img src=x onerror="alert(1)">'] };
      packet.nodes.push({ id: "unresolved:synthetic", nodeKind: "unresolved", title: "Synthetic unresolved target", degree: 0 });
      let release;
      const pattern = "**/memories/all/graph.json?*";
      const respond = async (route) => {
        if (release) await release.promise;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(packet) });
      };
      await page.route(pattern, respond);
      await refresh(page);
      assert.equal(await page.getByTestId("graph-node-count").innerText(), "2", "unresolved nodes are not notes");
      assert.equal(await page.locator("#graph-scope").innerText(), "2 notes shown · 1,636 notes in this brain.");
      assert.equal(await page.locator("#graph-notice img").count(), 0, "warnings must remain text, not HTML");
      assert.ok((await page.locator("#graph-warnings").innerText()).includes('<img src=x onerror="alert(1)">'));
      assert.doesNotMatch(await page.locator("#graph-notice").innerText(), /matching notes|omitted notes/);
      await visibleNotice(page, width);
      await page.locator("#graph-filters summary").click();
      assert.equal(await page.locator("#focus").evaluate((input) => {
        const rect = input.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === input;
      }), true, "persistent notices must not cover the filters panel");
      await page.keyboard.press("Escape");

      let resolve;
      release = { promise: new Promise((yes) => { resolve = yes; }) };
      releaseGraph = resolve;
      const started = page.waitForRequest((request) => request.url().includes("/graph.json?"));
      await page.getByTestId("graph-reload").click();
      await started;
      assert.equal(await page.locator("#graph-notice").isVisible(), false, "loading removes stale scope/warnings");
      packet = { ...packet, nodes: packet.nodes.slice(0, 2), stats: { documents: 2 }, warnings: [] };
      resolve(); release = null; releaseGraph = null;
      await page.getByTestId("graph-ready").waitFor({ state: "visible" });
      assert.equal(await page.locator("#graph-notice").isVisible(), false, "uncapped complete graph clears the notice");
      assert.equal(await page.locator("#graph-warnings").textContent(), "");

      packet = { ...packet, stats: { documents: 1636 }, warnings: ["Graph response was limited to 3 nodes."] };
      await refresh(page);
      assert.equal(await page.locator("#graph-notice").isVisible(), true);
      await page.unroute(pattern, respond);
      const fail = (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Synthetic graph failure" } }) });
      await page.route(pattern, fail);
      await page.getByTestId("graph-reload").click();
      await page.getByTestId("graph-error").waitFor({ state: "visible" });
      assert.equal(await page.locator("#graph-notice").isVisible(), false, "failure clears success warnings/counts");
      assert.equal(await page.getByTestId("graph-ready").isVisible(), false);
      // A layout of cached nodes must not resurrect a successful notice after failure.
      await page.evaluate(() => render(state.graph, true));
      assert.equal(await page.locator("#graph-notice").isVisible(), false);
      await page.unroute(pattern, fail);
      await refresh(page);
      assert.equal(await page.locator("#graph-notice").isVisible(), true, "retry restores the current response notice");
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px capped real graph, filtered/global totals, empty/uncapped, unresolved, safe text, refresh/failure/retry`);
    } finally { if (releaseGraph) releaseGraph(); await page.close(); }
  }
  console.log("graph warning smoke: PASS (501 disposable notes; default 500-node cap unchanged)");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}

async function refresh(page) {
  await page.getByTestId("graph-reload").click();
  await page.getByTestId("graph-ready").waitFor({ state: "visible" });
  await page.getByTestId("graph-error").waitFor({ state: "hidden" });
}
async function filter(page, query) {
  await page.getByTestId("graph-query").fill(query);
  await page.getByTestId("graph-query").press("Enter");
  await page.getByTestId("graph-ready").waitFor({ state: "visible" });
  await page.getByTestId("graph-error").waitFor({ state: "hidden" });
}
async function visibleNotice(page, width) {
  const box = await page.locator("#graph-notice").boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.x + box.width <= width, "notice must be visible and fit viewport");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no page overflow");
  const graph = await page.getByTestId("graph-svg").boundingBox();
  assert.ok(box.y + box.height <= graph.y + 1, "notice must take layout space rather than obscure graph content");
}
