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
  assert.ok(gzipSync(bundle).length < 160_000, "review editor weight if the production bundle exceeds 160 KB gzip");
  const html = graphPageHtml("lexicalbundle");
  assert.ok(html.includes(bundle));
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.match(html, /<script nonce="lexicalbundle">/);
  assert.match(html, /role="textbox" aria-multiline="true"/);
  assert.doesNotMatch(html, /<textarea id="note-editor"/);
});

test("bundled third-party code ships license notices without production npm dependencies", async () => {
  const notices = await readFile(new URL("../dist/adapters/http-server/editor-LICENSES.txt", import.meta.url), "utf8");
  assert.match(notices, /node_modules\/lexical/);
  assert.match(notices, /Permission is hereby granted/);
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
  for (const [name, version] of Object.entries(pkg.devDependencies)) {
    if (name === "lexical" || name.startsWith("@lexical/")) assert.equal(version, pkg.devDependencies.lexical);
  }
});
