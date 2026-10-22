// Disposable inputs for the desktop RAM baseline. Never launches or retargets the app.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, readlink, realpath, utimes, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const COUNTS = [0, 100, 1000, 10000];
const EPOCH = '2026-01-01T00:00:00.000Z';
const BUCKETS = ['notes', 'notes', 'notes', 'notes', 'notes', 'sessions', 'findings', 'decisions', 'preferences', 'pages'];
const TYPES = { notes: 'note', sessions: 'session', findings: 'finding', decisions: 'decision', preferences: 'preference', pages: 'page' };
const SIZES = [1024, 1024, 1024, 1024, 1024, 1024, 1024, 1024, 4096, 16384];
const repo = fileURLToPath(new URL('..', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const label = (index) => String(index).padStart(5, '0');
export const noteId = (index) => `mem_a0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
export const notePath = (index) => `${BUCKETS[index % BUCKETS.length]}/ram-${label(index)}.md`;

export function noteBytes(index, count) {
  const connected = Math.floor(count * 0.9);
  const updated = new Date(Date.parse(EPOCH) + index * 1000).toISOString();
  let content = [
    '---', `id: "${noteId(index)}"`, `type: "${TYPES[BUCKETS[index % BUCKETS.length]]}"`,
    `title: "RAM fixture ${label(index)}"`, 'tags: ["ram-benchmark", "synthetic"]',
    `created_at: "${EPOCH}"`, `updated_at: "${updated}"`, '---', '',
    `# RAM fixture ${label(index)}`, '',
    `The observatory stores telescope calibration records. Exact token: ramneedle${label(index)}.`,
    'Engineers inspect sensor alignment before each observation. Unicode: café, 日本語.', '',
  ].join('\n');
  if (index < connected) {
    const targets = [1, 7, 31].map((offset) => (index + offset) % connected);
    content += `\n[[RAM fixture ${label(targets[0])}]]\n`;
    content += `[Path target](${notePath(targets[1])})\n`;
    content += `[ID target](${noteId(targets[2])})\n`;
    if (index % 10 === 0) content += `[[Missing RAM target ${label(index)}]]\n`;
  }
  content += '\n';
  const remaining = SIZES[index % SIZES.length] - Buffer.byteLength(content) - 1;
  if (remaining < 0) throw new Error('Fixture metadata exceeds the declared byte budget');
  const filler = 'Calibration evidence remains in local Markdown. ';
  return Buffer.from(content + filler.repeat(Math.ceil(remaining / filler.length)).slice(0, remaining) + '\n');
}

export async function hashFile(file) {
  const before = await lstat(file, { bigint: true });
  if (!before.isFile()) throw new Error(`Expected a regular file: ${file}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const after = await lstat(file, { bigint: true });
  if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some((key) => before[key] !== after[key])) {
    throw new Error(`File changed while hashing: ${file}`);
  }
  return { bytes: Number(after.size), sha256: hash.digest('hex') };
}

// Fingerprint names, contents, executable modes and symlink targets, never timestamps.
// Internal framework symlinks are counted once; external/broken links fail closed.
export async function fingerprintTree(directory) {
  const root = await realpath(directory);
  const entries = [];
  async function walk(relative) {
    for (const name of (await readdir(path.join(root, relative))).sort()) {
      const file = relative ? `${relative}/${name}` : name;
      const absolute = path.join(root, file);
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) {
        const resolved = await realpath(absolute);
        const within = path.relative(root, resolved);
        if (within === '..' || within.startsWith('../') || path.isAbsolute(within)) {
          throw new Error(`Artifact symlink escapes its tree: ${file}`);
        }
        entries.push({ file, kind: 'symlink', target: await readlink(absolute) });
      } else if (stat.isDirectory()) {
        entries.push({ file, kind: 'directory', mode: stat.mode & 0o777 });
        await walk(file);
      } else if (stat.isFile()) {
        entries.push({ file, kind: 'file', mode: stat.mode & 0o777, ...await hashFile(absolute) });
      } else throw new Error(`Unsupported file type: ${file}`);
    }
  }
  await walk('');
  const files = entries.filter((entry) => entry.kind === 'file');
  return { sha256: sha256(json(entries)), files: files.length,
    bytes: files.reduce((total, entry) => total + entry.bytes, 0), entries };
}

export async function createCorpus(root, count) {
  if (!COUNTS.includes(count)) throw new Error('Use a standard corpus size: ' + COUNTS.join('/'));
  await mkdir(root); // Exclusive: never overwrite an existing memory root.
  for (const bucket of Object.keys(TYPES)) await mkdir(path.join(root, bucket));
  await writeFile(path.join(root, 'jumpybrain.json'), json({
    schemaVersion: 1, createdAt: EPOCH, indexing: { mode: 'lexical' },
  }), { flag: 'wx' });
  await writeFile(path.join(root, '.gitignore'), '.jumpybrain/\n', { flag: 'wx' });
  const files = [];
  for (let index = 0; index < count; index++) {
    const file = notePath(index);
    const content = noteBytes(index, count);
    const absolute = path.join(root, file);
    await writeFile(absolute, content, { flag: 'wx' });
    // Metadata order and filesystem time are reproducible, without depending on copy time.
    const timestamp = new Date(Date.parse(EPOCH) + index * 1000);
    await utimes(absolute, timestamp, timestamp);
    files.push({ file, bytes: content.length, sha256: sha256(content) });
  }
  const connected = Math.floor(count * 0.9);
  return {
    directory: path.basename(root), notes: count,
    markdownBytes: files.reduce((total, file) => total + file.bytes, 0),
    markdownSha256: sha256(json(files)),
    sizeDistribution: Object.fromEntries([...new Set(SIZES)].map((size) => [size, files.filter((file) => file.bytes === size).length])),
    links: { resolvedOccurrences: connected * 3, unresolvedOccurrences: Math.ceil(connected / 10), orphanDocuments: count - connected },
    indexing: { mode: 'lexical', state: 'absent', automaticIndexing: false, model: null },
    workloadState: 'prepared-never-launched', tree: await fingerprintTree(root),
  };
}

function command(program, args, cwd) {
  return execFileSync(program, args, { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 }).trim();
}

async function executableIdentity(file) {
  const resolved = await realpath(file);
  return { path: file, resolvedPath: resolved, ...await hashFile(resolved) };
}

async function artifactIdentity(app) {
  const root = await realpath(app);
  const info = JSON.parse(command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(root, 'Contents/Info.plist')]));
  const resources = path.join(root, 'Contents/Resources');
  const runtime = JSON.parse(await readFile(path.join(resources, 'runtime/package.json'), 'utf8'));
  const native = JSON.parse(await readFile(path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json'), 'utf8'));
  return {
    path: root, bundleId: info.CFBundleIdentifier, version: info.CFBundleShortVersionString,
    runtimeVersion: runtime.version, tree: await fingerprintTree(root),
    externalNode: await executableIdentity(native.node),
    externalQmdLauncher: await executableIdentity(native.qmd),
    externalDependencyCoverage: 'Node binary and QMD launcher only. Before index/search runs, also fingerprint the resolved QMD package tree and any configured model. No QMD/model work has run.',
  };
}

export async function resolveOutputOutside(app, output) {
  app = await realpath(app);
  output = path.join(await realpath(path.dirname(path.resolve(output))), path.basename(output));
  const relative = path.relative(app, output);
  if (relative === '' || (relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative))) {
    throw new Error('Output must be outside the app artifact');
  }
  return output;
}

export async function prepare({ app, output }) {
  if (process.platform !== 'darwin') throw new Error('Desktop run manifests require macOS');
  app = await realpath(app);
  output = await resolveOutputOutside(app, output);
  // Exclusive creation: even malformed arguments cannot alter an existing folder.
  await mkdir(output);
  const artifact = await artifactIdentity(app);
  const corpora = [];
  for (const count of COUNTS) corpora.push(await createCorpus(path.join(output, `corpus-${count}`), count));
  const manifest = {
    schema: 1, createdAt: new Date().toISOString(), state: 'prepared-never-launched',
    generator: { version: 1, sha256: (await hashFile(fileURLToPath(import.meta.url))).sha256 },
    machine: {
      os: command('/usr/bin/sw_vers', ['-productVersion']), build: command('/usr/bin/sw_vers', ['-buildVersion']),
      arch: os.arch(), model: command('/usr/sbin/sysctl', ['-n', 'hw.model']),
      cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem(),
    },
    checkoutContext: {
      head: command('git', ['rev-parse', 'HEAD'], repo),
      dirty: Boolean(command('git', ['status', '--porcelain'], repo)),
      note: 'Context only; the app tree hash identifies the artifact. No source-revision equivalence is inferred.',
    },
    artifact, corpora,
    protocol: {
      repetitions: 3, settledWindowSeconds: 60, recoverySeconds: 300, soakSeconds: 1800,
      measurements: 'not-started',
      coldDefinition: 'Fresh owned process tree and disposable user data; OS filesystem cache is uncontrolled and must be reported.',
      modelPolicy: 'No model loaded or downloaded. Semantic measurements require a separate fresh copy, explicit local GGUF path/hash, and verified semantic readiness; lexical fallback is not a semantic result.',
    },
  };
  await writeFile(path.join(output, 'manifest.json'), json(manifest), { flag: 'wx' });
  return manifest;
}

export async function verify(output) {
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 1 || manifest.state !== 'prepared-never-launched' ||
      JSON.stringify(manifest.corpora.map((corpus) => corpus.notes)) !== JSON.stringify(COUNTS)) {
    throw new Error('Not a complete prepared RAM fixture manifest');
  }
  for (const corpus of manifest.corpora) {
    if (corpus.directory !== `corpus-${corpus.notes}`) throw new Error('Unexpected corpus directory');
    const actual = await fingerprintTree(path.join(output, corpus.directory));
    if (actual.sha256 !== corpus.tree.sha256) throw new Error(`Corpus changed: ${corpus.directory}`);
  }
  const actual = await fingerprintTree(manifest.artifact.path);
  if (actual.sha256 !== manifest.artifact.tree.sha256) throw new Error('App artifact changed');
  for (const dependency of [manifest.artifact.externalNode, manifest.artifact.externalQmdLauncher]) {
    const current = await executableIdentity(dependency.path);
    if (current.resolvedPath !== dependency.resolvedPath || current.sha256 !== dependency.sha256) {
      throw new Error('External executable changed');
    }
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: {
      app: { type: 'string' }, output: { type: 'string' }, verify: { type: 'boolean' }, help: { type: 'boolean' },
    } });
    if (values.help) console.log('node scripts/desktop-ram-fixtures.mjs --app /path/jumpyBrain.app --output /new/folder\nnode scripts/desktop-ram-fixtures.mjs --verify --output /existing/folder');
    else {
      if (!values.output || (!values.verify && !values.app) || (values.verify && values.app)) {
        throw new Error('Use --app APP --output NEW_DIRECTORY, or --verify --output DIRECTORY');
      }
      const output = path.resolve(values.output);
      const manifest = values.verify ? await verify(output) : await prepare({ app: path.resolve(values.app), output });
      console.log(json({ manifest: path.join(output, 'manifest.json'), verified: Boolean(values.verify), state: manifest.state,
        artifactSha256: manifest.artifact.tree.sha256,
        corpora: manifest.corpora.map(({ notes, markdownBytes, markdownSha256, links }) => ({ notes, markdownBytes, markdownSha256, links })) }));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
