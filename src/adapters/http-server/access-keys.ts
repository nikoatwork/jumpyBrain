// Shared access-key management view: a Settings panel in the Mac app and a dialog
// in the hosted browser. The server authorizes every call; this view only presents.
import { prepareDropdown } from "./browser-dropdown.js";

type Role = "reader" | "writer" | "admin";
type Capability = "read" | "write" | "manage_access";
interface Credential { id: string; name: string; role: Role; createdAt: string; revokedAt?: string }
interface Principal { id: string; name: string; role: Role }
interface Session { id: string; keyId: string; label: string; createdAt: string; lastSeenAt: string; current?: boolean }
export interface AccessKeysContext {
  /** `local` brains need no keys; `none` means there is no usable connection. */
  kind: "local" | "remote" | "hosted" | "none";
  /** Address other people connect to. */
  address: string;
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
// Presentation only. The server states a key's set in `/capabilities`; this copy of the
// fixed role sets covers servers that predate that field. The server decides every request.
const CAPABILITIES: readonly Capability[] = ["read", "write", "manage_access"];
const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = { reader: ["read"], writer: ["read", "write"], admin: ["read", "write", "manage_access"] };
/** The named capabilities a `/capabilities` packet grants; an unknown role grants none. */
export function effectiveCapabilities(packet: any): Capability[] {
  const who = packet?.principal;
  if (!who || !role(who.role)) return [];
  return Array.isArray(packet.capabilities) ? CAPABILITIES.filter(name => packet.capabilities.includes(name)) : [...ROLE_CAPABILITIES[who.role as Role]];
}
const validCredential = (value: any): value is Credential => Boolean(value) && typeof value.id === "string" && typeof value.name === "string"
  && role(value.role) && typeof value.createdAt === "string" && (value.revokedAt === undefined || typeof value.revokedAt === "string");

export function accessKeyInvite(address: string, token: string): string {
  return ["You have access to our jumpyBrain memory.", "", "Address: " + address, "Access key: " + token, "",
    "jumpyBrain app: Settings → Brains → Add connection, then paste the address and key.",
    "Browser: open the address and enter the key.",
    "CLI: JUMPYBRAIN_API_KEY='" + token + "' jumpybrain status --target-url " + address, "",
    "Keep this key private. It is yours alone and can be revoked."].join("\n");
}

/** A one-click browser sign-in link. The code rides in the fragment, so it never reaches server or proxy logs. */
export function accessInviteLink(address: string, code: string): string {
  return address.replace(/\/+$/, "") + "/#invite=" + encodeURIComponent(code);
}

export function accessKeyErrorText(error: unknown, action: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "read_only") return "Your key has reader access, which cannot make changes.";
  if (code === "access_unconfirmed") return "The server did not confirm your key’s role, so nothing was changed.";
  if (code === "admin_required") return "This needs an admin key for this brain.";
  if (code === "cannot_revoke_current") return "You are using this key. Connect with another admin key to revoke it.";
  if (code === "credential_limit") return "This brain has reached its access key limit. Ask the person who runs the server to tidy up old keys.";
  if (code === "invalid_credential") return "Use a name of up to 100 characters and choose a role.";
  if (code === "invite_limit") return "Too many invite links are open. Wait for older ones to expire, or revoke keys you no longer need.";
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
  const effective = element("access-effective"), effectiveSummary = element("access-effective-summary"), effectiveList = element("access-effective-list");
  let sequence = 0, loadedScope: string | null = null, busy = false;
  let principal: Principal | null = null, credentials: Credential[] = [], issued: { id: string; name: string; token: string; address: string } | null = null;
  // Browser sessions per key; null when the server predates sessions or did not list them.
  let sessions: Session[] | null = null;
  const linkPanel = element("access-keys-link"), linkInput = element<HTMLInputElement>("access-keys-link-url");
  // null: nothing to show yet. Otherwise what the server (or this device, for a local folder) grants.
  let granted: Capability[] | null = null, grantedSummary = "";
  prepareDropdown(roleSelect);

  const say = (text: string, error = false) => { message.textContent = text; message.dataset.error = String(error); message.hidden = !text; };
  const date = (value: string) => { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toLocaleDateString(undefined, { dateStyle: "medium" }) : "unknown date"; };
  function badge(text: string) { const item = document.createElement("span"); item.className = "badge access-key-badge"; item.textContent = text; return item; }
  function row(credential: Credential, canChange: boolean) {
    const item = document.createElement("li"); item.className = "access-key card"; item.dataset.credentialId = credential.id;
    const text = document.createElement("div"), title = document.createElement("strong"), detail = document.createElement("p");
    title.append(credential.name, badge(ROLE_LABEL[credential.role]));
    const current = credential.id === principal?.id;
    if (current) title.append(badge("This key"));
    detail.textContent = credential.revokedAt ? "Revoked " + date(credential.revokedAt) + " · created " + date(credential.createdAt) : "Created " + date(credential.createdAt);
    text.append(title, detail);
    const signedIn = credential.revokedAt ? [] : (sessions ?? []).filter(session => session.keyId === credential.id);
    if (signedIn.length) text.append(sessionList(credential, signedIn, canChange));
    item.append(text);
    if (!credential.revokedAt) {
      const actions = document.createElement("div"); actions.className = "access-key-actions";
      if (sessions !== null) {
        const invite = document.createElement("button"); invite.type = "button"; invite.className = "quiet-button"; invite.textContent = "Invite link";
        invite.title = "Copies a one-click browser sign-in link for this key. It works once, within 7 days.";
        invite.setAttribute("aria-label", "Copy invite link for " + credential.name);
        invite.disabled = busy || !canChange;
        invite.addEventListener("click", () => void inviteLink(credential.id, credential.name));
        actions.append(invite);
      }
      const button = document.createElement("button"); button.type = "button"; button.className = "quiet-button button--danger"; button.textContent = "Revoke";
      button.setAttribute("aria-label", "Revoke key " + credential.name);
      button.disabled = busy || current || !canChange;
      if (current) button.title = "You are using this key. Connect with another admin key to revoke it.";
      button.addEventListener("click", () => void revoke(credential));
      actions.append(button); item.append(actions);
    }
    return item;
  }
  function sessionList(credential: Credential, signedIn: Session[], canChange: boolean) {
    const list = document.createElement("ul"); list.className = "access-key-sessions";
    list.setAttribute("aria-label", "Browsers signed in with " + credential.name);
    for (const session of signedIn) {
      const entry = document.createElement("li"), label = document.createElement("span");
      label.textContent = session.label + (session.current ? " · this browser" : "") + " · last used " + date(session.lastSeenAt);
      const end = document.createElement("button"); end.type = "button"; end.className = "quiet-button quiet-button--plain button--sm"; end.textContent = "Sign out";
      end.setAttribute("aria-label", "Sign out " + session.label + " for " + credential.name); end.disabled = busy || !canChange;
      end.addEventListener("click", () => void endSessions("/access/sessions/" + session.id, credential.name, session.current ? "this browser" : session.label));
      entry.append(label, end); list.append(entry);
    }
    if (signedIn.length) {
      const entry = document.createElement("li"), all = document.createElement("button");
      all.type = "button"; all.className = "quiet-button quiet-button--plain button--sm"; all.textContent = "Sign out everywhere"; all.disabled = busy || !canChange;
      all.setAttribute("aria-label", "Sign out every browser for " + credential.name);
      all.addEventListener("click", () => void endSessions("/access/" + credential.id + "/sessions", credential.name, "every browser"));
      entry.append(all); list.append(entry);
    }
    return list;
  }
  function renderEffective() {
    effective.hidden = granted === null;
    effectiveSummary.textContent = grantedSummary;
    // The rows and their wording are server-rendered (access-keys-view.ts).
    for (const item of Array.from(effectiveList.children) as HTMLElement[]) {
      const allowed = Boolean(granted?.includes(item.dataset.capability as Capability));
      item.dataset.allowed = String(allowed);
      item.firstElementChild!.textContent = allowed ? "Allowed" : "Not allowed";
    }
  }
  function render() {
    const context = options.context();
    renderEffective();
    const served = context.kind === "remote" || context.kind === "hosted";
    const admin = served && Boolean(granted?.includes("manage_access"));
    const canChange = admin;
    // Key creation stays visible to every signed-in key; without admin access it explains itself.
    form.hidden = !served || !principal; list.hidden = !admin;
    created.hidden = !issued;
    element("access-keys-copy-link").hidden = !issued?.id || sessions === null;
    if (issued) {
      element("access-keys-new-title").textContent = "New key for “" + issued.name + "”";
      secret.value = issued.token;
    } else secret.value = "";
    name.disabled = roleSelect.disabled = busy || !canChange;
    create.disabled = busy || !canChange || !name.value.trim();
    roleHint.textContent = canChange || !principal ? ROLE_HINT[role(roleSelect.value) ? roleSelect.value : "writer"]
      : "Creating and revoking keys needs an admin key. Yours has " + principal.role + " access.";
    const active = credentials.filter(item => !item.revokedAt), old = credentials.filter(item => item.revokedAt);
    list.replaceChildren(...active.map(item => row(item, canChange)));
    if (admin && !active.length) { const empty = document.createElement("li"); empty.className = "access-key-empty"; empty.textContent = "No keys yet. Create one for each person and agent."; list.append(empty); }
    revoked.hidden = !admin || !old.length;
    element("access-keys-revoked-label").textContent = "Revoked keys (" + old.length + ")";
    revokedList.replaceChildren(...old.map(item => row(item, false)));
  }
  function reset() {
    sequence++; loadedScope = null; busy = false; principal = null; credentials = []; issued = null; granted = null; grantedSummary = ""; sessions = null;
    linkPanel.hidden = true; linkInput.value = "";
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
      granted = [...CAPABILITIES]; grantedSummary = "Full access. This brain is a folder on this device, so no server role applies.";
      renderEffective();
      intro.textContent = "This brain is a folder on this device. The app and the CLI open it directly, so it needs no access keys. Keys are for a brain you run on a server and share with other people or agents.";
      return;
    }
    intro.textContent = "Loading…";
    const whereToChange = context.kind === "remote" ? "then update the key under Brains" : "then connect with that key";
    let confirmed = false;
    try {
      const capabilities = await options.request("/capabilities");
      if (!current()) return;
      const who = capabilities?.principal;
      if (!who || typeof who.id !== "string" || typeof who.name !== "string" || !role(who.role)) throw Object.assign(new Error("unsupported"), { code: "not_found" });
      principal = who; confirmed = true;
      granted = effectiveCapabilities(capabilities);
      grantedSummary = ROLE_LABEL[who.role as Role] + " · key “" + who.name + "”. Set by the server from this key’s role, not on this device.";
      if (!granted.includes("manage_access")) {
        loadedScope = context.scope;
        intro.textContent = "Only an admin key can create or revoke keys. For different access, ask the person who runs this brain for another key, " + whereToChange + ".";
        render(); return;
      }
      const packet = await options.request("/access");
      if (!current()) return;
      if (!Array.isArray(packet?.credentials) || !packet.credentials.every(validCredential)) throw Object.assign(new Error("unsupported"), { code: "not_found" });
      credentials = packet.credentials.slice().sort((left: Credential, right: Credential) => right.createdAt.localeCompare(left.createdAt));
      // Older servers have no browser sessions or invite links; their keys still list.
      const listed = await options.request("/access/sessions").catch(() => null);
      if (!current()) return;
      sessions = Array.isArray(listed?.sessions) ? listed.sessions.filter((item: any) => item && typeof item.id === "string" && typeof item.keyId === "string" && typeof item.label === "string" && typeof item.lastSeenAt === "string") : null;
      loadedScope = context.scope;
      // From the Mac app the keys belong to another machine: say so, or the panel reads as local key storage.
      intro.textContent = (context.kind === "remote" ? "You are managing the server at " + context.address + " from this device. Its keys are kept on the server, not here, and changes apply there right away. Give each person and agent their own key."
        : "Give each person and agent their own key for " + context.address + ".") + " A key works in the app, the browser and the CLI, and you can revoke it at any time."
        + (who.id.startsWith("bootstrap:") ? " You are using the server’s setup key: create an admin key for yourself and keep the setup key for recovery." : "");
      render();
    } catch (error) {
      if (!current()) return;
      // Remember the failure for this scope; reopening the view retries.
      // An unconfirmed role is shown as no access: nothing here suggests a change would work.
      loadedScope = context.scope; credentials = []; intro.textContent = "";
      // A role confirmed earlier is not carried over: a forced reload starts from nothing.
      if (!confirmed) { principal = null; granted = []; grantedSummary = "Not confirmed. Changes are paused until the server reports this key’s role."; }
      render();
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
  async function endSessions(path: string, name: string, where: string) {
    if (busy || !options.confirm("Sign out " + where + " for “" + name + "”?" + (where === "every browser" ? " Unused invite links for this key stop working too." : "") + " The key keeps working; a browser needs a new invite link or the key to sign in again.")) return;
    const scope = options.context().scope;
    busy = true; say("Signing out…"); render();
    let failure: unknown;
    try { await options.request(path, { method: "DELETE" }); } catch (error) { failure = error; }
    if (options.context().scope !== scope) return;
    busy = false;
    await refresh(true);
    if (options.context().scope !== scope) return;
    if (failure) say(accessKeyErrorText(failure, "sign out"), true); else say("Signed out " + where + " for “" + name + "”.");
  }
  // A link for people: the server issues a single-use code tied to this key, never the key itself.
  async function inviteLink(id: string, name: string) {
    if (busy) return;
    const context = options.context();
    busy = true; say("Creating invite link…"); render();
    let packet: any, failure: unknown;
    try { packet = await options.request("/access/" + id + "/invites", { method: "POST" }); } catch (error) { failure = error; }
    if (options.context().scope !== context.scope) return;
    busy = false; render();
    if (failure || typeof packet?.code !== "string") { say(accessKeyErrorText(failure, "create an invite link"), true); return; }
    const link = accessInviteLink(context.address, packet.code);
    element("access-keys-link-title").textContent = "Invite link for “" + name + "”";
    element("access-keys-link-expiry").textContent = "Works once, until " + date(packet.expiresAt) + ". Opening it signs that browser in with this key. Send it privately.";
    linkInput.value = link; linkPanel.hidden = false;
    try { await options.copy(link); say("Invite link copied."); }
    catch { linkInput.focus(); linkInput.select(); say("Copying is blocked here. Select the link and copy it yourself.", true); }
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
    if (!failure && typeof token === "string" && token) { issued = { id: String(packet?.credential?.id ?? ""), name: label, token, address: context.address }; name.value = ""; }
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
  element("access-keys-copy-invite").addEventListener("click", () => { if (issued) void copy(accessKeyInvite(issued.address, issued.token), "Agent setup copied. Send it over a private channel."); });
  element("access-keys-copy-link").addEventListener("click", () => { if (issued?.id) void inviteLink(issued.id, issued.name); });
  element("access-keys-link-copy").addEventListener("click", async () => {
    try { await options.copy(linkInput.value); say("Invite link copied."); } catch { linkInput.focus(); linkInput.select(); say("Copying is blocked here. Select the link and copy it yourself.", true); }
  });
  element("access-keys-link-done").addEventListener("click", () => { linkPanel.hidden = true; linkInput.value = ""; say(""); });
  element("access-keys-done").addEventListener("click", () => { issued = null; say(""); render(); name.focus(); });
  render();
  return { refresh, reset, hasSecret: () => Boolean(issued) };
}
