// Public release selection. No credentials, branch HEAD, or renderer-selected URLs.
import { createHash } from 'node:crypto';
export const REPOSITORY = 'nikoatwork/jumpyBrain';
export const SOURCE = `https://github.com/${REPOSITORY}.git`;
export const versionParts = (value) => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value || '') ? value.split('.').map(Number) : null;
export function compareVersions(a, b) {
  const aa = versionParts(a), bb = versionParts(b);
  if (!aa || !bb) throw new Error('Cannot compare installed and published versions. Repair the installation.');
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return Math.sign(aa[i] - bb[i]);
  return 0;
}
export function selectRelease(releases) {
  if (!Array.isArray(releases)) throw new Error('Invalid release response. Retry checking for updates.');
  const candidates = releases.filter(r => !r.draft && r.published_at && /^v\d+\.\d+\.\d+$/.test(r.tag_name) && versionParts(r.tag_name.slice(1)));
  candidates.sort((a, b) => compareVersions(b.tag_name.slice(1), a.tag_name.slice(1)));
  const r = candidates[0];
  if (!r) throw new Error('No published release is available. Try again later.');
  const version = r.tag_name.slice(1), name = `jumpybrain-${version}.tgz`;
  const assets = r.assets?.filter(a => a.name === name && a.state === 'uploaded');
  const a = assets?.length === 1 ? assets[0] : null;
  if (!a || !/^sha256:[a-f0-9]{64}$/.test(a.digest || '') || !Number.isSafeInteger(a.id)
    || !(a.size > 0 && a.size <= 128 * 1024 * 1024)
    || a.browser_download_url !== `https://github.com/${REPOSITORY}/releases/download/${r.tag_name}/${name}`) {
    throw new Error('The newest release has no verifiable desktop distribution. Retry after its publication is complete.');
  }
  return { version, tag: r.tag_name, releaseId: r.id, assetId: a.id, size: a.size, digest: a.digest,
    url: a.browser_download_url, notes: String(r.body || 'No release notes supplied.').slice(0, 24000) };
}
export async function boundedFetch(url, { fetcher = fetch, signal, limit = 2 * 1024 * 1024, timeout = 15000 } = {}) {
  const response = await fetcher(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'jumpyBrain-desktop-updater' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429
    ? 'GitHub temporarily limited update checks. Try again later.' : `Update download unavailable (HTTP ${response.status}). Check your connection and retry.`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('The update response exceeded its size limit. Nothing was installed.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function discoverRelease(options) {
  // Include beta/prereleases; /latest intentionally excludes the product's 0.x releases.
  const releases = [];
  for (let page = 1; page <= 3; page++) {
    const batch = JSON.parse((await boundedFetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=100&page=${page}`, options)).toString());
    if (!Array.isArray(batch)) throw new Error('Invalid release response.');
    releases.push(...batch);
    if (batch.length < 100) break;
    if (page === 3) throw new Error('Release history exceeds the supported check window. Update discovery needs maintenance.');
  }
  return selectRelease(releases);
}
export function verifyArtifact(bytes, release) {
  if (bytes.length !== release.size || `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== release.digest) {
    throw new Error('Release verification failed. The download was incomplete or changed. Check again and retry.');
  }
}
