import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { gzipSync } from "node:zlib";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";

const bundle = await readFile(new URL("../dist/adapters/http-server/editor-bundle.js", import.meta.url), "utf8");

test("editor bundle is self-contained, production-sized, and safe to inline under the shell nonce", () => {
  assert.doesNotThrow(() => new vm.Script(bundle));
  assert.doesNotMatch(bundle, /<\/script/i);
  // The live heading rail adds ~2 KB gzip, with no new dependencies.
  // Reviewed production size is ~189.4 KB including collaborative sidebar refresh.
  // Collaborative sidebar adds bounded shelves, polling and declared-editor glyphs.
  assert.ok(gzipSync(bundle).length < 190_000, "review editor weight if the production bundle exceeds 190 KB gzip");
  const html = graphPageHtml("lexicalbundle");
  assert.ok(html.includes(bundle));
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  for (const script of html.matchAll(/<script\b([^>]*)>/g)) assert.equal(script[1], ' nonce="lexicalbundle"');
  assert.match(html, /<script nonce="lexicalbundle">/);
  assert.match(html, /role="textbox" aria-multiline="true"/);
  assert.doesNotMatch(html, /<textarea id="note-editor"/);
});

test("bundled editor code ships license notices without production editor dependencies", async () => {
  const notices = await readFile(new URL("../dist/adapters/http-server/editor-LICENSES.txt", import.meta.url), "utf8");
  assert.match(notices, /node_modules\/lexical/);
  assert.match(notices, /Permission is hereby granted/);
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(pkg.dependencies, { esbuild: "0.28.2" }, "only the lazily loaded extension compiler is a production dependency");
  assert.doesNotMatch(bundle, /node_modules\/esbuild|JumpyBrainExtensionBrowser/, "ordinary editor does not embed the extension compiler or renderer");
  for (const [name, version] of Object.entries(pkg.devDependencies)) {
    if (name === "lexical" || name.startsWith("@lexical/")) assert.equal(version, pkg.devDependencies.lexical);
  }
});

test("optional extension renderer is nonce-safe and only embedded by the desktop companion", async () => {
  const extensions = await readFile(new URL("../dist/adapters/http-server/extensions-bundle.js", import.meta.url), "utf8");
  assert.doesNotThrow(() => new vm.Script(extensions));
  assert.doesNotMatch(extensions, /<\/script/i);
  assert.ok(gzipSync(extensions).length < 6_000, "review optional desktop extension renderer growth beyond 6 KB gzip");
  assert.equal(graphPageHtml("extensions").includes(extensions), false);
  assert.equal(graphPageHtml("extensions", "home", { companion: true }).includes(extensions), true);
});
