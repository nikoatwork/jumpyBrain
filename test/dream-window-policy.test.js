import assert from "node:assert/strict";
import test from "node:test";
import {
  compareDreamWindowFiles,
  HARD_DREAM_CAPS,
  parseDreamCalendarDay,
  resolveDreamWindow,
  selectDreamEvidenceDate,
  truncateDreamWindowContent,
} from "../dist/core/dream/index.js";

const now = new Date("2024-03-01T00:00:00.000Z");

test("dream windows resolve inclusive UTC calendar days, not rolling hours", () => {
  assert.deepEqual(resolveDreamWindow({}, now).window, {
    from: "2024-02-28", to: "2024-03-01", timezone: "UTC", dateBasis: "evidence",
  });
  assert.deepEqual(resolveDreamWindow({ from: "t-1d", days: 3 }, now).window, {
    from: "2024-02-27", to: "2024-02-29", timezone: "UTC", dateBasis: "evidence",
  });
  assert.equal(resolveDreamWindow({ from: "t-4d", days: 3 }, now).window.from, "2024-02-24");
  assert.equal(resolveDreamWindow({ from: "2024-02-29", days: 1 }, now).window.to, "2024-02-29");
  assert.equal(resolveDreamWindow({ from: "t-0d", days: 1 }, new Date("2024-03-01T23:30:00-08:00")).window.to, "2024-03-02");
  assert.equal(resolveDreamWindow({ from: "2024-01-01", days: 3 }, now).window.from, "2023-12-30");
  assert.equal(resolveDreamWindow({ from: "0001-01-01", days: 1 }, now).window.from, "0001-01-01");
});

test("dream windows reject impossible dates and ambiguous/unbounded requests", () => {
  for (const from of ["2023-02-29", "1900-02-29", "2024-02-30", "2024-04-31", "2024-00-01", "2024-13-01", "0000-01-01", "2024-1-01", "2024-01-01T00:00:00Z", "yesterday", "03/01/2024", "t--1d", "t-1h", "t-1.5d", "t-01d", " t-0d", "t-999999999999999999999d", 3]) {
    assert.throws(() => resolveDreamWindow({ from }, now), { code: "validation_failed" }, String(from));
  }
  assert.notEqual(parseDreamCalendarDay("2000-02-29"), undefined);
  assert.equal(parseDreamCalendarDay("2100-02-29"), undefined);
  for (const request of [
    { days: 0 }, { days: -1 }, { days: 1.2 }, { days: 366 }, { days: "3" },
    { offset: -1 }, { offset: 0.5 }, { offset: Infinity }, { offset: Number.MAX_SAFE_INTEGER + 1 },
    { dateBasis: "updated_at" }, { maxFiles: 0 }, { bytesPerFile: NaN }, { maxTotalBytes: "8" },
    { from: "0001-01-01", days: 2 }, { from: "t-999999999d" },
  ]) assert.throws(() => resolveDreamWindow(request, now), { code: "validation_failed" });
  assert.throws(() => resolveDreamWindow({}, new Date("invalid")), { code: "validation_failed" });
  const capped = resolveDreamWindow({ maxFiles: 999, bytesPerFile: 999999, maxTotalBytes: 999999 }, now);
  assert.deepEqual(capped.limits, HARD_DREAM_CAPS);
  assert.equal(capped.warnings.length, 3);
});

function evidence(frontmatter = {}, file = "sessions/2022_04_21.md", dateBasis = "evidence") {
  return selectDreamEvidenceDate({ file, frontmatter, mtimeMs: now.getTime(), dateBasis });
}

test("dream evidence dates prefer explicit date, journal filename, creation metadata, then mtime", () => {
  assert.deepEqual(evidence({ date: "2020-02-29", created_at: "2023-01-01" }), { date: "2020-02-29", dateBasis: "date", warnings: [] });
  assert.equal(evidence({ created_at: "2023-01-01" }).date, "2022-04-21");
  assert.equal(evidence({ date: "broken" }).dateBasis, "filename");
  assert.match(evidence({ date: "broken" }).warnings[0], /invalid frontmatter date/);
  const creation = evidence({ created_at: "2020-01-02T00:30:00+02:00", updated_at: "2024-03-01" }, "notes/import.md");
  assert.equal(creation.date, "2020-01-01");
  assert.equal(creation.dateBasis, "created_at");
  assert.equal(evidence({ createdAt: "2019-01-01" }, "notes/import.md").dateBasis, "createdAt");
  assert.equal(evidence({ created_at: "2021-02-29", createdAt: "2020-02-29" }, "notes/import.md").date, "2020-02-29");
  const fallback = evidence({ updated_at: "1999-01-01", date: "2023-02-29", created_at: "2024-02-30T01:00:00Z" }, "sessions/2023-02-29.md");
  assert.equal(fallback.date, "2024-03-01");
  assert.equal(fallback.dateBasis, "mtime");
  assert.equal(fallback.warnings.length, 4);
  assert.match(fallback.warnings.at(-1), /import/);
  assert.equal(evidence({}, "notes/2020-01-01.md").dateBasis, "mtime", "ordinary dated notes are not journal filenames");
  assert.equal(evidence({ type: "session" }, "notes/2020-01-01-journal.md").date, "2020-01-01");
  assert.equal(evidence({ date: "2020-01-01" }, undefined, "modified").dateBasis, "modified");
  assert.equal(evidence({ date: "2020-01-01" }, undefined, "modified").date, "2024-03-01");
  for (const date of ["2020-01-01T24:00:00Z", "2020-01-01T00:00:00", "1/2/2020", true, ["2020-01-01"]]) {
    assert.equal(evidence({ date }, "notes/test.md").dateBasis, "mtime");
  }
});

test("dream window ordering is oldest date then locale-independent path; truncation keeps UTF-8", () => {
  const values = [
    { date: "2024-03-01", file: "notes/a.md" },
    { date: "2024-02-29", file: "notes/z.md" },
    { date: "2024-02-29", file: "notes/A.md" },
  ];
  assert.deepEqual(values.sort(compareDreamWindowFiles).map((v) => v.file), ["notes/A.md", "notes/z.md", "notes/a.md"]);
  const bytes = Buffer.from("a😀é日b");
  for (let budget = 0; budget <= bytes.length + 1; budget++) {
    const prefix = truncateDreamWindowContent(bytes, budget);
    assert.ok(prefix.length <= budget);
    assert.equal(prefix.toString("utf8").includes("�"), false);
    assert.ok(bytes.toString("utf8").startsWith(prefix.toString("utf8")));
  }
});
