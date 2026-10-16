import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { constants } from 'node:fs';
import { access, lstat, open, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export function isFeedbackMailto(value) {
  try {
    const url = new URL(value);
    return value.length <= 100000 && url.protocol === 'mailto:' && url.pathname === 'jumpybrain@agentmail.to'
      && !url.hash && !url.host && [...url.searchParams.keys()].every((key) => ['subject', 'body'].includes(key))
      && url.searchParams.getAll('subject').length === 1 && url.searchParams.getAll('body').length === 1
      && url.searchParams.get('subject') === 'jumpyBrain beta feedback';
  } catch { return false; }
}

export function isFeedbackDownload({ url, filename, mime, size }, origin) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'blob:' && parsed.origin === origin
      && filename === 'jumpybrain-feedback.eml' && mime === 'message/rfc822'
      && size >= 0 && size <= 65536;
  } catch { return false; }
}

export function isAppNavigation(value, origin) {
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password
      && ['/', '/graph', '/settings'].includes(url.pathname);
  } catch { return false; }
}

export async function installedCompanion({ home = os.homedir(), appPath = process.env.JUMPYBRAIN_COMPANION_APP } = {}) {
  const candidates = appPath ? [appPath] : [path.join(home, 'Applications/jumpyBrain.app'), '/Applications/jumpyBrain.app'];
  let selected;
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) throw new Error('JUMPYBRAIN_COMPANION_APP must be an absolute app path.');
    try {
      selected = JSON.parse(await readFile(path.join(candidate, 'Contents/Resources/Configuration.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT' && !appPath) continue;
      throw new Error('Cannot read the installed companion configuration. Repair the native companion installation.');
    }
    if (!Number.isInteger(selected.port) || selected.port < 1024 || selected.port > 65535
      || !path.isAbsolute(selected.supportDirectory || '') || !path.isAbsolute(selected.runtimeRoot || '')) {
      throw new Error('The installed companion configuration is unsupported.');
    }
    try { await access(path.join(selected.runtimeRoot, 'dist/cli.js')); }
    catch { throw new Error('The installed jumpyBrain runtime is missing. Repair the CLI installation first.'); }
    return { appPath: candidate, supportDirectory: selected.supportDirectory,
      runtimeRoot: selected.runtimeRoot, origin: `http://127.0.0.1:${selected.port}` };
  }
  throw new Error('Install the jumpyBrain native companion first; this prototype uses its runtime and Keychain gateway.');
}

// Read the existing control capability only in the main process. Never log it,
// accept it on the command line, persist it in Electron storage, or read remote keys.
export async function readControlKey(directory) {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) {
    throw new Error('The companion support directory must be private and owned by your user.');
  }
  const file = await open(path.join(directory, 'api-key'), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size > 128 || info.uid !== process.getuid() || (info.mode & 0o077)) {
      throw new Error('The companion control key must be a private, single-link regular file.');
    }
    const key = (await file.readFile('utf8')).trim();
    if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error('The companion control key is invalid. Repair the native companion installation.');
    return key;
  } finally { await file.close(); }
}

export function probeCompanion(origin, key, { timeoutMs = 2500 } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(new URL('/companion/state', origin), {
      headers: { Authorization: `Bearer ${key}` },
    }, (response) => {
      const chunks = []; let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 131072) response.destroy(new Error('Invalid companion response.'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        let state;
        try { state = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* Reject foreign services. */ }
        if (response.statusCode !== 200 || !state || typeof state.generation !== 'number'
          || !Array.isArray(state.profiles) || typeof state.health !== 'string') {
          reject(new Error('The configured port did not authenticate as the installed companion. Open the native app and resolve its startup error.'));
        } else resolve();
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error('Companion did not respond.'), { code: 'ETIMEDOUT' })));
    request.on('error', reject);
  });
}

export async function connectCompanion(config, { launch = (appPath) => execute('/usr/bin/open', ['-g', appPath]),
  probe = probeCompanion, readKey = readControlKey, deadlineMs = 25000 } = {}) {
  let key = await readKey(config.supportDirectory);
  try { await probe(config.origin, key); return { ...config, key }; }
  catch (error) {
    // An occupied, unresponsive, or unauthenticated port is never adopted/restarted.
    if (error.code !== 'ECONNREFUSED') throw error;
  }
  await launch(config.appPath);
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    key = await readKey(config.supportDirectory);
    try { await probe(config.origin, key); return { ...config, key }; }
    catch (error) { if (!['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code)) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('The native companion did not become ready. Open jumpyBrain from the menu bar and check its logs.');
}
