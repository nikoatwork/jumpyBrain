// Shared access-key management view: a Settings panel in the Mac app and a dialog
// in the hosted browser. The server authorizes every call; this view only presents.
import { prepareDropdown } from "./browser-dropdown.js";

type Role = "reader" | "writer" | "admin";
interface Credential { id: string; name: string; role: Role; createdAt: string; revokedAt?: string }
interface Principal { id: string; name: string; role: Role }
export interface AccessKeysContext {
  /** `local` brains need no keys; `none` means there is no usable connection. */
  kind: "local" | "remote" | "hosted" | "none";
  /** Address other people connect to. */
  address: string;
  /** False when this device has not approved changes to the brain. */
  canChange: boolean;
  /** Changes whenever the brain or credential changes; late replies for an old scope are dropped. */
  scope: string;
}

const ROLE_LABEL: Record<Role, string> = { reader: "Reader", writer: "Writer", admin: "Admin" };
const ROLE_HINT: Record<Role, string> = {
  reader: "Can search and read. Cannot change anything.",
  writer: "Can read, write and edit notes.",
  admin: "Can do everything a writer can, and create or revoke keys.",
};
const role = (value: unknown): value is Role => value === "reader" || value === "writer" || value === "admin";
const validCredential = (value: any): value is Credential => Boolean(value) && typeof value.id === "string" && typeof value.name === "string"
  && role(value.role) && typeof value.createdAt === "string" && (value.revokedAt === undefined || typeof value.revokedAt === "string");

export function accessKeyInvite(address: string, token: string): string {
  return ["You have access to our jumpyBrain memory.", "", "Address: " + address, "Access key: " + token, "",
    "jumpyBrain app: Settings → Brains → Add connection, then paste the address and key.",
    "Browser: open the address and enter the key.",
    "CLI: JUMPYBRAIN_API_KEY='" + token + "' jumpybrain status --target-url " + address, "",
    "Keep this key private. It is yours alone and can be revoked."].join("\n");
}

export function accessKeyErrorText(error: unknown, action: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "write_not_authorized") return "Editing is turned off for this brain on this device. Allow editing under Brains, then try again.";
  if (code === "admin_required") return "This needs an admin key for this brain.";
  if (code === "cannot_revoke_current") return "You are using this key. Connect with another admin key to revoke it.";
  if (code === "credential_limit") return "This brain has reached its access key limit. Ask the person who runs the server to tidy up old keys.";
  if (code === "invalid_credential") return "Use a name of up to 100 characters and choose a role.";
  if (code === "not_found") return "Update jumpyBrain on the server and this device to manage keys here.";
  return "Could not " + action + ". Check the connection and try again.";
}

export function installAccessKeys(options: {
  document: Document;
  request: (path: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<any>;
  context: () => AccessKeysContext;
  confirm: (text: string) => boolean;
  copy: (text: string) => Promise<void>;
}) {
  const { document } = options;
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const intro = element("access-keys-intro"), message = element("access-keys-message");
  const form = element<HTMLFormElement>("access-keys-form"), name = element<HTMLInputElement>("access-keys-name");
  const roleSelect = element<HTMLSelectElement>("access-keys-role"), roleHint = element("access-keys-role-hint");
  const create = element<HTMLButtonElement>("access-keys-create");
  const created = element("access-keys-new"), secret = element<HTMLInputElement>("access-keys-secret");
  const list = element("access-keys-list"), revoked = element<HTMLDetailsElement>("access-keys-revoked"), revokedList = element("access-keys-revoked-list");
  let sequence = 0, loadedScope: string | null = null, busy = false;
  let principal: Principal | null = null, credentials: Credential[] = [], issued: { name: string; token: string; address: string } | null = null;
  prepareDropdown(roleSelect);

  const say = (text: string, error = false) => { message.textContent = text; message.dataset.error = String(error); message.hidden = !text; };
  const date = (value: string) => { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toLocaleDateString(undefined, { dateStyle: "medium" }) : "unknown date"; };
  function badge(text: string) { const item = document.createElement("span"); item.className = "access-key-badge"; item.textContent = text; return item; }
  function row(credential: Credential, canChange: boolean) {
    const item = document.createElement("li"); item.className = "access-key"; item.dataset.credentialId = credential.id;
    const text = document.createElement("div"), title = document.createElement("strong"), detail = document.createElement("p");
    title.append(credential.name, badge(ROLE_LABEL[credential.role]));
    const current = credential.id === principal?.id;
    if (current) title.append(badge("This key"));
    detail.textContent = credential.revokedAt ? "Revoked " + date(credential.revokedAt) + " · created " + date(credential.createdAt) : "Created " + date(credential.createdAt);
    text.append(title, detail); item.append(text);
    if (!credential.revokedAt) {
      const button = document.createElement("button"); button.type = "button"; button.className = "quiet-button"; button.textContent = "Revoke";
      button.setAttribute("aria-label", "Revoke key " + credential.name);
      button.disabled = busy || current || !canChange;
      if (current) button.title = "You are using this key. Connect with another admin key to revoke it.";
      button.addEventListener("click", () => void revoke(credential));
      item.append(button);
    }
    return item;
  }
  function render() {
    const context = options.context();
    const admin = principal?.role === "admin" && (context.kind === "remote" || context.kind === "hosted");
    form.hidden = !admin; list.hidden = !admin;
    created.hidden = !issued;
    if (issued) {
      element("access-keys-new-title").textContent = "New key for “" + issued.name + "”";
      secret.value = issued.token;
    } else secret.value = "";
    name.disabled = roleSelect.disabled = busy || !context.canChange;
    create.disabled = busy || !context.canChange || !name.value.trim();
    roleHint.textContent = ROLE_HINT[role(roleSelect.value) ? roleSelect.value : "writer"];
    const active = credentials.filter(item => !item.revokedAt), old = credentials.filter(item => item.revokedAt);
    list.replaceChildren(...active.map(item => row(item, context.canChange)));
    if (admin && !active.length) { const empty = document.createElement("li"); empty.className = "access-key-empty"; empty.textContent = "No keys yet. Create one for each person and agent."; list.append(empty); }
    revoked.hidden = !admin || !old.length;
    element("access-keys-revoked-summary").textContent = "Revoked keys (" + old.length + ")";
    revokedList.replaceChildren(...old.map(item => row(item, false)));
  }
  function reset() {
    sequence++; loadedScope = null; busy = false; principal = null; credentials = []; issued = null;
    name.value = ""; roleSelect.value = "writer"; prepareDropdown(roleSelect); intro.textContent = ""; say(""); render();
  }
  async function refresh(force = false) {
    const context = options.context();
    if (!force && loadedScope === context.scope) return;
    if (loadedScope !== context.scope) reset();
    const token = ++sequence;
    const current = () => token === sequence && options.context().scope === context.scope;
    if (context.kind === "none") { intro.textContent = "Connect to a brain to see its access keys."; return; }
    if (context.kind === "local") {
      loadedScope = context.scope;
      intro.textContent = "This brain is a folder on this device. The app and the CLI open it directly, so it needs no access keys. Keys are for a brain you run on a server and share with other people or agents.";
      return;
    }
    intro.textContent = "Loading…";
    try {
      const capabilities = await options.request("/capabilities");
      if (!current()) return;
      const who = capabilities?.principal;
      if (!who || typeof who.id !== "string" || typeof who.name !== "string" || !role(who.role)) throw Object.assign(new Error("unsupported"), { code: "not_found" });
      principal = who;
      if (who.role !== "admin") {
        loadedScope = context.scope;
        intro.textContent = "You are connected with a " + ROLE_LABEL[who.role as Role].toLowerCase() + " key named “" + who.name + "”. Only an admin can create or revoke keys. Ask the person who runs this brain.";
        render(); return;
      }
      const packet = await options.request("/access");
      if (!current()) return;
      if (!Array.isArray(packet?.credentials) || !packet.credentials.every(validCredential)) throw Object.assign(new Error("unsupported"), { code: "not_found" });
      credentials = packet.credentials.slice().sort((left: Credential, right: Credential) => right.createdAt.localeCompare(left.createdAt));
      loadedScope = context.scope;
      intro.textContent = "Give each person and agent their own key for " + context.address + ". A key works in the app, the browser and the CLI, and you can revoke it at any time."
        + (who.id.startsWith("bootstrap:") ? " You are using the server’s setup key: create an admin key for yourself and keep the setup key for recovery." : "");
      if (!context.canChange) say("Editing is turned off for this brain on this device. Allow editing under Brains to create or revoke keys.");
      render();
    } catch (error) {
      if (!current()) return;
      // Remember the failure for this scope; reopening the view retries.
      loadedScope = context.scope; principal = null; credentials = []; intro.textContent = ""; render();
      say(accessKeyErrorText(error, "load access keys"), true);
    }
  }
  async function revoke(credential: Credential) {
    if (busy || !options.confirm("Revoke “" + credential.name + "”? Anyone using this key loses access right away. This cannot be undone.")) return;
    const scope = options.context().scope;
    busy = true; say("Revoking…"); render();
    let failure: unknown;
    try { await options.request("/access/" + credential.id, { method: "DELETE" }); } catch (error) { failure = error; }
    if (options.context().scope !== scope) return;
    busy = false;
    await refresh(true);
    if (options.context().scope !== scope) return;
    if (failure) say(accessKeyErrorText(failure, "revoke the key"), true); else say("Revoked “" + credential.name + "”.");
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const label = name.value.trim(), chosen = roleSelect.value;
    if (busy || !label || !role(chosen)) return;
    if (credentials.some(item => !item.revokedAt && item.name.toLowerCase() === label.toLowerCase())) { say("An active key is already named “" + label + "”. Use a different name so you can tell them apart.", true); name.focus(); return; }
    const context = options.context();
    busy = true; issued = null; say("Creating…"); render();
    let packet: any, failure: unknown;
    try { packet = await options.request("/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: label, role: chosen }) }); }
    catch (error) { failure = error; }
    if (options.context().scope !== context.scope) return;
    busy = false;
    const token = packet?.token;
    if (!failure && typeof token === "string" && token) { issued = { name: label, token, address: context.address }; name.value = ""; }
    await refresh(true);
    if (options.context().scope !== context.scope) return;
    if (issued) { say(""); secret.focus(); secret.select(); }
    else if ((failure as { code?: unknown } | undefined)?.code) say(accessKeyErrorText(failure, "create the key"), true);
    // Without a server answer the key may exist but its secret is lost.
    else say("The server did not confirm the new key. If “" + label + "” appears below, revoke it and create it again.", true);
  });
  name.addEventListener("input", render);
  roleSelect.addEventListener("change", render);
  async function copy(text: string, done: string) {
    try { await options.copy(text); say(done); }
    catch { secret.focus(); secret.select(); say("Copying is blocked here. Select the key and copy it yourself.", true); }
  }
  element("access-keys-copy").addEventListener("click", () => { if (issued) void copy(issued.token, "Key copied."); });
  element("access-keys-copy-invite").addEventListener("click", () => { if (issued) void copy(accessKeyInvite(issued.address, issued.token), "Invite copied. Send it over a private channel."); });
  element("access-keys-done").addEventListener("click", () => { issued = null; say(""); render(); name.focus(); });
  render();
  return { refresh, reset, hasSecret: () => Boolean(issued) };
}
