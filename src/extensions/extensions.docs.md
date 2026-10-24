# Public extension contracts

## Responsibilities

- Define host-independent TypeScript contracts for explicitly installed, trusted executable extensions, including commands, lifecycle events, UI contributions and bounded scoped memory operations.
- Keep `index.ts` safe to import without loading a desktop host, compiler, CLI parser, Node infrastructure or memory engine.
- Expose version 1 of the extension API separately from the normal local-memory runtime. Registration and renderer mounting/disposal are distinct lifetimes.

## Non-responsibilities

- Do not load packages, select a brain, authorize writes, execute commands or render UI here.
- Do not imply capability declarations sandbox trusted same-process code. Core canonical policy and target authorization remain in their existing owners.
