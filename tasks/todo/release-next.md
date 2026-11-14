# Changes

- When a shared brain or its proxy refuses requests (HTTP 429 or 503), the CLI explains whether requests were rate-limited, the brain was busy, or the service was unavailable, and shows a wait time only when the server provided one. It never retries automatically. With `--json`, failing memory, `run memory:*` and `board` commands now print a single `{"error": {...}}` object on stdout instead of plain text on stderr.
