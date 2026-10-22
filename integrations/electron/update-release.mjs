// Desktop-only release discovery and preparation. Markdown and CLI installs are untouched.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const repository = 'nikoatwork/jumpyBrain';
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function compareVersions(a, b) {
  if (!versionPattern.test(a) || !versionPattern.test(b)) throw new Error('Invalid release version.');
  const left = a.split('.').map(BigInt), right = b.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
export function selectRelease(releases, current) {
  if (!Array.isArray(releases)) throw new Error('Invalid release response.');
  const candidates = [];
  for (const release of releases) {
    const version = String(release.tag_name || '').replace(/^v/, '');
    if (release.draft || !release.published_at || !versionPattern.test(version) || compareVersions(version, current) <= 0) continue;
    // Numeric 0.x beta releases are the project's normal distribution channel.
    if (release.prerelease && !version.startsWith('0.')) continue;
    const name = `jumpybrain-${version}.tgz`;
    const asset = release.assets?.find((item) => item.name === name && item.state === 'uploaded');
    const url = `https://github.com/${repository}/releases/download/v${version}/${name}`;
    if (!asset || asset.browser_download_url !== url || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')
      || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 64 * 1024 * 1024) continue;
    candidates.push({ version, url, digest: asset.digest.slice(7), size: asset.size });
  }
  return candidates.sort((a, b) => compareVersions(b.version, a.version))[0] ?? null;
}
async function boundedFetch(url, maximum, { fetcher = fetch, timeoutMs = 20000, redirects = false } = {}) {
  const response = await fetcher(url, { redirect: redirects ? 'follow' : 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'jumpyBrain-desktop', Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('Release download unavailable.');
  if (Number(response.headers.get('content-length')) > maximum) throw new Error('Release response too large.');
  const parts = []; let size = 0;
  for await (const part of response.body) {
    size += part.length;
    if (size > maximum) throw new Error('Release response too large.');
    parts.push(part);
  }
  return Buffer.concat(parts);
}
export async function discoverRelease(current, options) {
  const data = await boundedFetch(`https://api.github.com/repos/${repository}/releases?per_page=30`, 2 * 1024 * 1024, options);
  return selectRelease(JSON.parse(data), current);
}
export function verifyAsset(data, release) {
  if (data.length !== release.size || createHash('sha256').update(data).digest('hex') !== release.digest) throw new Error('Release verification failed.');
}
export function runCommand(command, args, { cwd, env, timeoutMs = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Update preparation failed.')); });
  });
}
export function buildEnvironment(node, home = os.homedir()) {
  return { HOME: home, PATH: `${path.dirname(node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`, LANG: 'en_US.UTF-8',
    npm_config_audit: 'false', npm_config_fund: 'false' };
}
export async function stageRelease(release, { directory, node, progress = () => {}, run = runCommand, fetcher } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const stage = await mkdtemp(path.join(directory, 'release-'));
  try {
    progress('Downloading update…');
    const bytes = await boundedFetch(release.url, release.size, { fetcher, timeoutMs: 120000, redirects: true });
    verifyAsset(bytes, release);
    const archive = path.join(stage, 'release.tgz');
    await writeFile(archive, bytes, { mode: 0o600 });
    const env = buildEnvironment(node);
    const extractor = path.join(stage, 'extract.py');
    await writeFile(extractor, await readFile(new URL('./update-extract.py', import.meta.url)), { mode: 0o600 });
    await run('/usr/bin/python3', ['-B', extractor, archive, stage], { env });
    const source = path.join(stage, 'package');
    for (const file of ['package.json', 'integrations/electron/package.json']) {
      const metadata = JSON.parse(await readFile(path.join(source, file), 'utf8'));
      if (metadata.version !== release.version) throw new Error('Release version mismatch.');
    }
    progress('Installing update… This can take a few minutes.');
    const electron = path.join(source, 'integrations/electron');
    await run('npm', ['ci', '--include=dev'], { cwd: electron, env });
    await run(node, ['install.mjs', '--output', path.join(stage, 'build')], { cwd: electron, env });
    const bundle = path.join(stage, 'build/jumpyBrain.app');
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { env });
    await rm(archive);
    // Retain the source installer and its Python dependencies for the post-exit handoff.
    return { stage, bundle, installer: path.join(electron, 'desktop-install.py'), version: release.version };
  } catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
}
