import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "../dist/cli/args.js";

for (const command of [["process"], ["run", "memory:process"]]) {
  test(`${command.join(" ")} rejects repeated apply before last-flag coercion`, () => {
    for (const flags of [
      ["--apply", "false", "--apply"], ["--apply", "--apply"],
      ["--apply=false", "--apply"], ["--apply=true", "--apply=true"],
      ["--apply", "true", "--apply", "false"],
    ]) assert.throws(() => parseArgs([...command, "--mode", "lint", ...flags]), /--apply must not be repeated/);
    assert.equal(parseArgs([...command, "--apply", "false"]).apply, "false");
    assert.equal(parseArgs([...command, "--apply"]).apply, true);
  });
}
