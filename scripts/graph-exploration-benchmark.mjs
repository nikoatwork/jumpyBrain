// Disposable graph assembly + browser presentation measurements. No personal brain/app writes.
// npm run build && npx --package=playwright node scripts/graph-exploration-benchmark.mjs --output PATH
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { graphMemory, initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import {
  loadPlaywrightChromium,
  launchPlaywrightChromium,
} from "./playwright-runtime.mjs";
const arg = (name) => {
  const n = process.argv.indexOf(name);
  return n < 0 ? undefined : process.argv[n + 1];
};
const sizes = (arg("--sizes") || "100,500,1650,10000").split(",").map(Number);
const output = arg("--output");
const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-graph-measure-"));
let browser, server;
const result = {
  date: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceDiff: execFileSync("git", ["diff", "--stat"], {
    encoding: "utf8",
  }).trim(),
  build: JSON.parse(await readFile(new URL("../dist/adapters/diagnostics/build-info.json", import.meta.url),"utf8")),
  bundleSha256: createHash("sha256").update(await readFile(new URL("../dist/adapters/http-server/editor-bundle.js",import.meta.url))).digest("hex"),
  driverSha256: createHash("sha256").update(await readFile(new URL(import.meta.url))).digest("hex"),
  node: process.version,
  platform: process.platform,
  cpu: os.cpus()[0].model,
  totalMemory: os.totalmem(),
  viewport: { width: 1280, height: 844 },
  rows: [],
  limitations:
    "Single-process Node RSS and renderer JS heap are separate diagnostics, not whole-desktop physical footprint; no production GC. Three repetitions, disposable synthetic notes; lexical/semantic indexing and remote latency are measured separately.",
};
try {
  await initializeMemoryRoot(root);
  const chromium = await loadPlaywrightChromium();
  browser = await launchPlaywrightChromium({ chromium });
  result.browser = browser.version();
  server = await startJumpyBrainHttpServer({
    root,
    apiKeys: ["disposable-graph-benchmark"],
    port: 0,
    autoIndex: false,
  });
  for (const size of sizes) {
    await rm(path.join(root, "notes"), { recursive: true, force: true });
    await mkdir(path.join(root, "notes"));
    for (let base = 0; base < size; base += 100)
      await Promise.all(
        Array.from({ length: Math.min(100, size - base) }, (_, offset) => {
          const i = base + offset,
            title = i % 20 === 0 ? "Health " + i : "Journal " + i;
          // Linked components of20 plus a few hubs, with isolated notes and long labels.
          const links =
            i % 17 === 0
              ? ""
              : Array.from(
                  { length: i % 20 === 0 ? Math.min(19, size - i - 1) : 1 },
                  (_, j) =>
                    "[[Journal " + (i % 20 === 0 ? i + j + 1 : i - 1) + "]]",
                ).join(" ");
          return writeFile(
            path.join(root, "notes", String(i).padStart(5, "0") + ".md"),
            "---\nid: mem_" +
              i.toString(16).padStart(8, "0") +
              "-0000-4000-8000-000000000001\ntitle: " +
              JSON.stringify(title) +
              "\ntype: note\n---\n\n" +
              links +
              "\nHealth and sleep evidence " +
              i +
              ".\n",
          );
        }),
      );
    for (let rep = 0; rep < 3; rep++) {
      const before = process.memoryUsage(),
        cpu = process.cpuUsage(),
        start = performance.now();
      const packet = await graphMemory(root, {
        limit: 10000,
        includeSnippets: false,
        edgeLimit: 20000,
      });
      const assemblyMs = performance.now() - start;
      const page = await browser.newPage({ viewport: result.viewport });
      await page.route("**/memories/all/graph.json?*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(packet),
        }),
      );
      await page.goto(server.url + "/graph#apiKey=disposable-graph-benchmark");
      await page.getByTestId("graph-ready").waitFor({ state: "visible" });
      const session = await page.context().newCDPSession(page);
      await session.send("Performance.enable");
      const metrics = await page.evaluate(async (packet) => {
        const start = performance.now();
        map.render(packet, true);
        const renderMs = performance.now() - start;
        const frames = [];
        for (let i = 0; i < 8; i++) {
          const t = performance.now();
          map.zoomGraph(i % 2 ? 1 / 1.1 : 1.1);
          await new Promise(requestAnimationFrame);
          frames.push(performance.now() - t);
        }
        return {
          renderMs,
          frames,
          dom: document.getElementById("viewport").querySelectorAll("*").length,
          labels: [...document.querySelectorAll(".node.show-label")].length,
        };
      }, packet);
      const heap = await session.send("Performance.getMetrics");
      const counters = await session.send("Memory.getDOMCounters");
      await page.goto(server.url + "/");
      await page.waitForTimeout(150);
      const hidden = await page
        .locator("#viewport")
        .evaluate((n) => n.children.length);
      const row = {
        size,
        rep,
        assemblyMs,
        packetBytes: Buffer.byteLength(JSON.stringify(packet)),
        nodes: packet.nodes.length,
        edges: packet.edges.length,
        nodeRss: process.memoryUsage().rss,
        nodeHeap: process.memoryUsage().heapUsed,
        nodeRssBefore: before.rss,
        cpu: process.cpuUsage(cpu),
        ...metrics,
        rendererHeap: heap.metrics.find((m) => m.name === "JSHeapUsedSize")
          ?.value,
        counters,
        hiddenChildren: hidden,
      };
      result.rows.push(row);
      console.log(JSON.stringify(row));
      await page.close();
    }
  }
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}
if (output) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
}
