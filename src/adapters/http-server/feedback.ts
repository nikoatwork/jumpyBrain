// Browser-only support diagnostics. Capture safe facts at source, never redact raw logs.
declare const __JUMPYBRAIN_VERSION__: string;
export const FEEDBACK_EMAIL = "jumpybrain@agentmail.to";
const SUBJECT = "jumpyBrain beta feedback";
const MAX_MESSAGE = 4000;
type Outcome = number | "failed" | "aborted";
type Entry = { at: string; operation: string; method: string; outcome: Outcome };

export function createFeedbackDiagnostics(now = () => new Date()) {
  const entries: Entry[] = [];
  return {
    record(url: string, method: string, outcome: Outcome) {
      // No origins, query strings, document IDs, headers, payloads or error messages.
      const operation = /^\/memories\/all\/documents\//.test(url) ? "document"
        : /^\/memories\/all\/(recent|search|graph|notes|index)(?:\.json)?(?:\?|$)/.exec(url)?.[1]
        ?? (/^\/companion\//.test(url) ? "companion" : "request");
      entries.push({ at: now().toISOString(), operation,
        method: ["GET", "POST", "PUT", "DELETE"].includes(method) ? method : "other",
        outcome: typeof outcome === "number" ? Math.max(0, Math.min(599, Math.trunc(outcome))) : outcome });
      if (entries.length > 40) entries.shift();
    },
    snapshot(context: { view: string; connection: string; companion: boolean }, userAgent: string) {
      const browser = /Electron\/([\d.]+)/.exec(userAgent) ?? /(Firefox|Edg|Chrome|Version)\/([\d.]+)/.exec(userAgent);
      const platform = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android"
        : /iPhone|iPad/.test(userAgent) ? "iOS" : /Macintosh/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "other";
      return JSON.stringify({ app: "jumpyBrain", version: typeof __JUMPYBRAIN_VERSION__ === "string" ? __JUMPYBRAIN_VERSION__ : "beta",
        generatedAt: now().toISOString(), platform,
        browser: browser ? browser[0] : "other", companion: context.companion,
        view: ["home", "note", "graph", "settings"].includes(context.view) ? context.view : "other",
        connection: ["checking", "connected", "disconnected", "unavailable"].includes(context.connection) ? context.connection : "other",
        events: entries }, null, 2);
    },
  };
}

function base64(text: string) {
  return btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));
}
function encodedPart(text: string) { return base64(text).match(/.{1,76}/g)?.join("\r\n") ?? ""; }

export function feedbackEmailDraft(message: string, diagnostics: string | null): string {
  // Base64 parts cannot contain this boundary; user input never enters headers.
  const boundary = "jumpybrain-feedback-boundary";
  const lines = [`To: ${FEEDBACK_EMAIL}`, `Subject: ${SUBJECT}`, "X-Unsent: 1", "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "",
    encodedPart(message.slice(0, MAX_MESSAGE).replace(/\r?\n/g, "\r\n"))];
  if (diagnostics !== null) lines.push(`--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"',
    'Content-Disposition: attachment; filename="jumpybrain-diagnostics.txt"', "Content-Transfer-Encoding: base64", "", encodedPart(diagnostics));
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

export function feedbackMailto(message: string, diagnostics: string | null): string {
  const body = message.slice(0, MAX_MESSAGE) + (diagnostics === null ? "" : "\n\nDiagnostic log (inline):\n" + diagnostics);
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`;
}

export function installFeedback(options: {
  document: Document; window: Window; diagnostics: ReturnType<typeof createFeedbackDiagnostics>;
  context: () => { view: string; connection: string; companion: boolean };
  onOpen?: () => void;
}) {
  const { document, window, diagnostics } = options;
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = element<HTMLDialogElement>("feedback-dialog");
  const message = element<HTMLTextAreaElement>("feedback-message");
  const include = element<HTMLInputElement>("feedback-include-logs");
  const preview = element<HTMLTextAreaElement>("feedback-logs");
  const mail = element<HTMLAnchorElement>("feedback-mailto");
  const status = element<HTMLElement>("feedback-status");
  let snapshot = "";
  function update() {
    preview.value = include.checked ? snapshot : "";
    preview.closest("details")!.hidden = !include.checked;
    mail.href = feedbackMailto(message.value, include.checked ? snapshot : null);
  }
  function close(restoreFocus = true) {
    if (!dialog.open) return;
    dialog.close();
    preview.value = "";
    snapshot = "";
    mail.removeAttribute("href");
    if (restoreFocus) element("open-feedback").focus({ preventScroll: true });
  }
  element("open-feedback").addEventListener("click", () => {
    if (dialog.open || document.querySelector("dialog[open]")) return;
    options.onOpen?.();
    snapshot = diagnostics.snapshot(options.context(), window.navigator.userAgent);
    status.textContent = "Review your message and logs before sending.";
    update();
    dialog.showModal();
    message.focus();
  });
  element("feedback-close").addEventListener("click", () => close());
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  // Keep global shortcuts away from the note while composing feedback.
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  message.addEventListener("input", update);
  include.addEventListener("change", update);
  mail.addEventListener("click", () => { status.textContent = "Your email app was requested. If it does not open, download the email draft or copy your message and email jumpybrain@agentmail.to. Nothing has been sent by jumpyBrain."; });
  element("feedback-download").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([feedbackEmailDraft(message.value, include.checked ? snapshot : null)], { type: "message/rfc822" }));
    const link = document.createElement("a");
    link.href = url; link.download = "jumpybrain-feedback.eml";
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = "Email draft download requested. Open the .eml file in your email app, review it, and send. Some apps require Edit as new; if unsupported, use Open email app. Nothing has been sent by jumpyBrain.";
  });
  // Error messages/stacks may contain note text or credentials; record only the event.
  window.addEventListener("error", () => diagnostics.record("browser", "other", "failed"));
  window.addEventListener("unhandledrejection", () => diagnostics.record("browser", "other", "failed"));
  return { close, isOpen: () => dialog.open };
}

export const feedbackMarkup = String.raw`
<dialog id="feedback-dialog" class="document-dialog" aria-labelledby="feedback-title" aria-describedby="feedback-description">
  <h2 id="feedback-title">Send beta feedback</h2>
  <p id="feedback-description">Bug, idea, or something confusing? Email <strong>jumpybrain@agentmail.to</strong>.</p>
  <label for="feedback-message">What happened, or what would you like to see?</label>
  <textarea id="feedback-message" maxlength="4000" placeholder="What were you trying to do? What happened instead?"></textarea>
  <label class="feedback-check"><input id="feedback-include-logs" type="checkbox" checked /> Include diagnostic log</label>
  <p>App and browser details plus up to 40 recent request outcomes from this tab. No note text, searches, keys, file paths, or server logs.</p>
  <details><summary>Preview diagnostic log</summary><textarea id="feedback-logs" aria-label="Diagnostic log attachment" readonly spellcheck="false"></textarea></details>
  <p>Download an email draft with the log attached, then open it in your email app to review and send. The email-app fallback includes logs in the message instead.</p>
  <div class="dialog-actions">
    <button id="feedback-download" class="button button-primary" type="button">Download email draft</button>
    <a id="feedback-mailto" class="quiet-button">Open email app</a>
    <button id="feedback-close" class="quiet-button" type="button">Close</button>
  </div>
  <p id="feedback-status" role="status" aria-live="polite"></p>
</dialog>`;

export const feedbackStyles = String.raw`
  #feedback-dialog p { color: var(--ink-soft); font-size: 13px; overflow-wrap: anywhere; }
  #feedback-dialog .feedback-check { display: flex; align-items: center; gap: 8px; }
  #feedback-include-logs { width: 16px; height: 16px; accent-color: var(--accent); }
  #feedback-logs { font-size: 12px; }
  @media (max-width: 680px) {
    .nav-preferences #open-feedback { grid-row: 3; grid-column: 1 / -1; }
    .nav-appearance { grid-row: 4; }
  }
`;
