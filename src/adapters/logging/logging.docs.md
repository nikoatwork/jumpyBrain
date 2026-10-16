# Logging module docs

## Responsibilities

- Provide small filesystem logging helpers for infrastructure boundaries such as the server.
- Keep log creation deterministic and safe for support files under `.jumpybrain/`.
- Remain easy to replace if logging moves to another adapter later.

## Non-responsibilities

- Do not own memory semantics, retrieval behavior, or write policy.
- Do not parse CLI commands or HTTP requests.
- Do not make tests depend on synchronous log writes; callers that inspect logs should poll for expected content.
