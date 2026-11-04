import { showSidebar } from './editor-smoke-helpers.mjs';
// Lost acknowledgments and concurrent peer edits on disposable hosted notes.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import {
  loadPlaywrightChromium,
  launchPlaywrightChromium,
} from "./playwright-runtime.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
import { appendEditorText, editorMarkdown } from "./editor-smoke-helpers.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jb-ux-uncertain-"));
const key = "disposable-uncertain-save-key",
  results = [];
let server, browser;
const saved = (page) =>
  page.waitForFunction(
    () => state.editor?.collaboration?.state.status === "saved",
  );
try {
  await initializeMemoryRoot(root);
  server = await startJumpyBrainHttpServer({
    root,
    apiKeys: [key],
    port: 0,
    autoIndex: false,
  });
  browser = await launchPlaywrightChromium({
    chromium: await loadPlaywrightChromium(),
  });
  let sequence = 0;
  for (const width of [1280, 390])
    for (const kind of ["accepted-body", "accepted-title", "rejected-body"]) {
      sequence++;
      const id =
        "mem_41220000-1111-4111-8111-" + String(sequence).padStart(12, "0");
      const file = path.join(root, "notes", sequence + ".md");
      const initial = `---\nid: ${id}\ntype: note\ntitle: Uncertain fixture ${sequence}\n---\nHuman baseline ${sequence}.\n`;
      await writeFile(file, initial);
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const transport = await installCollaborationSmokeTransport(page);
      await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
      await saved(page);
      const peer = await browser.newPage();
      await peer.goto(`${server.url}/?note=${id}#apiKey=${key}`);
      await saved(peer);
      const marker = ` unique human ${sequence}`;
      // Title broadcasts have no operation ID. Hold that independent evidence
      // too, so the test genuinely loses both confirmation channels.
      const titleEvent =
        kind === "accepted-title"
          ? transport.holdNextEvent(
              id,
              (snapshot) => snapshot.title === "Private title " + sequence,
            )
          : null;
      const fault =
        kind === "rejected-body"
          ? transport.rejectNext("edit", { code: "fixture_failed" })
          : transport.dropNextReply(
              kind === "accepted-title" ? "title" : "edit",
            );
      if (kind === "accepted-title")
        await page.locator("#note-name").fill("Private title " + sequence);
      else await appendEditorText(page, marker);
      await fault.arrived;
      if (titleEvent) {
        await titleEvent.arrived;
        titleEvent.release();
      }
      await page.waitForFunction(
        () => state.editor?.state.saveStatus === "failed",
      );
      const privateDraft = await editorMarkdown(page),
        privateTitle = await page.locator("#note-name").inputValue();
      if (kind !== "rejected-body")
        assert.equal(
          await page.evaluate(() => state.editor.state.unconfirmedSave),
          true,
          `${width}/${kind}: actual unconfirmed-save state`,
        );
      const accepted = await readFile(file, "utf8");
      if (kind === "rejected-body")
        assert.doesNotMatch(accepted, new RegExp(marker));
      else
        assert.ok(
          accepted.includes(kind === "accepted-title" ? privateTitle : marker),
        );
      await saved(peer);
      if (kind === "accepted-body")
        await peer.waitForFunction(
          (text) => richEditor.getMarkdown().includes(text),
          marker,
        );
      if (kind === "accepted-title")
        await peer.waitForFunction(
          (text) => document.querySelector("#note-name").value === text,
          privateTitle,
        );
      const peerMarker = " confirmed peer " + sequence;
      await appendEditorText(peer, peerMarker);
      await saved(peer);
      const afterPeer = await readFile(file, "utf8");
      assert.ok(afterPeer.includes(peerMarker));
      assert.equal(
        await editorMarkdown(page),
        privateDraft,
        "a failed/uncertain draft stays visible through peer updates",
      );
      assert.equal(await page.locator("#note-name").inputValue(), privateTitle);
      await showSidebar(page);await page.locator("#home-link").click();
      await page.waitForFunction(() => !state.editor.state.navigationPending);
      assert.equal(
        new URL(page.url()).searchParams.get("note"),
        id,
        "failed drafts keep the navigation barrier",
      );
      await page.locator("#note-recover").click();
      await page.waitForFunction(
        (text) =>
          document.querySelector("#recovery-saved").value.includes(text),
        peerMarker,
      );
      assert.equal(
        await page.locator("#recovery-draft").inputValue(),
        privateTitle + "\n\n" + privateDraft,
      );
      await page.locator("#recovery-copy").click();
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        privateTitle + "\n\n" + privateDraft,
      );
      assert.equal(
        await readFile(file, "utf8"),
        afterPeer,
        "review/copy do not publish or replay an uncertain edit",
      );
      await page.locator("#recovery-reload").click();
      await saved(page);
      assert.equal(await page.locator("#document-recovery").isVisible(), false);
      assert.match(await editorMarkdown(page), new RegExp(peerMarker));
      assert.equal(
        await readFile(file, "utf8"),
        afterPeer,
        "accepting saved content makes no canonical write",
      );
      if (kind === "accepted-body")
        assert.equal(
          afterPeer.split(marker).length,
          2,
          "accepted edit is present exactly once",
        );
      if (kind === "rejected-body")
        assert.doesNotMatch(await editorMarkdown(page), new RegExp(marker));
      await page.reload();
      await saved(page);
      assert.match(await editorMarkdown(page), new RegExp(peerMarker));
      assert.equal(await readFile(file, "utf8"), afterPeer);
      results.push(
        `${width}/${kind}: uncertain/private draft, peer preservation, guarded navigation, copy and explicit saved acceptance`,
      );
      console.log(JSON.stringify({ checkpoint: results.at(-1) }));
      await peer.close();
      await context.close();
    }
  console.log(
    JSON.stringify({
      passed: true,
      results,
      limits: [
        "Localhost Chromium fault injection; no native-client or real remote-brain claim.",
      ],
    }),
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(root, { recursive: true, force: true });
}
