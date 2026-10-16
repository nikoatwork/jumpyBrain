import assert from "node:assert/strict";
import test from "node:test";

import { numberArg, parseArgs, stringArg, stringListArg } from "../dist/cli/args.js";
import { assertProperty, fc, safeScalarString } from "./property-helpers.js";

const cliToken = safeScalarString.filter((value) => value.trim().length > 0 && !value.startsWith("--"));
const flagName = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);

test("CLI parser preserves positional tokens when no flags are present", () => {
  assertProperty(fc.property(fc.array(cliToken, { maxLength: 8 }), (tokens) => {
    assert.deepEqual(parseArgs(tokens), { _: tokens });
  }));
});

test("CLI parser accumulates repeated flags and leaves valueless flags boolean", () => {
  assertProperty(fc.property(cliToken, cliToken, (first, second) => {
    const parsed = parseArgs(["remember", "--tag", first, "--tag", second, "--json"]);

    assert.deepEqual(parsed._, ["remember"]);
    assert.deepEqual(parsed.tag, [first, second]);
    assert.equal(parsed.json, true);
  }));
});

test("CLI string and list argument helpers read current parser shapes", () => {
  assertProperty(fc.property(flagName, cliToken, cliToken, (key, first, second) => {
    const parsed = parseArgs(["--" + key, first, "--" + key, second]);

    assert.equal(stringArg(parsed, key), first);
    assert.deepEqual(stringListArg(parsed, key), [first, second]);
    assert.equal(stringArg(parsed, "missing", "fallback"), "fallback");
    assert.equal(stringArg(parsed, "missing", false), "");
  }));
});

test("CLI number argument helper accepts positive integers and rejects invalid values", () => {
  assertProperty(fc.property(fc.integer({ min: 1, max: 100_000 }), (value) => {
    assert.equal(numberArg({ _: [], limit: String(value) }, "limit", 5), value);
  }));

  const invalid = fc.oneof(
    fc.integer({ max: 0 }).map(String),
    fc.float({ noNaN: true, noDefaultInfinity: true }).filter((value) => !Number.isInteger(value) && value > 0).map(String),
    cliToken.filter((value) => Number.isNaN(Number(value))),
  );
  assertProperty(fc.property(invalid, (value) => {
    assert.throws(() => numberArg({ _: [], limit: value }, "limit", 5), /--limit must be a positive integer/);
  }));
});
