# Support diagnostics use case

## Responsibilities

- Compose explicit, named host snapshot sources with a finite collection deadline. Sanitize every source and cap event counts; report missing/degraded evidence. Merge safe data only, never read arbitrary paths or legacy logs.
- Source selection is supplied by a trusted host: a local companion can include its local server; remote brains supply no server filesystem evidence. Correlation is remapped at the final browser export.

## Non-responsibilities

- No protocol/authentication, filesystem ownership policy, telemetry, email delivery, memory writes, indexing or provider execution.
