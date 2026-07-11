import assert from "node:assert/strict";
import test from "node:test";

import {
  HARD_DREAM_CAPS,
  compareDreamBatchFiles,
  dreamCursorFor,
  isDreamCursorAfter,
  maxDreamCursor,
  normalizeDreamLimits,
  normalizeDreamRelativeFile,
} from "../dist/core/dream/index.js";

test("core dream policy orders cursors by mtime then path and handles equal-time overflow", () => {
  const first = dreamCursorFor("findings/a.md", 1000);
  const second = dreamCursorFor("findings/b.md", 1000);
  const later = dreamCursorFor("notes/a.md", 1001);

  assert.equal(isDreamCursorAfter(second, first), true);
  assert.equal(isDreamCursorAfter(first, second), false);
  assert.equal(isDreamCursorAfter(later, second), true);
  assert.deepEqual(maxDreamCursor(first, later), later);
  assert.equal(compareDreamBatchFiles({ file: "findings/b.md", mtimeMs: 1 }, { file: "findings/a.md", mtimeMs: 1 }) > 0, true);
});

test("core dream policy normalizes caps and rejects unsafe relative files", () => {
  assert.deepEqual(normalizeDreamLimits({ maxFiles: 999, bytesPerFile: 999999, maxTotalBytes: 9999999 }), HARD_DREAM_CAPS);
  assert.deepEqual(normalizeDreamLimits({ maxFiles: 0, bytesPerFile: -1, maxTotalBytes: Number.NaN }), {
    maxFiles: 10,
    bytesPerFile: 16 * 1024,
    maxTotalBytes: 128 * 1024,
  });
  assert.equal(normalizeDreamRelativeFile("/findings/a.md"), "findings/a.md");
  assert.throws(() => normalizeDreamRelativeFile("../findings/a.md"), /invalid canonical relative file path/i);
  assert.throws(() => normalizeDreamRelativeFile(".jumpybrain/dream/state.json"), /invalid canonical relative file path/i);
});
