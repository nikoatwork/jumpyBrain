// Read-only graph UI smoke validation. Prefer running through graph-editor-smoke.mjs,
// which supplies a disposable indexed fixture server. Direct use requires an
// explicitly chosen server and never performs document writes.
// Env: JUMPYBRAIN_GRAPH_SMOKE_URL, JUMPYBRAIN_GRAPH_SMOKE_API_KEY,
//      JUMPYBRAIN_GRAPH_SMOKE_NODE_ID (optional), JUMPYBRAIN_SMOKE_SCREENSHOT_DIR (optional)
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { loadPlaywrightChromium } from "./playwright-runtime.mjs";

const rawUrl = process.env.JUMPYBRAIN_GRAPH_SMOKE_URL;
const apiKey = process.env.JUMPYBRAIN_GRAPH_SMOKE_API_KEY;
const expectedNodeId = process.env.JUMPYBRAIN_GRAPH_SMOKE_NODE_ID;
const screenshotDir = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR;

if (!rawUrl || !apiKey) {
  console.error("Set JUMPYBRAIN_GRAPH_SMOKE_URL and JUMPYBRAIN_GRAPH_SMOKE_API_KEY (prefer the disposable graph-editor smoke server).");
  process.exit(2);
}

const baseUrl = rawUrl.replace(/\/$/, "");
let chromium;
try {
  chromium = await loadPlaywrightChromium();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const graphResponse = await fetch(`${baseUrl}/memories/all/graph.json?depth=1&includeUnresolved=1&includeOrphans=1`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
assert.equal(graphResponse.status, 200, `graph fixture request failed with HTTP ${graphResponse.status}`);
const graph = await graphResponse.json();
const documentIdPattern = /^mem_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonicalNodes = (Array.isArray(graph.nodes) ? graph.nodes : []).filter(
  (node) => node.nodeKind === "document" && documentIdPattern.test(String(node.documentId || "")),
);
const selectedNode = expectedNodeId
  ? canonicalNodes.find((node) => node.id === expectedNodeId)
  : canonicalNodes[0];
assert.ok(selectedNode, expectedNodeId
  ? `configured canonical graph node ${JSON.stringify(expectedNodeId)} was not found`
  : "graph has no document node with a valid canonical memory ID");

const browser = await launchBrowser(chromium);
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const consoleErrors = [];
await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

try {
  await page.goto(`${baseUrl}/graph#apiKey=${encodeURIComponent(apiKey)}`);
  await page.getByTestId("graph-ready").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("graph-error").waitFor({ state: "hidden" });
  assert.equal(new URL(page.url()).hash, "", "API key fragment should be removed from the visible URL");

  const nodeCount = Number(await page.getByTestId("graph-node-count").innerText());
  const edgeCount = Number(await page.getByTestId("graph-edge-count").innerText());
  assert.ok(nodeCount > 0, `expected nodeCount > 0, got ${nodeCount}`);
  assert.ok(edgeCount >= 0, `expected edgeCount >= 0, got ${edgeCount}`);
  await page.getByTestId("graph-svg").waitFor({ state: "visible" });
  console.log(`  ok - graph ready (nodes=${nodeCount}, edges=${edgeCount})`);

  // Exercise graph filtering, then clear it so the prevalidated canonical node is selectable.
  await page.getByTestId("graph-query").fill(String(selectedNode.title || selectedNode.file || "").split(/\s+/)[0]);
  await reloadGraph(page);
  await page.getByTestId("graph-query").fill("");
  await reloadGraph(page);
  console.log("  ok - graph filter reload");

  const nodes = page.getByTestId("graph-node");
  const nodeIds = await nodes.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-node-id")));
  const selectedIndex = nodeIds.indexOf(selectedNode.id);
  assert.ok(selectedIndex >= 0, `canonical node ${JSON.stringify(selectedNode.id)} is not rendered`);
  await nodes.nth(selectedIndex).focus();
  await page.keyboard.press("Enter");

  await page.waitForURL((value) => value.pathname === "/" && value.searchParams.get("note") === selectedNode.documentId, { timeout: 15_000 });
  const panel = page.getByTestId("graph-note-panel");
  await panel.waitFor({ state: "visible" });
  await page.getByTestId("graph-note-editor").waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await page.getByTestId("graph-svg").isVisible(), false, "graph should yield to the full-page note editor");
  assert.equal(await page.locator("#home-link").isVisible(), true);
  assert.equal(await page.locator("#graph-link").isVisible(), true);
  assert.equal(await page.locator("#graph-note-close, #graph-note-edit, #graph-note-content").count(), 0,
    "removed slide-in controls should not return");
  assert.doesNotMatch(await page.getByTestId("graph-note-editor").inputValue(), /^---(?:\r?\n|$)/,
    "full-page textarea should contain only the raw Markdown body");
  console.log(`  ok - canonical node opens full-page note (${selectedNode.id})`);

  await page.goBack();
  await page.waitForURL((value) => /^\/graph\/?$/.test(value.pathname), { timeout: 15_000 });
  await page.getByTestId("graph-svg").waitFor({ state: "visible" });

  const unresolved = page.locator(".node.unresolved[data-testid='graph-node']");
  if (await unresolved.count()) {
    await unresolved.first().focus();
    await page.keyboard.press("Enter");
    assert.match(await page.getByTestId("graph-status").innerText(), /unresolved link:/);
    assert.match(new URL(page.url()).pathname, /^\/graph\/?$/);
    console.log("  ok - unresolved node remains non-navigable");
  }

  await capture(page, "graph-ui.png");
  assert.deepEqual(consoleErrors, [], "graph browser console errors");
} catch (error) {
  await capture(page, "graph-ui-failure.png").catch(() => undefined);
  console.error("FAIL:", error && error.message ? error.message : error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

if (!process.exitCode) console.log("graph UI smoke: PASS");

async function reloadGraph(targetPage) {
  await targetPage.getByTestId("graph-reload").click();
  await targetPage.getByTestId("graph-ready").waitFor({ state: "visible", timeout: 15_000 });
  await targetPage.getByTestId("graph-error").waitFor({ state: "hidden" });
}

async function capture(targetPage, name) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await targetPage.screenshot({ path: path.join(screenshotDir, name), fullPage: true });
}

async function launchBrowser(browserType) {
  try {
    return await browserType.launch();
  } catch (error) {
    if (!String(error?.message || error).includes("Executable doesn't exist")) throw error;
    return browserType.launch({ channel: process.env.JUMPYBRAIN_PLAYWRIGHT_CHANNEL || "chrome" });
  }
}
