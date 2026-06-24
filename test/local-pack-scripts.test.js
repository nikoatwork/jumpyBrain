import assert from "node:assert/strict";
import test from "node:test";

import {
  forbiddenLocalPackFiles,
  localPackValidationMessage,
  requiredLocalPackFiles,
  validateLocalPackFiles,
} from "../scripts/local-pack-manifest.mjs";

test("local pack manifest covers modular CLI/runtime files", () => {
  assert.ok(requiredLocalPackFiles.includes("package/dist/cli.js"));
  assert.ok(requiredLocalPackFiles.includes("package/dist/cli/local-transport.js"));
  assert.ok(requiredLocalPackFiles.includes("package/dist/runtime/index.js"));
  assert.ok(requiredLocalPackFiles.includes("package/dist/runtime/index.d.ts"));
  assert.ok(requiredLocalPackFiles.includes("package/dist/core/index.js"));
  assert.ok(requiredLocalPackFiles.includes("package/dist/qmd/index.js"));
  assert.ok(requiredLocalPackFiles.includes("package/dist/server/index.js"));

  assert.ok(forbiddenLocalPackFiles.includes("package/dist/retrieval/qmd-cli.js"));
  assert.ok(forbiddenLocalPackFiles.includes("package/dist/retrieval/qmd-driver.d.ts"));
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

  assert.throws(
    () => validateLocalPackFiles([...requiredLocalPackFiles, "package/dist/retrieval/qmd-cli.js"]),
    /Stale pre-refactor files must not be packed:\n- package\/dist\/retrieval\/qmd-cli\.js/,
  );

  assert.match(
    localPackValidationMessage({ missing: ["package/dist/runtime/index.js"], stale: ["package/dist/retrieval/qmd-cli.js"] }),
    /Local CLI package contents are invalid\./,
  );
});
