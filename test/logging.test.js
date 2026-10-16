import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";

import { repoRoot } from "./source-graph-helpers.js";

async function loadLoggingModule() {
  return import(pathToFileURL(path.join(repoRoot, "dist/adapters/logging/index.js")).href);
}

test("file logger formats compact human-readable lines and redacts secrets", async () => {
  const logging = await loadLoggingModule();
  const line = logging.formatLogLine({
    date: new Date("2026-07-04T10:00:00.000Z"),
    level: "info",
    event: "HTTP Request",
    details: {
      method: "POST",
      path: "/memories/all/index",
      status: 200,
      authorization: "Bearer secret-token",
      body: "raw memory body",
      note: "hello world",
    },
  });

  assert.equal(line, '2026-07-04T10:00:00.000Z INFO http-request method=POST path=/memories/all/index status=200 authorization="[redacted]" body="[redacted]" note="hello world"');
  assert.doesNotMatch(line, /secret-token|raw memory body/);
});

test("file logger swallows append failures", async () => {
  const logging = await loadLoggingModule();
  const logger = logging.createFileLogger({
    root: "/tmp/jumpybrain-logger-test",
    name: "server",
    now: () => new Date("2026-07-04T10:00:00.000Z"),
    append: async () => { throw new Error("disk full"); },
  });

  assert.doesNotThrow(() => logger.info("event", { ok: true }));
  await new Promise((resolve) => setTimeout(resolve, 5));
});
