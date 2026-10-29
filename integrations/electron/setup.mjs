// Main-process setup policy. Paths come from the host default or native picker.
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { lstat, readdir, realpath, readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const desktopRepairInstructions = 'Desktop setup needs repair. Ask your agent: “Add the jumpyBrain Mac app to my existing brain using docs/install-for-agents.md.” With the default CLI installation, run cd "$HOME/.jumpybrain/app" then npm run desktop:setup. If it is absent, follow https://github.com/nikoatwork/jumpyBrain/blob/master/docs/install.md for public source setup. Reopen jumpyBrain when setup finishes.';

// Raw host/filesystem errors can contain private paths. Keep them in main-process
// startup state; show only actionable, known reasons on user-facing surfaces.
export function desktopStartupMessage(error) {
  if (error?.code === 'ERR_DESKTOP_UPDATE_SOCKET_PATH') return error.message;
  const reason = /^Another jumpyBrain service|^The local port belongs/u.test(error?.message || '')
    ? error.message : 'The local brain service could not start.';
  return reason + ' ' + desktopRepairInstructions;
}

export async function inspectBrainFolder(folder) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('Choose a local folder.');
  const root = await realpath(folder);
  if (!(await lstat(root)).isDirectory()) throw new Error('Choose a folder.');
  try {
    const marker = await lstat(path.join(root, 'jumpybrain.json'));
    if (!marker.isFile() || marker.isSymbolicLink() || marker.nlink !== 1) throw new Error('The brain configuration must be a regular file.');
    return { root, existing: true };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const entries = await readdir(root);
  if (entries.some((name) => name !== '.DS_Store')) throw new Error('Choose an empty folder for a new brain, or an existing brain with jumpybrain.json. Your files have not been changed.');
  return { root, existing: false };
}

// Read-only suggestion. An unavailable existing destination must not silently
// become a different brain. The renderer cannot supply a filesystem path.
export async function suggestLocalBrain(state, { home = os.homedir() } = {}) {
  const profile = state.profiles.find(item => item.id === state.activeId && item.kind === 'local')
    || state.profiles.find(item => item.kind === 'local');
  const root = profile?.root || path.join(home, '.jumpybrain', 'memory');
  try { return await inspectBrainFolder(root); }
  catch (error) {
    if (error.code === 'ENOENT' && !profile) return { root, existing: false, missing: true };
    if (error.code === 'ENOENT') throw new Error('We couldn’t find your saved folder. Reconnect its drive, or use a different folder.');
    throw new Error('This folder isn’t ready. Choose an empty folder or one you already use with jumpyBrain.');
  }
}

export async function prepareLocalBrain(selected) {
  if (selected.missing) await mkdir(selected.root, { recursive: true, mode: 0o700 });
  return inspectBrainFolder(selected.root);
}

export async function activateRemoteBrain(connection, input, { control = companionControl } = {}) {
  if (typeof input?.key === 'string' && !input.key.trim()) throw new Error('Enter your access key.');
  if (!input || typeof input.url !== 'string' || input.url.length > 2048 || typeof input.key !== 'string'
    || !input.key.trim() || input.key.length > 4096 || /[\x00-\x1f\x7f]/.test(input.key)) {
    throw new Error('Enter the server address and access key you were given.');
  }
  // The connection store applies the authoritative origin/credential policy.
  // Normalizing only a trailing slash lets retries find the already saved profile.
  let url;
  try { url = new URL(input.url.trim()); } catch { throw new Error('Check the server address. It should look like https://brain.example.com.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || input.url.includes('\\') || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Use an HTTPS server address without a page path, such as https://brain.example.com. HTTP is also supported for a server on this Mac (localhost).');
  }
  let state = await control(connection);
  const existing = state.profiles.find(item => item.kind === 'remote' && item.url === url.origin);
  state = await control(connection, 'profiles', { revision: state.revision, profile: {
    ...(existing ? { id: existing.id } : {}), name: existing?.name || url.hostname, kind: 'remote', url: input.url.trim(), key: input.key,
  } });
  const profile = state.profiles.find(item => item.kind === 'remote' && item.url === url.origin);
  if (!profile) throw new Error('The connection wasn’t saved. Please try again.');
  const { health } = await control(connection, 'test', { id: profile.id });
  if (health !== 'connected') throw new Error(health === 'authentication_failed'
    ? 'That access key didn’t work. Check it and try again.'
    : health === 'credential_unavailable' ? 'Allow jumpyBrain to use your Mac’s Keychain, then try again.'
      : 'We couldn’t reach that brain. Check the server address and your connection, then try again.');
  return state.activeId === profile.id ? state : control(connection, 'switch', { id: profile.id });
}

// Bounded, authenticated local control only; never redirect or expose keys to UI.
export function companionControl({ origin, key }, route = 'state', body) {
  if (!['state', 'profiles', 'switch', 'test'].includes(route)) throw new Error('Unsupported setup action.');
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request(new URL('/companion/' + route, origin), {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + key, ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }) },
    }, (response) => {
      const chunks = []; let size = 0;
      response.on('data', (chunk) => { size += chunk.length; if (size > 131072) response.destroy(new Error('Invalid setup response.')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        let result;
        try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { reject(new Error('Invalid setup response.')); return; }
        if (response.statusCode !== 200) { reject(new Error(result?.error?.message || 'Could not save the connection. Try again.')); return; }
        if (route === 'test' ? !['connected', 'available', 'offline', 'authentication_failed', 'credential_unavailable'].includes(result?.health)
          : !Array.isArray(result?.profiles) || !Number.isSafeInteger(result.revision)) { reject(new Error('Invalid setup response.')); return; }
        resolve(result);
      });
    });
    request.setTimeout(25000, () => request.destroy(new Error('Connection setup timed out. Wait for other editor windows to finish saving, then try again.')));
    request.on('error', () => reject(new Error('Could not reach the local helper. Reopen jumpyBrain and try again.')));
    request.end(data);
  });
}

const pendingStarters = new Map(); // Retain the handoff across a failed save barrier in this setup session.

export async function activateLocalBrain(connection, selected, { control = companionControl, loadRuntime = (root) => import(pathToFileURL(path.join(root, 'dist/runtime/index.js')).href) } = {}) {
  const current = await inspectBrainFolder(selected.root);
  if (current.root !== selected.root || current.existing !== selected.existing) throw new Error('The folder changed. Choose it again before continuing.');
  const runtime = await loadRuntime(connection.runtimeRoot);
  let starterPage = pendingStarters.get(current.root);
  if (current.existing) await runtime.assertCompatibleMemoryRoot(current.root);
  else {
    await runtime.initializeMemoryRoot(current.root);
    starterPage = await runtime.createFocusStarterPage(current.root);
    pendingStarters.set(current.root, starterPage);
  } // Never force, migrate, index, or overwrite an existing config.
  let state = await control(connection);
  let profile = state.profiles.find((item) => item.kind === 'local' && item.root === current.root);
  if (!profile) {
    state = await control(connection, 'profiles', { revision: state.revision, profile: { name: path.basename(current.root).trim().slice(0, 120) || 'Local brain', kind: 'local', root: current.root } });
    profile = state.profiles.find((item) => item.kind === 'local' && item.root === current.root);
  }
  if (!profile) throw new Error('The brain connection was not saved. Choose the folder and try again.');
  if (state.activeId !== profile.id) state = await control(connection, 'switch', { id: profile.id });
  pendingStarters.delete(current.root);
  return { ...state, ...(starterPage ? { starterPage: { ...starterPage, scope: "brain:" + JSON.stringify([profile.id, profile.kind, profile.root]) } } : {}) };
}

export async function setupComplete(directory) {
  try { return JSON.parse(await readFile(path.join(directory, 'desktop-setup.json'), 'utf8')).version === 1; }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return false; throw error; }
}
export async function finishSetup(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, 'desktop-setup.json');
  const temporary = target + `.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1 }) + '\n', { mode: 0o600 });
  await rename(temporary, target);
}
