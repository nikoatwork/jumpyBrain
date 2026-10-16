import assert from "node:assert/strict";
import test from "node:test";
import { referenceEligibility, safeReferenceTitle } from "../dist/adapters/http-server/reference-policy.js";
import { safeTitle } from "../dist/adapters/http-server/reference-ranges.js";
import { createBrowserSearchRequest, memoryDocumentPath } from "../dist/adapters/http-server/browser-transport.js";
import { HTTP_MEMORY_ROUTES } from "../dist/adapters/http-protocol.js";

const id = "mem_a0000000-0000-4000-8000-000000000001";
const otherId = "mem_a0000000-0000-4000-8000-000000000002";
test("both reference pickers and scanner share exact title and canonical ID eligibility", () => {
  assert.equal(safeTitle, safeReferenceTitle);
  for (const title of [null, "", " ", " leading", "trailing ", "[x", "x]", "x|y", "x#y", "x/y", "x\\y", ...Array.from({ length: 32 }, (_, i) => `a${String.fromCharCode(i)}b`), "a\x7fb"]) {
    assert.equal(referenceEligibility({ documentId: id, referenceTitle: title }, []), "unsafe_title", JSON.stringify(title));
  }
  for (const title of ["Normal title", "Two  spaces", "What's next?", "世界 · Draft—2", '<img onerror="x">', "C++ & Rust: 50%!"]) {
    const result = { documentId: id, referenceTitle: title };
    assert.equal(referenceEligibility(result, [result]), null, title);
    assert.equal(referenceEligibility(result, [result, { ...result }]), null, "same ID is not an ambiguous title");
    assert.equal(referenceEligibility(result, [{ documentId: otherId, referenceTitle: title.toUpperCase() }]), "visible_duplicate");
    for (const documentId of [null, undefined, "", "qmd-hit-id", "mem_invalid"]) {
      assert.equal(referenceEligibility({ ...result, documentId }, []), "missing_id");
    }
  }
});

test("shared browser search delegates authenticated transport with the exact request and abort signal", async () => {
  const calls = [], signal = new AbortController().signal;
  const expected = { results: [] };
  const search = createBrowserSearchRequest(async (...args) => { calls.push(args); return expected; });
  assert.equal(await search("a & b", signal), expected);
  assert.equal(calls[0][0], HTTP_MEMORY_ROUTES.search);
  assert.deepEqual(calls[0][1], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "a & b", limit: 24, depth: "normal" }), signal });
  assert.equal(memoryDocumentPath("a/b ?"), "/memories/all/documents/a%2Fb%20%3F");
});
