#!/usr/bin/env python3
"""Validate fictional sources and exact freeze bytes without product/model calls."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import uuid

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "AUTHOR-FREEZE.json"


def inventory():
    return [dict(path=str(path.relative_to(HERE)), bytes=path.stat().st_size,
                 sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            for path in sorted(HERE.rglob("*"))
            if path.is_file() and path != MANIFEST and "__pycache__" not in path.parts]


def digest(files):
    return hashlib.sha256("".join(f"{f['sha256']}  {f['path']}\n" for f in files).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--freeze", action="store_true", help="Initial author freeze only; refuses to replace an existing manifest")
    args = parser.parse_args()
    queries = json.loads((HERE / "queries.json").read_text())
    rubric = json.loads((HERE / "rubric.json").read_text())
    protected = json.loads((HERE / "PROTECTED-UNITS.json").read_text())
    controls = json.loads((HERE / "CONSTRAINTS.json").read_text())
    sources = {str(p.relative_to(HERE / "corpus")): p.read_text() for p in (HERE / "corpus").rglob("*.md")}
    assert len(sources) == 30 and len(queries) == len(rubric) == 18
    assert len({q["id"] for q in queries}) == len(queries)
    assert {q["id"] for q in queries} == {r["id"] for r in rubric}
    ids = []
    for name, text in sources.items():
        id = re.search(r'^id: "mem_([a-f0-9-]+)"$', text, re.M).group(1)
        uuid.UUID(id)
        ids.append(id)
        assert re.search(r'^date: "2026-\d{2}-\d{2}"$', text, re.M), name
        assert re.search(r'^created_at: "2026-\d{2}-\d{2}"$', text, re.M), name
    assert len(set(ids)) == len(ids)
    count = 0
    for row in rubric:
        assert set(row["relevant"]) <= sources.keys()
        for unit in row["units"]:
            count += 1
            for alt in unit["alternatives"]:
                for clause in alt["required"]:
                    assert clause in sources[alt["file"]], (row["id"], unit["label"])
    assert len(protected["units"]) == count
    assert protected["units"] == [dict(case=row["id"], label=u["label"], alternatives=u["alternatives"]) for row in rubric for u in row["units"]]
    assert protected["protectedCases"] == [q["id"] for q in queries if q["protected"]]
    for control in controls["controls"]:
        assert set(control["cases"]) <= {q["id"] for q in queries}
        for key in ("misleadingSource", "requiredSource", "requiredFile", "forbiddenFile"):
            if key in control:
                assert control[key] in sources
    files = inventory()
    if args.freeze:
        assert not MANIFEST.exists(), "Refusing to replace an existing author freeze"
        manifest = dict(schemaVersion=1, frozenAt=datetime.now(timezone.utc).isoformat(),
            status="inputs_frozen_no_evaluation", scope="independent-fictional-fixture-only",
            pages=len(sources), queries=len(queries), sourceSpecificUnits=count,
            files=files, digestAlgorithm="SHA-256 of sorted UTF-8 sha256  relative/path\\n lines", digest=digest(files))
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    manifest = json.loads(MANIFEST.read_text())
    assert files == manifest["files"], "File inventory or exact bytes differ from author freeze"
    assert digest(files) == manifest["digest"]
    assert (manifest["pages"], manifest["queries"], manifest["sourceSpecificUnits"]) == (len(sources), len(queries), count)
    print(f"Verified {len(sources)} pages, {len(queries)} cases, {count} source-specific units; digest {manifest['digest']}; no retrieval executed.")


if __name__ == "__main__":
    main()
