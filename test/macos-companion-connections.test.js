import assert from "node:assert/strict";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ConnectionStore } from "../integrations/macos-companion/connections.mjs";

class Credentials {
  items = new Map();
  calls = [];
  async get(reference) { this.calls.push(["get", reference]); return this.items.get(reference); }
  async set(reference, key) { this.calls.push(["set", reference]); this.items.set(reference, key); }
  async delete(reference) { this.calls.push(["delete", reference]); this.items.delete(reference); }
}
async function fixture(t, { offline = false, empty = false } = {}) {
  // macOS /var is a symlink: explicitly canonicalize the OS temporary parent.
  const temporary = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(temporary, "companion-connections-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "support");
  const memory = path.join(root, "memory");
  if (!offline) {
    await mkdir(memory);
    await writeFile(path.join(memory, "jumpybrain.json"), '{"schemaVersion":1}\n');
    await writeFile(path.join(memory, "unchanged.md"), "# Canonical memory\n");
  }
  const credentials = new Credentials();
  const store = await ConnectionStore.open({ directory, initialRoot: empty ? undefined : memory, credentials });
  const filename = path.join(directory, "connections.json");
  return { root, directory, memory, credentials, store, filename };
}
const remote = (url = "https://brain.example", extra = {}) => ({ name: "Team", kind: "remote", url, key: "fixture-key-DO-NOT-PERSIST", ...extra });
async function save(f, input) { return f.store.save(input, f.store.snapshot().revision); }
async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.name, "ConnectionError");
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(error.message, /fixture-key|secret-echo|brain\.example/);
    return true;
  });
}
async function disk(f) { return JSON.parse(await readFile(f.filename, "utf8")); }
async function secondLocal(f, name = "Other") {
  const root = path.join(f.root, name);
  await mkdir(root);
  await writeFile(path.join(root, "jumpybrain.json"), "{}");
  return { name, kind: "local", root };
}

test("seeds privately once; snapshots/get are clones; touches neither canonical memory nor CLI settings", async (t) => {
  const f = await fixture(t);
  const cli = path.join(f.root, "cli-config.json");
  await writeFile(cli, "unchanged CLI and agent targets");
  const before = await readFile(path.join(f.memory, "jumpybrain.json"), "utf8");
  const snapshot = f.store.snapshot();
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.revision, 0);
  assert.equal(snapshot.profiles.length, 1);
  assert.equal(snapshot.activeId, snapshot.profiles[0].id);
  assert.deepEqual(snapshot.profiles[0], { id: snapshot.activeId, name: "Local brain", kind: "local", root: f.memory, allowWrites: true });
  snapshot.profiles[0].name = "poison";
  snapshot.profiles.push({ key: "secret" });
  const profile = f.store.get(snapshot.activeId);
  profile.root = "/poison";
  assert.equal(f.store.get(snapshot.activeId).root, f.memory);
  assert.equal(f.store.get("missing"), undefined);
  assert.deepEqual(f.store.snapshot(), await disk(f));
  assert.equal((await lstat(f.directory)).mode & 0o777, 0o700);
  assert.equal((await lstat(f.filename)).mode & 0o777, 0o600);
  const reopened = await ConnectionStore.open({ directory: f.directory, initialRoot: "ignored-invalid-root" });
  assert.deepEqual(reopened.snapshot(), f.store.snapshot());
  await save(f, remote());
  assert.deepEqual(await readdir(f.directory), ["connections.json"]);
  assert.equal(await readFile(path.join(f.memory, "jumpybrain.json"), "utf8"), before);
  assert.equal(await readFile(path.join(f.memory, "unchanged.md"), "utf8"), "# Canonical memory\n");
  assert.equal(await readFile(cli, "utf8"), "unchanged CLI and agent targets");
  assert.deepEqual(await readdir(f.memory), ["jumpybrain.json", "unchanged.md"]);
});

test("migration retains an unavailable initial local brain and last active remote without fallback or credential lookup", async (t) => {
  const f = await fixture(t, { offline: true });
  const original = f.store.snapshot();
  assert.equal(original.profiles[0].root, f.memory);
  assert.deepEqual(await readdir(f.root), ["support"]);
  const second = await ConnectionStore.open({ directory: f.directory, initialRoot: path.join(f.root, "another") });
  assert.deepEqual(second.snapshot(), original);
  await save(f, remote());
  const id = f.store.snapshot().profiles[1].id;
  await f.store.setActive(id);
  f.credentials.items.clear();
  const reopened = await ConnectionStore.open({ directory: f.directory, initialRoot: f.memory, credentials: f.credentials });
  assert.equal(reopened.snapshot().activeId, id);
  assert.equal(reopened.get(id).kind, "remote");
  assert.equal(f.credentials.calls.filter(([action]) => action === "get").length, 0);
  await rejectsCode(save({ ...f, store: reopened }, { ...reopened.get(id), credentialRef: undefined }), "INVALID_INPUT");
  const profile = reopened.get(id);
  await rejectsCode(reopened.save({ id, name: profile.name, kind: "remote", url: profile.url }, reopened.snapshot().revision), "MISSING_CREDENTIAL");
});

test("first migration retains an existing folder without its marker instead of blocking Settings", async (t) => {
  const f = await fixture(t, { offline: true });
  await mkdir(f.memory);
  const store = await ConnectionStore.open({ directory: path.join(f.root, "second-support"), initialRoot: f.memory });
  assert.equal(store.get(store.snapshot().activeId).root, f.memory);
  assert.deepEqual(await readdir(f.memory), [], "migration must not initialize the unavailable root");
});

test("empty stores activate their first profile, and local creation requires existing roots without provisioning", async (t) => {
  const f = await fixture(t, { empty: true });
  assert.deepEqual(f.store.snapshot(), { version: 1, revision: 0, activeId: null, profiles: [] });
  const nonexistent = path.join(f.root, "never-created");
  await rejectsCode(save(f, { name: "No", kind: "local", root: nonexistent }), "INVALID_ROOT");
  await assert.rejects(lstat(nonexistent), { code: "ENOENT" });
  const state = await save(f, { name: " Main ", kind: "local", root: f.memory });
  assert.equal(state.activeId, state.profiles[0].id);
  assert.equal(state.profiles[0].name, "Main");
  assert.equal(state.profiles[0].allowWrites, true);
});

test("local roots resolve aliases and dot segments; reject missing, non-directory, symlink and hardlink markers", async (t) => {
  const f = await fixture(t);
  const alias = path.join(f.root, "alias");
  await symlink(f.memory, alias);
  for (const root of [f.memory, alias, path.join(f.memory, "..", "memory")]) {
    await rejectsCode(save(f, { name: "Duplicate", kind: "local", root }), "DUPLICATE_DESTINATION");
  }
  const other = await secondLocal(f);
  const aliasOther = path.join(f.root, "other-alias");
  await symlink(other.root, aliasOther);
  const saved = await save(f, { ...other, root: aliasOther, allowWrites: false });
  assert.equal(saved.profiles[1].root, other.root);
  assert.equal(saved.profiles[1].allowWrites, false);
  const bad = path.join(f.root, "bad");
  await mkdir(bad);
  await rejectsCode(save(f, { name: "Missing marker", kind: "local", root: bad }), "INVALID_ROOT");
  const marker = path.join(bad, "jumpybrain.json");
  await symlink(path.join(f.memory, "jumpybrain.json"), marker);
  await rejectsCode(save(f, { name: "Symlink marker", kind: "local", root: bad }), "INVALID_ROOT");
  await rm(marker);
  await link(path.join(other.root, "jumpybrain.json"), marker);
  await rejectsCode(save(f, { name: "Hardlink marker", kind: "local", root: bad }), "INVALID_ROOT");
  await rm(marker);
  await mkdir(marker);
  await rejectsCode(save(f, { name: "Directory marker", kind: "local", root: bad }), "INVALID_ROOT");
  for (const root of ["relative", "", null, 5, f.memory + "\n", "/" + "a".repeat(4096)]) {
    await rejectsCode(save(f, { name: "Bad", kind: "local", root }), "INVALID_ROOT");
  }
});

test("normalizes HTTPS origins/default ports and only permits literal HTTP loopback authorities", async (t) => {
  const f = await fixture(t);
  for (const [input, output] of [
    ["HTTPS://Brain.Example:443/", "https://brain.example"],
    ["https://brain.example:8443", "https://brain.example:8443"],
    ["http://LOCALHOST:80/", "http://localhost"],
    ["http://127.0.0.1:3788", "http://127.0.0.1:3788"],
    ["http://[::1]:3788/", "http://[::1]:3788"],
  ]) {
    const state = await save(f, remote(input));
    const profile = state.profiles.at(-1);
    assert.equal(profile.url, output);
    assert.equal(profile.allowWrites, false);
    assert.equal(profile.key, undefined);
    assert.match(profile.credentialRef, /^jumpybrain-companion:/);
  }
  await rejectsCode(save(f, remote("https://BRAIN.EXAMPLE:443")), "DUPLICATE_DESTINATION");
  for (const url of [
    "http://brain.example", "http://localhost.evil", "http://localhost.", "http://127.0.0.2",
    "http://127.1", "http://2130706433", "http://0x7f000001", "http://[::ffff:127.0.0.1]",
    "http://%6cocalhost", "http://localhost:bad", "https://user:secret-echo@brain.example",
    "https://@brain.example", "https://brain.example?", "https://brain.example?key=secret-echo",
    "https://brain.example#", "https://brain.example#secret-echo", "https://brain.example/api",
    "https://brain.example/./", "https://brain.example//", "https://brain.example/%2e",
    "https://brain.example\\@localhost", " https://brain.example", "https://brain.example\n",
    "//brain.example", "file:///etc/passwd", "ftp://brain.example", "https://", null, 4,
  ]) await rejectsCode(save(f, remote(url)), "INVALID_URL");
});

test("permissions are target-specific; remote destination changes require new keys and reset write approval", async (t) => {
  const f = await fixture(t);
  await save(f, remote("https://one.example", { allowWrites: true }));
  let profile = f.store.snapshot().profiles[1];
  const { id, credentialRef } = profile;
  await save(f, { id, name: "Renamed", kind: "remote", url: profile.url });
  profile = f.store.get(id);
  assert.equal(profile.credentialRef, credentialRef);
  assert.equal(profile.allowWrites, true);
  await rejectsCode(save(f, { id, name: "Changed", kind: "remote", url: "https://two.example" }), "MISSING_CREDENTIAL");
  await save(f, remote("https://two.example", { id }));
  assert.equal(f.store.get(id), undefined, "old destination IDs must not resolve after replacement");
  profile = f.store.snapshot().profiles[1];
  assert.notEqual(profile.id, id);
  assert.equal(profile.allowWrites, false);
  assert.notEqual(profile.credentialRef, credentialRef);
  assert.equal(f.credentials.items.has(credentialRef), false);
  const priorRef = profile.credentialRef;
  const local = await secondLocal(f);
  const priorId = profile.id;
  await f.store.setActive(priorId);
  await save(f, { ...local, id: priorId });
  assert.equal(f.store.get(priorId), undefined);
  profile = f.store.snapshot().profiles[1];
  assert.equal(f.store.snapshot().activeId, profile.id);
  assert.equal(profile.kind, "local");
  assert.equal(profile.allowWrites, true);
  assert.equal(profile.credentialRef, undefined);
  assert.equal(f.credentials.items.has(priorRef), false);
  await rejectsCode(save(f, { ...remote(), allowWrites: "true" }), "INVALID_INPUT");
});

test("immutable opaque credentials rotate only after commit and never appear in disk, snapshots, or errors", async (t) => {
  const f = await fixture(t);
  await save(f, remote());
  const first = f.store.snapshot().profiles[1];
  const originalKey = f.credentials.items.get(first.credentialRef);
  const newKey = "second-fixture-key-DO-NOT-PERSIST";
  await save(f, remote(first.url, { id: first.id, key: newKey }));
  const second = f.store.get(first.id);
  assert.notEqual(second.credentialRef, first.credentialRef);
  assert.equal(f.credentials.items.has(first.credentialRef), false);
  assert.equal(f.credentials.items.get(second.credentialRef), newKey);
  assert.deepEqual(f.credentials.calls.map(([action]) => action), ["set", "set", "delete"]);
  for (const content of [await readFile(f.filename, "utf8"), JSON.stringify(f.store.snapshot()), JSON.stringify(f.store.get(first.id))]) {
    assert.ok(!content.includes(originalKey));
    assert.ok(!content.includes(newKey));
  }
  assert.equal((await lstat(f.filename)).nlink, 1);
  assert.equal((await lstat(f.filename)).mode & 0o777, 0o600);
});

test("Keychain denial, missing items, missing adapters, and partial set failures use static safe errors", async (t) => {
  const f = await fixture(t);
  const before = f.store.snapshot();
  const bytes = await readFile(f.filename);
  f.credentials.set = async (reference, key) => {
    f.credentials.items.set(reference, key);
    throw new Error("secret-echo " + key);
  };
  await rejectsCode(save(f, remote()), "CREDENTIALS_UNAVAILABLE");
  assert.equal(f.credentials.items.size, 0, "partial set must be cleaned up");
  assert.deepEqual(f.store.snapshot(), before);
  assert.deepEqual(await readFile(f.filename), bytes);
  f.credentials.set = Credentials.prototype.set;
  await rejectsCode(save(f, { name: "No key", kind: "remote", url: "https://brain.example" }), "MISSING_CREDENTIAL");
  for (const key of ["", "   ", null, undefined, "bad\nkey", "x".repeat(4097)]) {
    await rejectsCode(save(f, remote("https://brain.example", { key })), "INVALID_INPUT");
  }
  await save(f, remote());
  const profile = f.store.snapshot().profiles[1];
  const edit = { id: profile.id, name: "Rename", kind: "remote", url: profile.url };
  f.credentials.get = async () => { throw new Error("secret-echo keychain denied"); };
  await rejectsCode(save(f, edit), "CREDENTIALS_UNAVAILABLE");
  f.credentials.get = async () => undefined;
  await rejectsCode(save(f, edit), "MISSING_CREDENTIAL");
  const noAdapter = await ConnectionStore.open({ directory: f.directory });
  await rejectsCode(noAdapter.save(remote("https://other.example"), noAdapter.snapshot().revision), "CREDENTIALS_UNAVAILABLE");
  await rejectsCode(noAdapter.save(edit, noAdapter.snapshot().revision), "CREDENTIALS_UNAVAILABLE");
});

test("persistence failure cleans up only new credentials, preserving old reference and snapshot", async (t) => {
  const f = await fixture(t);
  await save(f, remote());
  const before = f.store.snapshot();
  const old = before.profiles[1];
  const bytes = await readFile(f.filename);
  f.credentials.set = async (reference, key) => {
    await Credentials.prototype.set.call(f.credentials, reference, key);
    // Simulate an interrupted/hostile external writer before the atomic commit.
    await writeFile(f.filename, "corrupt secret-echo");
  };
  await rejectsCode(save(f, remote(old.url, { id: old.id, key: "replacement-fixture-key" })), "INVALID_STATE");
  assert.deepEqual(f.store.snapshot(), before);
  assert.deepEqual([...f.credentials.items.keys()], [old.credentialRef]);
  assert.deepEqual(await readdir(f.directory), ["connections.json"]);
  assert.equal(await readFile(f.filename, "utf8"), "corrupt secret-echo");
  await writeFile(f.filename, bytes);
  f.credentials.set = Credentials.prototype.set;
  await save(f, remote(old.url, { id: old.id, key: "retry-fixture-key" }));
  assert.equal(f.store.snapshot().revision, before.revision + 1);
});

test("active removal refuses before cleanup; inactive removal cleans credentials best effort after commit", async (t) => {
  const f = await fixture(t);
  const localId = f.store.snapshot().activeId;
  await save(f, remote());
  const profile = f.store.snapshot().profiles[1];
  await rejectsCode(f.store.remove(localId, f.store.snapshot().revision), "ACTIVE_PROFILE");
  await f.store.setActive(profile.id);
  await rejectsCode(f.store.remove(profile.id, f.store.snapshot().revision), "ACTIVE_PROFILE");
  assert.equal(f.credentials.items.has(profile.credentialRef), true);
  await f.store.setActive(localId);
  f.credentials.delete = async () => { throw new Error("secret-echo cleanup denied"); };
  const state = await f.store.remove(profile.id, f.store.snapshot().revision);
  assert.equal(state.profiles.length, 1);
  assert.deepEqual(state, await disk(f));
  assert.equal(f.credentials.items.has(profile.credentialRef), true, "denied cleanup leaves a non-referenced orphan, not a dangling profile");
  await rejectsCode(f.store.remove(profile.id, state.revision), "NOT_FOUND");
});

test("one writer queue serializes mutations; revision conflicts don't poison queue; queued input is copied", async (t) => {
  const f = await fixture(t);
  const rev = f.store.snapshot().revision;
  const first = remote("https://first.example");
  const second = remote("https://second.example");
  const one = f.store.save(first, rev);
  const two = f.store.save(second, rev);
  first.name = "Changed after enqueue";
  const results = await Promise.allSettled([one, two]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[0].value.profiles[1].name, "Team");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.code, "REVISION_CONFLICT");
  assert.equal(f.credentials.calls.filter(([action]) => action === "set").length, 1);
  await save(f, second);
  const [local, a, b] = f.store.snapshot().profiles;
  const switches = await Promise.all([f.store.setActive(a.id), f.store.setActive(b.id), f.store.setActive(local.id)]);
  assert.deepEqual(switches.map((state) => state.activeId), [a.id, b.id, local.id]);
  assert.deepEqual(switches.map((state) => state.revision), [3, 4, 5]);
  const unchanged = await f.store.setActive(local.id);
  assert.equal(unchanged.revision, 5);
  await rejectsCode(f.store.setActive("missing"), "NOT_FOUND");
  for (const revision of [undefined, null, -1, 1.5, "5", Infinity, Number.MAX_SAFE_INTEGER + 1, 0]) {
    await rejectsCode(f.store.save(remote("https://later.example"), revision), "REVISION_CONFLICT");
  }
  assert.deepEqual(f.store.snapshot(), await disk(f));
});

test("parallel open seeds once and separate store instances detect external revisions instead of overwriting", async (t) => {
  const f = await fixture(t, { empty: true });
  await rm(f.filename);
  const stores = await Promise.all(Array.from({ length: 8 }, () => ConnectionStore.open({ directory: f.directory, initialRoot: f.memory, credentials: f.credentials })));
  assert.ok(stores.every((store) => store.snapshot().activeId === stores[0].snapshot().activeId));
  await stores[0].save(remote(), 0);
  await rejectsCode(stores[1].save(remote("https://other.example"), 0), "REVISION_CONFLICT");
  await rejectsCode(stores[1].setActive(stores[1].snapshot().activeId), "REVISION_CONFLICT");
  assert.deepEqual(await disk(f), stores[0].snapshot());
});

test("schema corruption fails closed without defaults, rewriting, credentials calls, or online root checks", async (t) => {
  const f = await fixture(t);
  await save(f, remote());
  const valid = await disk(f);
  const variants = [
    "{", "null", "[]", JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, revision: -1 }), JSON.stringify({ ...valid, revision: 1.5 }),
    JSON.stringify({ ...valid, revision: Number.MAX_SAFE_INTEGER + 1 }),
    JSON.stringify({ ...valid, activeId: "missing" }), JSON.stringify({ ...valid, activeId: null }),
    JSON.stringify({ ...valid, key: "secret-echo" }),
    JSON.stringify({ ...valid, profiles: [...valid.profiles, valid.profiles[0]] }),
    JSON.stringify({ ...valid, profiles: Array(65).fill(valid.profiles[0]) }),
  ];
  for (const change of [
    { id: "../bad" }, { name: "" }, { name: "not trimmed " }, { name: "x".repeat(129) },
    { kind: "unknown" }, { root: "relative" }, { root: f.memory + "/../memory" },
    { allowWrites: "true" }, { allowWrites: undefined }, { key: "secret-echo" },
    { url: "https://brain.example" }, { credentialRef: "secret-echo" },
  ]) variants.push(JSON.stringify({ ...valid, profiles: [{ ...valid.profiles[0], ...change }, valid.profiles[1]] }));
  for (const change of [
    { credentialRef: "plaintext-secret-echo" }, { credentialRef: undefined },
    { url: "https://BRAIN.EXAMPLE:443/" }, { url: "http://unsafe.example" },
    { url: "https://brain.example?secret-echo" }, { root: f.memory }, { key: "secret-echo" },
  ]) variants.push(JSON.stringify({ ...valid, profiles: [valid.profiles[0], { ...valid.profiles[1], ...change }] }));
  const calls = f.credentials.calls.length;
  for (const content of variants) {
    await writeFile(f.filename, content);
    await rejectsCode(ConnectionStore.open({ directory: f.directory, initialRoot: f.memory, credentials: f.credentials }), "INVALID_STATE");
    assert.equal(await readFile(f.filename, "utf8"), content);
    assert.equal(f.credentials.calls.length, calls);
  }
  await writeFile(f.filename, JSON.stringify(valid));
  await rm(f.memory, { recursive: true });
  const offline = await ConnectionStore.open({ directory: f.directory });
  assert.deepEqual(offline.snapshot(), valid);
});

test("schema rejects duplicate normalized URLs, credential references, and existing real local destinations", async (t) => {
  const f = await fixture(t);
  await save(f, remote());
  await save(f, remote("https://other.example"));
  const valid = await disk(f);
  for (const change of [{ url: valid.profiles[1].url }, { credentialRef: valid.profiles[1].credentialRef }]) {
    const state = structuredClone(valid);
    Object.assign(state.profiles[2], change);
    await writeFile(f.filename, JSON.stringify(state));
    await rejectsCode(ConnectionStore.open({ directory: f.directory }), "INVALID_STATE");
  }
  const alias = path.join(f.root, "alias");
  await symlink(f.memory, alias);
  const state = structuredClone(valid);
  state.profiles[2] = { id: state.profiles[2].id, name: "Alias", kind: "local", root: alias, allowWrites: true };
  await writeFile(f.filename, JSON.stringify(state));
  await rejectsCode(ConnectionStore.open({ directory: f.directory }), "INVALID_STATE");
});

test("bounded files, profile counts and inputs reject before mutation", async (t) => {
  const f = await fixture(t);
  const bytes = await readFile(f.filename);
  await writeFile(f.filename, " ".repeat(128 * 1024 + 1));
  await rejectsCode(ConnectionStore.open({ directory: f.directory }), "INVALID_STATE");
  await writeFile(f.filename, bytes);
  for (const input of [null, [], {}, "bad", remote("https://a.example", { name: "x".repeat(129) }), remote("https://a.example", { name: "\n" }), remote("https://a.example", { credentialRef: "secret-echo" })]) {
    await rejectsCode(save(f, input), "INVALID_INPUT");
  }
  for (let i = 0; i < 63; i++) await save(f, remote(`https://brain-${i}.example`));
  assert.equal(f.store.snapshot().profiles.length, 64);
  const calls = f.credentials.calls.length;
  await rejectsCode(save(f, remote("https://too-many.example")), "PROFILE_LIMIT");
  assert.equal(f.credentials.calls.length, calls);
  assert.deepEqual(f.store.snapshot(), await disk(f));
});

test("rejects unsafe storage permissions, symbolic links, hardlinks, and directory replacement", async (t) => {
  const f = await fixture(t);
  const original = await readFile(f.filename);
  const external = path.join(f.root, "external");
  await writeFile(external, original, { mode: 0o600 });
  await rm(f.filename);
  await symlink(external, f.filename);
  await rejectsCode(ConnectionStore.open({ directory: f.directory }), "UNSAFE_STORAGE");
  await rejectsCode(save(f, remote()), "UNSAFE_STORAGE");
  assert.deepEqual(await readFile(external), original);
  await rm(f.filename);
  await link(external, f.filename);
  await rejectsCode(ConnectionStore.open({ directory: f.directory }), "UNSAFE_STORAGE");
  await rm(f.filename);
  await writeFile(f.filename, original, { mode: 0o644 });
  await rejectsCode(ConnectionStore.open({ directory: f.directory }), "UNSAFE_STORAGE");
  await chmod(f.filename, 0o600);
  await chmod(f.directory, 0o755);
  await rejectsCode(ConnectionStore.open({ directory: f.directory }), "UNSAFE_STORAGE");
  await chmod(f.directory, 0o700);
  const alias = path.join(f.root, "support-alias");
  await symlink(f.directory, alias);
  await rejectsCode(ConnectionStore.open({ directory: alias }), "UNSAFE_STORAGE");
  const nested = path.join(alias, "never-created");
  await rejectsCode(ConnectionStore.open({ directory: nested }), "UNSAFE_STORAGE");
  await assert.rejects(lstat(path.join(f.directory, "never-created")), { code: "ENOENT" });
  const unsafeParent = path.join(f.root, "shared");
  await mkdir(unsafeParent, { mode: 0o777 });
  await chmod(unsafeParent, 0o777);
  await rejectsCode(ConnectionStore.open({ directory: path.join(unsafeParent, "support") }), "UNSAFE_STORAGE");
  await assert.rejects(lstat(path.join(unsafeParent, "support")), { code: "ENOENT" });
  await rename(f.directory, path.join(f.root, "old-support"));
  await mkdir(f.directory, { mode: 0o700 });
  await writeFile(f.filename, original, { mode: 0o600 });
  await rejectsCode(save(f, remote()), "UNSAFE_STORAGE");
});


test("Keychain creation precedes reference publication; cleanup follows publication, and readers see complete atomic state", async (t) => {
  const f = await fixture(t);
  f.credentials.set = async (reference, key) => {
    assert.ok(!(await disk(f)).profiles.some((profile) => profile.credentialRef === reference));
    await Credentials.prototype.set.call(f.credentials, reference, key);
  };
  f.credentials.delete = async (reference) => {
    assert.ok(!(await disk(f)).profiles.some((profile) => profile.credentialRef === reference));
    await Credentials.prototype.delete.call(f.credentials, reference);
  };
  let running = true;
  let reads = 0;
  const reader = (async () => {
    while (running) {
      const state = await disk(f);
      assert.equal(state.version, 1);
      assert.equal(state.profiles.length, state.revision === 0 ? 1 : 2);
      assert.equal((await lstat(f.filename)).mode & 0o777, 0o600);
      for (const name of await readdir(f.directory)) {
        if (name === "connections.json") continue;
        assert.match(name, /^\.connections-[0-9a-f-]+\.tmp$/);
        const info = await lstat(path.join(f.directory, name)).catch((error) => {
          if (error.code !== "ENOENT") throw error;
          return null; // It was atomically renamed while this reader was running.
        });
        if (info) assert.equal(info.mode & 0o777, 0o600);
      }
      reads++;
    }
  })();
  try {
    await save(f, remote());
    const profile = f.store.snapshot().profiles[1];
    for (let i = 0; i < 10; i++) await save(f, remote(profile.url, { id: profile.id, key: `rotation-fixture-key-${i}` }));
  } finally { running = false; await reader; }
  assert.ok(reads > 0);
  assert.equal(f.credentials.items.size, 1);
  assert.deepEqual(await readdir(f.directory), ["connections.json"]);
});

test("external revision changes during Keychain set abort persistence and remove the newly allocated reference", async (t) => {
  const f = await fixture(t);
  await save(f, remote());
  const before = f.store.snapshot();
  const original = before.profiles[1];
  const changed = structuredClone(before);
  changed.revision++;
  changed.profiles[0].name = "Changed externally";
  f.credentials.set = async (reference, key) => {
    await Credentials.prototype.set.call(f.credentials, reference, key);
    await writeFile(f.filename, JSON.stringify(changed));
  };
  await rejectsCode(save(f, remote(original.url, { id: original.id, key: "new-fixture-key" })), "REVISION_CONFLICT");
  assert.deepEqual(f.store.snapshot(), before);
  assert.deepEqual(await disk(f), changed);
  assert.deepEqual([...f.credentials.items.keys()], [original.credentialRef]);
  assert.deepEqual(await readdir(f.directory), ["connections.json"]);
});
