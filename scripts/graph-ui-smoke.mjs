// Read-only graph UI smoke validation. Prefer running through graph-editor-smoke.mjs,
// which supplies a disposable indexed fixture server. Direct use requires an
// explicitly chosen server and never performs document writes.
// Env: JUMPYBRAIN_GRAPH_SMOKE_URL, JUMPYBRAIN_GRAPH_SMOKE_API_KEY,
//      JUMPYBRAIN_GRAPH_SMOKE_NODE_ID (optional), JUMPYBRAIN_SMOKE_SCREENSHOT_DIR (optional)
import assert from "node:assert/strict";
import { editorMarkdown } from "./editor-smoke-helpers.mjs";
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
  for (const width of [1280, 390]) await validateGraph(width);
  assert.deepEqual(consoleErrors, [], "graph browser console errors");
} catch (error) {
  await capture(page, "graph-ui-failure.png").catch(() => undefined);
  console.error("FAIL:", error && error.message ? error.message : error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

if (!process.exitCode) console.log("graph UI smoke: PASS");

async function validateGraph(width) {
  await page.setViewportSize({ width, height: 820 });
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
  assert.equal(await page.locator("#depth").count(), 0);
  await page.locator("#graph-filters summary").click();
  const options = await page.locator(".map-options").boundingBox();
  assert.ok(options.x >= 0 && options.x + options.width <= width, "filter options must fit the viewport");
  await page.getByTestId("graph-focus").fill(String(selectedNode.title || selectedNode.file));
  const focusedResponse = page.waitForResponse((response) => response.url().includes("/graph.json?") && response.url().includes("focus="));
  await page.getByTestId("graph-focus").press("Tab");
  await focusedResponse;
  await page.getByTestId("graph-ready").waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#graph-filters").evaluate((el) => el.open), false);
  const camera = await validateCamera(page);

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
  assert.doesNotMatch(await editorMarkdown(page), /^---(?:\r?\n|$)/,
    "full-page editor should serialize only the Markdown body");
  console.log(`  ok - canonical node opens full-page note (${selectedNode.id})`);

  await page.goBack();
  await page.waitForURL((value) => /^\/graph\/?$/.test(value.pathname), { timeout: 15_000 });
  await page.getByTestId("graph-svg").waitFor({ state: "visible" });
  await page.waitForFunction((id) => document.activeElement?.getAttribute("data-node-id") === id, selectedNode.id);
  assert.deepEqual(await readCamera(page), camera, "Back should preserve the map camera");
  assert.equal(await page.getByTestId("graph-focus").inputValue(), String(selectedNode.title || selectedNode.file));
  await page.goForward();
  await page.getByTestId("graph-note-editor").waitFor({ state: "visible" });
  await page.goBack();
  await page.waitForFunction((id) => document.activeElement?.getAttribute("data-node-id") === id, selectedNode.id);
  assert.deepEqual(await readCamera(page), camera, "Forward/Back should not reset the map camera");

  // Return to the complete map to exercise missing-note feedback if present.
  await page.locator("#graph-filters summary").click();
  await page.getByTestId("graph-focus").fill("");
  await reloadGraph(page);
  const unresolved = page.locator(".node.unresolved[data-testid='graph-node']");
  if (await unresolved.count()) {
    await unresolved.first().focus();
    await page.keyboard.press("Enter");
    assert.match(await page.getByTestId("graph-status").innerText(), /doesn't exist yet:/i);
    assert.match(new URL(page.url()).pathname, /^\/graph\/?$/);
    console.log("  ok - unresolved node remains non-navigable");
  }

  await capture(page, "graph-ui-" + width + ".png");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "page must not overflow horizontally");
  console.log("  ok - anchored zoom, mouse pan, history and filters at " + width + "px");
  await validateMapStates(page, width);
}

async function reloadGraph(targetPage) {
  await targetPage.getByTestId("graph-reload").click();
  await targetPage.getByTestId("graph-ready").waitFor({ state: "visible", timeout: 15_000 });
  await targetPage.getByTestId("graph-error").waitFor({ state: "hidden" });
}

// Read-only response fixtures: exercise edge cases without changing server memory.
async function validateMapStates(targetPage, width) {
  let packet = { ...graph, nodes: [], edges: [] };
  const pattern = "**/memories/all/graph.json?*";
  const respond = (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(packet) });
  await targetPage.route(pattern, respond);
  try {
    await reloadGraph(targetPage);
    assert.match(await targetPage.locator("#graph-empty").innerText(), /starts with a note/);
    await capture(targetPage, "map-empty-" + width + ".png");
    await targetPage.getByTestId("graph-query").fill("no matching note");
    await reloadGraph(targetPage);
    assert.match(await targetPage.locator("#graph-empty").innerText(), /No notes match/);
    await targetPage.getByTestId("graph-query").fill("");
    packet = { ...graph, nodes: [selectedNode], edges: [] };
    await reloadGraph(targetPage);
    assert.equal(await targetPage.getByTestId("graph-node").count(), 1);
    assert.equal(await targetPage.locator("#graph-empty").isVisible(), false);
    await capture(targetPage, "map-single-" + width + ".png");

    const nodes = Array.from({ length: 60 }, (_, index) => ({
      ...selectedNode, id: "visual-" + index, degree: index < 50 ? 2 : 0,
      title: index === 0 ? '<img src=x onerror="alert(1)"> Long untrusted note title — kept as text'
        : "Work note " + (index + 1) + " — decisions, discoveries and follow-ups",
    }));
    nodes.push({ ...selectedNode, id: "missing-visual-note", nodeKind: "unresolved", documentId: undefined, title: "Missing follow-up", degree: 1 });
    packet = { ...graph, nodes, edges: nodes.slice(0, 49).map((node, index) => ({ source: node.id, target: nodes[index + 1].id, kind: "markdown-link", count: 1 })) };
    packet.edges.push({ source: nodes[0].id, target: "missing-visual-note", kind: "markdown-link", count: 1 });
    await reloadGraph(targetPage);
    assert.equal(await targetPage.getByTestId("graph-node").count(), 61);
    assert.equal(await targetPage.getByTestId("graph-node-count").innerText(), "60", "missing targets are not existing notes");
    assert.equal(await targetPage.locator("#viewport img").count(), 0, "titles must remain text, not HTML");
    assert.ok(await targetPage.locator(".node text").evaluateAll((labels) => labels.some((label) => label.textContent.endsWith("…"))));
    await capture(targetPage, "map-dense-" + width + ".png");
    await targetPage.locator(".node.unresolved").focus();
    await targetPage.keyboard.press("Enter");
    assert.match(await targetPage.getByTestId("graph-status").innerText(), /doesn't exist yet/);
    await targetPage.locator("#graph-filters summary").click();
    assert.equal(await targetPage.locator("#focus").evaluate((input) => {
      const r = input.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === input;
    }), true, "status feedback must not paint over the filters panel");
    await capture(targetPage, "map-filters-" + width + ".png");
    await targetPage.keyboard.press("Escape");
    console.log("  ok - empty, filtered, single, dense, long-title and missing-note states at " + width + "px");
  } finally {
    await targetPage.unroute(pattern, respond);
  }
}

async function readCamera(targetPage) {
  return targetPage.locator("#viewport").evaluate((el) => {
    const m = el.transform.baseVal.consolidate().matrix;
    return { scale: m.a, x: m.e, y: m.f };
  });
}

async function validateCamera(targetPage) {
  const rect = await targetPage.getByTestId("graph-svg").boundingBox();
  const anchor = { x: rect.width * .62, y: rect.height * .45 };
  const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < .75, message + ": " + actual + " vs " + expected);
  function anchored(before, after, point) {
    close((point.x - before.x) / before.scale * after.scale + after.x, point.x, "x anchor moved");
    close((point.y - before.y) / before.scale * after.scale + after.y, point.y, "y anchor moved");
  }
  async function wheel(delta) {
    const before = await readCamera(targetPage);
    await targetPage.mouse.move(rect.x + anchor.x, rect.y + anchor.y);
    await targetPage.mouse.wheel(0, delta);
    await targetPage.waitForFunction((scale) => document.querySelector("#viewport").transform.baseVal.consolidate().matrix.a !== scale, before.scale);
    const after = await readCamera(targetPage);
    anchored(before, after, anchor);
    return after;
  }
  await wheel(-100);
  const start = await targetPage.evaluate(() => {
    const svg = document.querySelector("#graph");
    const r = svg.getBoundingClientRect();
    for (let y = 80; y < r.height - 120; y += 30) {
      for (let x = 30; x < r.width - 90; x += 30) {
        if (document.elementFromPoint(r.x + x, r.y + y) === svg) return { x: r.x + x, y: r.y + y };
      }
    }
    throw new Error("No canvas background available for drag check");
  });
  const beforeDrag = await readCamera(targetPage);
  await targetPage.mouse.move(start.x, start.y);
  await targetPage.mouse.down();
  await targetPage.mouse.move(start.x + 55, start.y + 35, { steps: 8 });
  await targetPage.mouse.up();
  const afterDrag = await readCamera(targetPage);
  close(afterDrag.x - beforeDrag.x, 55, "mouse pan x");
  close(afterDrag.y - beforeDrag.y, 35, "mouse pan y");
  assert.equal(afterDrag.scale, beforeDrag.scale);
  await wheel(100); // Anchor must still hold after panning.
  await wheel(-100);
  const beforeButtons = await readCamera(targetPage);
  for (const id of ["zoom-in", "zoom-out"]) {
    const before = await readCamera(targetPage);
    await targetPage.locator("#" + id).click();
    anchored(before, await readCamera(targetPage), { x: rect.width / 2, y: rect.height / 2 });
  }
  const afterButtons = await readCamera(targetPage);
  close(afterButtons.scale, beforeButtons.scale, "button pair scale");
  close(afterButtons.x, beforeButtons.x, "button pair x");
  close(afterButtons.y, beforeButtons.y, "button pair y");
  await targetPage.locator("#reset-view").click();
  assert.deepEqual(await readCamera(targetPage), { scale: 1, x: 0, y: 0 });
  return wheel(-100); // Keep a non-default camera for the detail/Back assertions.
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
