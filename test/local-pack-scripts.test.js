import assert from "node:assert/strict";
import test from "node:test";

import {
  forbiddenLocalPackFiles,
  forbiddenLocalPackPathPrefixes,
  localPackValidationMessage,
  requiredLocalPackFiles,
  validateLocalPackFiles,
} from "../scripts/local-pack-manifest.mjs";

const packed = (...segments) => ["package", "dist", ...segments].join("/");

test("local pack manifest covers final layered CLI/runtime files", () => {
  assert.ok(requiredLocalPackFiles.includes(packed("cli.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("cli", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("cli", "commands.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("cli", "recipes.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("cli", "args.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("cli", "doctor.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("cli", "local-transport.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("cli", "memory-commands.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("cli", "memory-target.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("cli", "serve.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("cli", "usage.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "writing", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "writing", "filesystem.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "writing", "local-writer.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "writing", "remote-writer.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "local-memory", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "processing", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "processing", "ensure-ids.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "processing", "processor.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "server-memory", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "server-memory", "auto-index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "server-memory", "state.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("app", "server-memory", "idempotency.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("adapters", "http-protocol.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("adapters", "http-client", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("adapters", "http-server", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("adapters", "http-server", "routes.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("adapters", "http-server", "state.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("adapters", "http-server", "idempotency.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("adapters", "logging", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("adapters", "package-info", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("adapters", "qmd", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("core", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("core", "canonical", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("core", "canonical", "markdown-store.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("core", "frontmatter.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("core", "memory-root", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("core", "retrieval-policy", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("core", "writing", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("core", "writing", "document-id-stamping.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("runtime", "index.js")));
  assert.ok(requiredLocalPackFiles.includes(packed("runtime", "index.d.ts")));
  assert.ok(requiredLocalPackFiles.includes(packed("server", "index.js")));

  assert.ok(forbiddenLocalPackPathPrefixes.includes(`${packed("retrieval")}/`));
  assert.ok(forbiddenLocalPackPathPrefixes.includes(`${packed("qmd")}/`));
  assert.ok(forbiddenLocalPackFiles.includes(packed("server", "http.js")));
});

test("local pack validation reports missing and stale pre-refactor files", () => {
  assert.deepEqual(validateLocalPackFiles([...requiredLocalPackFiles]), {
    required: requiredLocalPackFiles.length,
    stale: 0,
  });

  assert.throws(
    () => validateLocalPackFiles(requiredLocalPackFiles.slice(1)),
    /Missing required files:\n- package\/package\.json/,
  );

  const stalePackedFile = packed("qmd", "index.js");
  assert.throws(
    () => validateLocalPackFiles([...requiredLocalPackFiles, stalePackedFile]),
    new RegExp(`Stale pre-refactor files must not be packed:\\n- ${stalePackedFile.replaceAll("/", "\\/").replaceAll(".", "\\.")}`),
  );

  assert.match(
    localPackValidationMessage({ missing: [packed("runtime", "index.js")], stale: [stalePackedFile] }),
    /Local CLI package contents are invalid\./,
  );
});
