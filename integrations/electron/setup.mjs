// Main-process setup policy. Folder paths come only from the native picker.
import path from 'node:path';
import http from 'node:http';
import { lstat, readdir, realpath, readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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

// Bounded, authenticated local control only; never redirect or expose keys to UI.
export function companionControl({ origin, key }, route = 'state', body) {
  if (!['state', 'profiles', 'switch'].includes(route)) throw new Error('Unsupported setup action.');
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
        if (!Array.isArray(result?.profiles) || !Number.isSafeInteger(result.revision)) { reject(new Error('Invalid setup response.')); return; }
        resolve(result);
      });
    });
    request.setTimeout(25000, () => request.destroy(new Error('Connection setup timed out. Wait for other editor windows to finish saving, then try again.')));
    request.on('error', () => reject(new Error('Could not reach the local helper. Reopen jumpyBrain and try again.')));
    request.end(data);
  });
}

export async function activateLocalBrain(connection, selected, { control = companionControl, loadRuntime = (root) => import(pathToFileURL(path.join(root, 'dist/runtime/index.js')).href) } = {}) {
  const current = await inspectBrainFolder(selected.root);
  if (current.root !== selected.root || current.existing !== selected.existing) throw new Error('The folder changed. Choose it again before continuing.');
  const runtime = await loadRuntime(connection.runtimeRoot);
  if (current.existing) await runtime.assertCompatibleMemoryRoot(current.root);
  else await runtime.initializeMemoryRoot(current.root); // Never force, migrate, index, or overwrite an existing config.
  let state = await control(connection);
  let profile = state.profiles.find((item) => item.kind === 'local' && item.root === current.root);
  if (!profile) {
    state = await control(connection, 'profiles', { revision: state.revision, profile: { name: path.basename(current.root).trim().slice(0, 120) || 'Local brain', kind: 'local', root: current.root } });
    profile = state.profiles.find((item) => item.kind === 'local' && item.root === current.root);
  }
  if (!profile) throw new Error('The brain connection was not saved. Choose the folder and try again.');
  if (state.activeId !== profile.id) state = await control(connection, 'switch', { id: profile.id });
  return state;
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
