import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createEnvFileCredentials, credentialsEnvFile, keyVariable, parseEnv, readCredentialsFile, remoteKeyForUrl, urlVariable }
  from "../dist/adapters/credentials/env-file.js";
import { ConnectionStore } from "../integrations/macos-companion/connections.mjs";

const ref = (n) => `jumpybrain-companion:0000000${n}-0000-4000-8000-000000000000`;
async function scratch(t) {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "env-credentials-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, file: path.join(root, "config", "jumpybrain", ".env") };
}
const mode = async (file) => (await lstat(file)).mode & 0o777;

test("default path is ~/.config/jumpybrain/.env; JUMPYBRAIN_ENV_FILE overrides; XDG is ignored so app and CLI agree", () => {
  assert.equal(credentialsEnvFile({ env: {}, home: "/Users/x" }), "/Users/x/.config/jumpybrain/.env");
  assert.equal(credentialsEnvFile({ env: { XDG_CONFIG_HOME: "/elsewhere" }, home: "/Users/x" }), "/Users/x/.config/jumpybrain/.env");
  assert.equal(credentialsEnvFile({ env: { JUMPYBRAIN_ENV_FILE: "/tmp/k.env" }, home: "/Users/x" }), "/tmp/k.env");
  assert.equal(keyVariable(ref(1)), "JUMPYBRAIN_KEY_00000001_0000_4000_8000_000000000000");
  assert.throws(() => keyVariable("not-a-reference"));
});

test("parser handles export, quotes, escapes and comments without inventing values", () => {
  const lines = parseEnv([
    "# comment", "export A=plain", 'B="has space # not comment"', "C='single $x'", "D=value # trailing", 'E="esc \\" quote"', "not a line", 'F="unterminated',
  ].join("\n"));
  const values = Object.fromEntries(lines.filter((line) => line.name).map((line) => [line.name, line.value]));
  assert.deepEqual(values, { A: "plain", B: "has space # not comment", C: "single $x", D: "value", E: 'esc " quote' });
});

test("set/get/delete write an owner-only file atomically, keep hand edits, and never leak keys in errors", async (t) => {
  const { root, file } = await scratch(t);
  const store = createEnvFileCredentials({ file });
  assert.equal(await store.get(ref(1)), null, "missing file reads as no key");
  await store.set(ref(1), "secret-one", { url: "https://brain.example" });
  assert.equal(await mode(file), 0o600);
  assert.equal(await mode(path.dirname(file)), 0o700);
  assert.equal(await store.get(ref(1)), "secret-one");
  await writeFile(file, (await readFile(file, "utf8")) + "# my note\nJUMPYBRAIN_API_KEY=default-key\nOTHER=keep\n", { mode: 0o600 });
  await Promise.all([store.set(ref(2), 'with "quote" and space', { url: "https://two.example" }), store.set(ref(3), "three")]);
  assert.equal(await store.get(ref(2)), 'with "quote" and space');
  assert.equal(await store.get(ref(3)), "three", "concurrent writes are serialized, none lost");
  await store.set(ref(1), "rotated");
  await store.delete(ref(2));
  const text = await readFile(file, "utf8");
  assert.match(text, /^# jumpyBrain remote access keys/);
  assert.match(text, /# my note\nJUMPYBRAIN_API_KEY=default-key\nOTHER=keep/);
  assert.equal((text.match(/JUMPYBRAIN_KEY_00000001/g) || []).length, 1, "rotation replaces in place");
  assert.doesNotMatch(text, /secret-one|two\.example|quote/);
  assert.match(text, new RegExp(urlVariable(ref(1)) + "=https://brain.example"));
  assert.deepEqual((await readdir(path.dirname(file))).filter((name) => name !== ".env"), [], "no temporary files left behind");
  await assert.rejects(store.set(ref(4), "line\nbreak"), (error) => !String(error.message).includes("break"));
  await chmod(file, 0o644);
  await assert.rejects(store.get(ref(1)), (error) => error.code === "credential_file_insecure" && /chmod 600/.test(error.message) && !/rotated/.test(error.message));
  await store.set(ref(5), "five");
  assert.equal(await mode(file), 0o600, "a write repairs permissions");
  assert.equal(await store.get(ref(1)), "rotated");
  // Dotfile managers often symlink the file: writes keep the link and update its target.
  const real = path.join(root, "dotfiles.env");
  await writeFile(real, "", { mode: 0o600 }); await rm(file); await symlink(real, file);
  await store.set(ref(6), "linked");
  assert.equal((await lstat(file)).isSymbolicLink(), true);
  assert.match(await readFile(real, "utf8"), /=linked/);
  assert.equal(await store.get(ref(6)), "linked");
});

test("CLI key resolution: environment, then the app key saved for that exact URL, then the file default", async (t) => {
  const { file } = await scratch(t);
  assert.equal(await remoteKeyForUrl("https://brain.example", { file, env: {} }), null);
  const store = createEnvFileCredentials({ file });
  await store.set(ref(1), "app-key", { url: "https://brain.example" });
  await store.set(ref(2), "other-key", { url: "https://other.example" });
  assert.equal(await remoteKeyForUrl("https://brain.example/", { file, env: {} }), "app-key");
  assert.equal(await remoteKeyForUrl("https://other.example", { file, env: {} }), "other-key");
  assert.equal(await remoteKeyForUrl("https://unknown.example", { file, env: {} }), null);
  assert.equal(await remoteKeyForUrl("https://brain.example", { file, env: { JUMPYBRAIN_API_KEY: " env-key " } }), "env-key");
  await writeFile(file, (await readFile(file, "utf8")) + "JUMPYBRAIN_API_KEY=file-default\n", { mode: 0o600 });
  assert.equal(await remoteKeyForUrl("https://unknown.example", { file, env: {} }), "file-default");
  assert.equal(await remoteKeyForUrl("https://brain.example", { file, env: {} }), "app-key", "a matching connection beats the default");
  await chmod(file, 0o640);
  await assert.rejects(remoteKeyForUrl("https://brain.example", { file, env: {} }), /chmod 600/);
});

test("connection store saves, rotates and removes remote keys in the real .env file; profile JSON never holds a key", async (t) => {
  const { root, file } = await scratch(t);
  const directory = path.join(root, "support"), memory = path.join(root, "memory");
  await mkdir(directory, { mode: 0o700 }); await mkdir(memory);
  await writeFile(path.join(memory, "jumpybrain.json"), "{}\n");
  const credentials = createEnvFileCredentials({ file });
  const store = await ConnectionStore.open({ directory, initialRoot: memory, credentials });
  await store.save({ name: "VPS brain", kind: "remote", url: "https://vps.example", key: "first-key" }, store.snapshot().revision);
  const saved = store.snapshot().profiles.find((profile) => profile.kind === "remote");
  assert.equal(await remoteKeyForUrl("https://vps.example", { file, env: {} }), "first-key", "the CLI sees the app's key");
  await store.save({ id: saved.id, name: "VPS brain", kind: "remote", url: "https://vps.example", key: "second-key" }, store.snapshot().revision);
  assert.equal(await remoteKeyForUrl("https://vps.example", { file, env: {} }), "second-key");
  assert.equal((await readFile(file, "utf8")).match(/^JUMPYBRAIN_KEY_/gm).length, 1, "the replaced key is removed");
  await store.save({ id: saved.id, name: "Renamed", kind: "remote", url: "https://vps.example" }, store.snapshot().revision);
  assert.equal(await remoteKeyForUrl("https://vps.example", { file, env: {} }), "second-key", "a rename keeps the key");
  // Reopen as after an app update: the key is still there (the reported Keychain failure).
  const reopened = await ConnectionStore.open({ directory, initialRoot: memory, credentials: createEnvFileCredentials({ file }) });
  const profile = reopened.snapshot().profiles.find((item) => item.kind === "remote");
  await reopened.save({ id: profile.id, name: "Renamed", kind: "remote", url: "https://vps.example" }, reopened.snapshot().revision);
  for (const name of await readdir(directory)) {
    const info = await lstat(path.join(directory, name));
    if (info.isFile()) assert.doesNotMatch(await readFile(path.join(directory, name), "utf8"), /first-key|second-key/);
  }
  await reopened.setActive(reopened.snapshot().profiles.find((item) => item.kind === "local").id, reopened.snapshot().revision);
  await reopened.remove(profile.id, reopened.snapshot().revision);
  assert.equal(await remoteKeyForUrl("https://vps.example", { file, env: {} }), null);
  assert.doesNotMatch(await readFile(file, "utf8"), /JUMPYBRAIN_(KEY|URL)_/);
  assert.equal((await readCredentialsFile(file)).size, 0);
});
