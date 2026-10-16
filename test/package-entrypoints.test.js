import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("package manifest stays source/installer-first without restrictive exports", () => {
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.main, "./dist/index.js");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.equal(packageJson.bin?.jumpybrain, "dist/cli.js");
  assert.equal(packageJson.exports, undefined);
});
