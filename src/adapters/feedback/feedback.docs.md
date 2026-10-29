# Feedback transport

## Responsibilities

- Share report validation, bounded responses and HTTPS relay delivery between CLI and UI hosts. Reports have a UUID v4, up to 4,000 message characters and optional bounded diagnostics. Confirm only a matching accepted ID; refuse redirects and never forward memory credentials.
- Preserve runtime `JUMPYBRAIN_FEEDBACK_URL` precedence (empty disables delivery) and the existing packaged `http-server/feedback-config.json` location.
- Keep the fixed-recipient AgentMail sender available to the central relay. Only that operator process supplies a mail key; product clients need none.

## Non-responsibilities

- No CLI parsing, HTTP route admission/authentication, automatic diagnostic collection, retries, memory access or inbox reading.
- Do not treat provider acceptance as verified inbox receipt.
