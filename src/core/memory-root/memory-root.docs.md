# Core memory-root docs

## Responsibilities

- Initialize and inspect memory-root configuration, schema compatibility, standard directories, and derived-state ignore policy.
- Resolve configured memory and index roots using filesystem-local rules that runtime, CLI, and server composition can reuse.
- Keep memory-root setup independent of host package metadata by accepting injected version data from callers.

## Non-responsibilities

- Do not own QMD indexing/search execution or derived index state beyond path policy constants.
- Do not parse CLI commands or serve HTTP requests.
- Do not read package metadata, logging adapters, remote API configuration, or secrets.
