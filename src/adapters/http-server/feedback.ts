// Browser support evidence: schema construction, never arbitrary console/log capture.
import { createDiagnosticBuffer, diagnosticOperation, diagnosticCode, diagnosticId, statusCode, diagnosticErrorKind, supportReport, type DiagnosticSnapshot } from "../diagnostics/events.js";
declare const __JUMPYBRAIN_VERSION__: string;
declare const __JUMPYBRAIN_BUILD__: string;
export const FEEDBACK_EMAIL = "jumpybrain@agentmail.to";
const SUBJECT = "jumpyBrain beta feedback";
const MAX_MESSAGE = 4000;
export const MAX_FEEDBACK_BYTES = 65536;
export function diagnosticBuildInfo() {
  return { version: typeof __JUMPYBRAIN_VERSION__ === "string" ? __JUMPYBRAIN_VERSION__ : "beta", build: typeof __JUMPYBRAIN_BUILD__ === "string" ? __JUMPYBRAIN_BUILD__ : "unavailable" };
}
export function createFeedbackDiagnostics(now = () => new Date()) {
  const buffer = createDiagnosticBuffer("browser");
  const freshId = () => "d_" + Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, "0")).join("");
  const session = freshId();
  const probes = new WeakMap<Response, { id: string; started: number }>();
  const event = (operation: string, details: Record<string, unknown> = {}) => buffer.record({ at: now().toISOString(), component: "browser", session, operation, ...diagnosticBuildInfo(), severity: "info", outcome: "ok", code: "none", ...details });
  return {
    event,
    begin() { return { id: freshId(), started: performance.now() }; },
    finish(url: string, method: string, probe: { id: string; started: number }, response?: Response, aborted = false) {
      if (response) probes.set(response, probe);
      const outcome = response ? response.ok ? "ok" : "failed" : aborted ? "aborted" : "failed";
      event(diagnosticOperation(url, method), { request: probe.id, status: response?.status, durationMs: performance.now() - probe.started,
        outcome, severity: outcome === "ok" ? "info" : "warn", code: response ? statusCode(response.status) : aborted ? "aborted" : "network" });
    },
    result(url: string, method: string, response: Response, payload: unknown) {
      if (!payload || typeof payload !== "object") return;
      const packet = payload as { error?: { code?: unknown }; indexing?: { status?: unknown }; saved?: boolean };
      const code = diagnosticCode(packet.error?.code);
      const indexing = packet.indexing?.status;
      if (!response.ok || packet.saved === true || indexing === "failed") event(diagnosticOperation(url, method), {
        request: probes.get(response)?.id ?? diagnosticId(response.headers?.get("X-JumpyBrain-Request")), status: response.status,
        outcome: !response.ok ? "failed" : indexing === "failed" ? "pending" : packet.saved === true ? "ok" : "pending",
        severity: !response.ok || indexing === "failed" ? "warn" : "info",
        code: !response.ok ? code === "unknown" ? statusCode(response.status) : code : indexing === "failed" ? "index_failed" : indexing === "pending" ? "pending" : "saved",
      });
    },
    record(url: string, method: string, outcome: number | "failed" | "aborted") {
      event(diagnosticOperation(url, method), { status: typeof outcome === "number" ? outcome : undefined, outcome: typeof outcome === "number" ? outcome < 400 ? "ok" : "failed" : outcome,
        severity: typeof outcome === "number" && outcome < 400 ? "info" : "warn", code: typeof outcome === "number" ? statusCode(outcome) : outcome === "aborted" ? "aborted" : "network" });
    },
    snapshot(context: { view: string; connection: string; companion: boolean }, userAgent: string, hostSources: DiagnosticSnapshot[] = [], hostInfo?: unknown) {
      const browser = /Electron\/([\d.]+)/.exec(userAgent) ?? /(Firefox|Edg|Chrome|Version)\/([\d.]+)/.exec(userAgent);
      const platform = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Macintosh/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "other";
      const sources = hostSources.filter((s) => s && typeof s === "object" && Array.isArray(s.events));
      const info = hostInfo && typeof hostInfo === "object" ? hostInfo as Record<string, unknown> : {};
      const hostRuntime = { version: typeof info.version === "string" && /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(info.version) ? info.version.slice(0, 50) : "unavailable",
        build: typeof info.build === "string" && /^[a-f0-9]{16}$/.test(info.build) ? info.build : "unavailable" };
      return JSON.stringify({ ...supportReport([buffer.snapshot(), ...sources], 21000), app: "jumpyBrain", ...diagnosticBuildInfo(), hostRuntime,
        generatedAt: now().toISOString(), platform, browser: browser ? browser[0] : "other", companion: context.companion === true,
        view: ["home", "note", "graph", "settings"].includes(context.view) ? context.view : "other",
        connection: ["checking", "connected", "disconnected", "unavailable"].includes(context.connection) ? context.connection : "other",
        coverage: context.companion ? "local_host_only_no_remote_server_logs" : "browser_only_no_server_access", browserHistory: "current_tab_only" });
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
  const draft = lines.join("\r\n");
  if (new TextEncoder().encode(draft).length > MAX_FEEDBACK_BYTES) throw new Error("Feedback exceeds the email draft limit. Shorten the message or exclude diagnostics.");
  return draft;
}

export function feedbackMailto(message: string, diagnostics: string | null): string {
  const body = new TextDecoder().decode(new TextEncoder().encode(message.slice(0, MAX_MESSAGE))) + (diagnostics === null ? "" : "\n\nDiagnostic log (inline):\n" + diagnostics);
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`;
}

export function installFeedback(options: {
  document: Document; window: Window; diagnostics: ReturnType<typeof createFeedbackDiagnostics>;
  context: () => { view: string; connection: string; companion: boolean };
  onOpen?: () => void;
  submit?: (report: { id: string; message: string; diagnostics: string | null }, signal: AbortSignal) => Promise<unknown>;
  collectHost?: (signal: AbortSignal) => Promise<{ sources?: DiagnosticSnapshot[]; runtime?: unknown }>;
}) {
  const { document, window, diagnostics } = options;
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = element<HTMLDialogElement>("feedback-dialog");
  const message = element<HTMLTextAreaElement>("feedback-message");
  const include = element<HTMLInputElement>("feedback-include-logs");
  const preview = element<HTMLTextAreaElement>("feedback-logs");
  const mail = element<HTMLAnchorElement>("feedback-mailto");
  const status = element<HTMLElement>("feedback-status");
  const send = element<HTMLButtonElement>("feedback-send");
  let sending = false;
  let submission: { id: string; message: string; diagnostics: string | null } | null = null;
  let snapshot = "", openSequence = 0, collecting = false;
  let collection: AbortController | null = null;
  const download = element<HTMLButtonElement>("feedback-download");
  function update() {
    send.disabled = sending || collecting || !message.value.trim();
    send.textContent = sending ? "Sending…" : "Send feedback";
    message.disabled = sending;
    include.disabled = sending;
    element<HTMLButtonElement>("feedback-close").disabled = sending;
    preview.value = include.checked ? snapshot : "";
    preview.closest("details")!.hidden = !include.checked;
    const fallback = feedbackMailto(message.value, include.checked ? snapshot : null);
    // Long mailto URIs are not portable; the EML remains the complete attachment path.
    mail.href = fallback.length <= 8000 ? fallback : feedbackMailto(message.value, null);
    mail.textContent = fallback.length <= 8000 ? "Open email app" : "Open email app (message only)";
    try { feedbackEmailDraft(message.value, include.checked ? snapshot : null); download.disabled = collecting; }
    catch { download.disabled = true; status.textContent = "Shorten your message or exclude diagnostics to fit the email draft limit."; }
  }
  function close(restoreFocus = true) {
    if (sending && restoreFocus) return;
    if (!dialog.open) return;
    openSequence++; collection?.abort(); collection = null; collecting = false;
    dialog.close();
    preview.value = "";
    snapshot = "";
    mail.removeAttribute("href");
    if (restoreFocus) element("open-feedback").focus({ preventScroll: true });
  }
  element("open-feedback").addEventListener("click", () => {
    if (sending || dialog.open || document.querySelector("dialog[open]")) return;
    options.onOpen?.();
    snapshot = submission?.diagnostics ?? diagnostics.snapshot(options.context(), window.navigator.userAgent);
    status.textContent = "Review your message and logs before sending.";
    update();
    dialog.showModal();
    message.focus();
    if (include.checked && !submission) void collect();
  });
  send.addEventListener("click", async () => {
    if (sending || collecting || !dialog.open || !message.value.trim()) return;
    const report = { message: message.value, diagnostics: include.checked ? snapshot : null };
    if (!submission || submission.message !== report.message || submission.diagnostics !== report.diagnostics) {
      submission = { id: window.crypto.randomUUID(), ...report };
    }
    const pending = submission, token = openSequence;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    sending = true; update();
    status.textContent = "Sending your feedback…";
    try {
      if (!options.submit) throw new Error("unavailable");
      const result = await options.submit(pending, controller.signal) as { accepted?: boolean; id?: string };
      if (result?.accepted !== true || result.id !== pending.id) throw new Error("unconfirmed");
      if (submission === pending) { submission = null; message.value = ""; }
      if (dialog.open && token === openSequence) status.textContent = "Feedback sent. Thank you!";
    } catch (error) {
      if (dialog.open && token === openSequence) status.textContent = (error as { code?: string })?.code === "feedback_unavailable"
        ? "Direct feedback is not available in this installation yet. Your message is still here; you can use the email alternatives below."
        : "Feedback delivery could not be confirmed. Your message is still here. Try sending again.";
    } finally {
      window.clearTimeout(timer); sending = false; update();
    }
  });
  async function collect() {
    if (!options.collectHost || !dialog.open || !include.checked) return;
    collection?.abort();
    const token = ++openSequence, controller = new AbortController(); collection = controller;
    const timer = window.setTimeout(() => controller.abort(), 2000);
    collecting = true; update();
    status.textContent = "Collecting available local diagnostics…";
    try {
      const host = await Promise.race([options.collectHost(controller.signal), new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("diagnostics unavailable")), { once: true });
      })]);
      if (controller.signal.aborted || !dialog.open || token !== openSequence || !include.checked) return;
      snapshot = diagnostics.snapshot(options.context(), window.navigator.userAgent, Array.isArray(host?.sources) ? host.sources : [], host?.runtime);
      status.textContent = "Review your message and diagnostic log, then choose Send feedback.";
      update();
    } catch {
      if (dialog.open && token === openSequence && include.checked) {
        snapshot = diagnostics.snapshot(options.context(), window.navigator.userAgent, [{ component: "gateway", availability: "unavailable", events: [], dropped: 0, failures: 1, truncatedBytes: 0 }]);
        status.textContent = "Local host diagnostics are unavailable. You can still send the browser report.";
        update();
      }
    } finally { window.clearTimeout(timer); if (collection === controller) { collection = null; collecting = false; if (dialog.open) update(); } }
  }
  element("feedback-close").addEventListener("click", () => close());
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  // Keep global shortcuts away from the note while composing feedback.
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  message.addEventListener("input", update);
  include.addEventListener("change", () => {
    if (!include.checked) { openSequence++; collection?.abort(); collection = null; collecting = false; status.textContent = "Diagnostic logs excluded."; }
    update();
    if (include.checked) void collect();
  });
  mail.addEventListener("click", () => { status.textContent = "Your email app was requested. If it does not open, download the email draft or copy your message and email jumpybrain@agentmail.to. Nothing has been sent by jumpyBrain."; });
  element("feedback-download").addEventListener("click", () => {
    let draft;
    try { draft = feedbackEmailDraft(message.value, include.checked ? snapshot : null); }
    catch { status.textContent = "Shorten your message or exclude diagnostics to fit the email draft limit."; return; }
    const url = URL.createObjectURL(new Blob([draft], { type: "message/rfc822" }));
    const link = document.createElement("a");
    link.href = url; link.download = "jumpybrain-feedback.eml";
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = "Email draft download requested. Open the .eml file in your email app, review it, and send. Some apps require Edit as new; if unsupported, use Open email app. Nothing has been sent by jumpyBrain.";
  });
  // Error messages/stacks may contain note text or credentials; record only the event.
  window.addEventListener("error", (event) => diagnostics.event("exception", { severity: "error", outcome: "failed", code: diagnosticErrorKind(event.error),
    location: event.filename?.startsWith(window.location.origin + "/") ? "shell" : undefined, line: event.lineno, column: event.colno }));
  window.addEventListener("unhandledrejection", (event) => diagnostics.event("rejection", { severity: "error", outcome: "failed", code: diagnosticErrorKind(event.reason) }));
  return { close, isOpen: () => dialog.open };
}

export const feedbackMarkup = String.raw`
<dialog id="feedback-dialog" class="document-dialog" aria-labelledby="feedback-title" aria-describedby="feedback-description">
  <h2 id="feedback-title">Send beta feedback</h2>
  <p id="feedback-description">Bug, idea, or something confusing? Send a report directly to the jumpyBrain team.</p>
  <label for="feedback-message">What happened, or what would you like to see?</label>
  <textarea id="feedback-message" maxlength="4000" placeholder="What were you trying to do? What happened instead?"></textarea>
  <label class="feedback-check"><input id="feedback-include-logs" type="checkbox" checked /> Include diagnostic log</label>
  <p>App details and recent failures from this tab, plus sanitized local host events when available. No note text, searches, keys, paths, raw logs, or crash dumps. Preview lists source coverage and any omissions. Browser history resets on reload.</p>
  <details><summary>Preview diagnostic log</summary><textarea id="feedback-logs" aria-label="Diagnostic log attachment" readonly spellcheck="false"></textarea></details>
  <p>Send shares your message and the diagnostic log above, if included, with the jumpyBrain team.</p>
  <div class="dialog-actions">
    <button id="feedback-send" class="button button-primary" type="button">Send feedback</button>
    <button id="feedback-close" class="quiet-button" type="button">Close</button>
  </div>
  <p id="feedback-status" role="status" aria-live="polite"></p>
  <details><summary>Email alternatives</summary>
    <p>Email <strong>jumpybrain@agentmail.to</strong> manually, or use a configured desktop email app. These alternatives do not send automatically.</p>
    <div class="dialog-actions">
      <button id="feedback-download" class="quiet-button" type="button">Download email draft</button>
      <a id="feedback-mailto" class="quiet-button">Open email app</a>
    </div>
  </details>
</dialog>`;

export const feedbackStyles = String.raw`
  #feedback-dialog p { color: var(--ink-soft); font-size: var(--text-body); overflow-wrap: anywhere; }
  #feedback-dialog .feedback-check { display: flex; align-items: center; gap: var(--space-2); }
  #feedback-include-logs { width: 16px; height: 16px; accent-color: var(--accent); }
  #feedback-logs { font-size: var(--text-caption); }
`;
