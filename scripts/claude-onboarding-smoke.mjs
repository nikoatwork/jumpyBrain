#!/usr/bin/env node
// Opt-in authenticated Claude test. Uses the default account normally; never reads auth files.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function summarize(conversations) {
  const [check, remember, recall] = conversations;
  const captures = conversation => (conversation?.canonicalAfter || []).filter(file => /^(notes|findings|decisions|preferences|pages|sessions)\//.test(file.path));
  const final = recall?.events.find(event => event.type === 'result')?.result || '';
  return {
    threeIndependentInvocations: conversations.length === 3,
    realModelCompletedAll: conversations.length === 3 && conversations.every(conversation => conversation.code === 0 && conversation.events.some(event => event.type === 'result' && !event.is_error && event.usage?.output_tokens > 0)),
    projectSkillDiscoveredAll: conversations.length === 3 && conversations.every(conversation => conversation.discovery?.skills?.includes('jumpybrain-memory')),
    actualSkillActivatedAll: conversations.length === 3 && conversations.every(conversation => conversation.events.some(event => event.tool_use_result?.success && event.tool_use_result.commandName === 'jumpybrain-memory')),
    noSampleCapture: captures(check).length === 0,
    exactlyOneCapturedMemory: captures(remember).length === 1,
    canonicalUnchangedByRecall: !!recall && JSON.stringify(recall.canonicalAfter) === JSON.stringify(remember.canonicalAfter),
    citedRetrievedSource: /community-event-date\.md/.test(final) && /(?:lines?\s+|:)\s*12\s*[-–]\s*14/.test(final),
    // Narrow regression detector for this exact journey, with human review still required.
    correctEventDayMonth: /18\s+November/i.test(final),
    explicitUnknownYear: /(?:no|not|unknown|unspecified)[^.\n]{0,45}year|year[^.\n]{0,45}(?:no|not|unknown|unspecified)/i.test(final),
    noSpeculativeEventYear: !!final && !/(?:18\s+November\s+[12]\d{3}|[12]\d{3}[-/]11[-/]18|(?:likely|probably|presumably)[^.\n]*\b[12]\d{3})/i.test(final),
    finalAnswer: final,
  };
}
if (process.argv[2] === '--inspect-evidence') {
  const evidence = JSON.parse(await readFile(process.argv[3], 'utf8'));
  evidence.checks = summarize(evidence.conversations);
  await writeFile(process.argv[3], JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence.checks, null, 2));
  if (Object.entries(evidence.checks).some(([key, value]) => key !== 'finalAnswer' && value !== true)) process.exitCode = 1;
} else {
const repo = fileURLToPath(new URL('..', import.meta.url));
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-claude-authenticated-')));
const home = path.join(temporary, 'Disposable home');
const workspace = path.join(temporary, 'First project');
const root = path.join(workspace, 'memory');
const source = path.join(temporary, 'source');
const installRoot = path.join(home, '.jumpybrain');
const cli = path.join(installRoot, 'bin/jumpybrain');
const evidencePath = process.argv[2] || temporary + '-evidence.json';
const realHome = os.homedir();
const evidence = { steps: [], conversations: [], provenance: {}, checks: {} };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
function clean(value) {
  if (typeof value === 'string') return value.replaceAll(temporary, '<TEMP>').replaceAll(repo.replace(/\/$/, ''), '<CHECKOUT>').replaceAll(realHome, '<REAL_HOME>')
    .replaceAll(process.env.USER || '\u0000', '<LOCAL_USER>');
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(session_id|sessionId|uuid|account|accountInfo|email|organization|apiKey|accessToken|refreshToken|signature)$/i.test(key))
    .map(([key, item]) => [key, clean(item)]));
  return value;
}
const sharedEnv = { PATH: process.env.PATH, TMPDIR: path.join(temporary, 'scratch'),
  XDG_CACHE_HOME: path.join(temporary, 'cache'), XDG_CONFIG_HOME: path.join(temporary, 'config'),
  XDG_DATA_HOME: path.join(temporary, 'data'), XDG_STATE_HOME: path.join(temporary, 'state'),
  JUMPYBRAIN_QMD_BIN: '/opt/homebrew/bin/qmd', JUMPYBRAIN_MEMORY_ROOT: root,
  NODE_DISABLE_COMPILE_CACHE: '1', NODE_COMPILE_CACHE: path.join(temporary, 'node-cache') };
function run(label, command, args, env, timeout = 150000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeout);
    child.stdout.on('data', bytes => { stdout += bytes; });
    child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      evidence.steps.push({ label, command, args, code, signal, timedOut });
      resolve({ stdout, stderr, code, signal, timedOut });
    });
  });
}
async function canonicalFiles(directory = root, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await canonicalFiles(path.join(directory, entry.name), relative));
    else if (entry.name.endsWith('.md')) result.push({ path: relative, text: await readFile(path.join(directory, entry.name), 'utf8') });
  }
  return result;
}
try {
  await Promise.all([home, workspace, source, sharedEnv.TMPDIR].map(dir => mkdir(dir, { recursive: true })));
  // Positive source allowlist: do not copy checkout .env, personal memory or untracked evidence.
  for (const item of ['dist', 'scripts', 'skills', 'integrations', 'docs', 'package.json', 'package-lock.json', 'README.md', 'LICENSE']) {
    await cp(path.join(repo, item), path.join(source, item), { recursive: true,
      filter: file => !file.split(path.sep).some(part => ['node_modules', '.build', '__pycache__'].includes(part)) });
  }
  const cliBytes = await readFile(path.join(repo, 'dist/cli.js'));
  evidence.provenance = { node: process.version, platform: process.platform + '/' + process.arch,
    distCliSha256: sha(cliBytes), skillTemplateSha256: sha(await readFile(path.join(repo, 'skills/jumpybrain-memory/SKILL.md'))),
    sourceMethod: 'Allowlisted copy of current local source; --skip-build reuses supplied fresh dist; no shared build',
    defaultAccountOnly: true, permissionBypass: false };
  const installed = await run('isolated actual installer', process.execPath, [path.join(source, 'scripts/public-install.mjs'),
    '--source', source, '--scope', 'project', '--cwd', workspace, '--home', home,
    '--install-root', installRoot, '--memory-root', root, '--integrations', 'all', '--skip-build', '--skip-qmd-install'], { ...sharedEnv, HOME: home });
  evidence.install = installed;
  assert.equal(installed.code, 0, installed.stderr + installed.stdout);
  assert.equal(sha(await readFile(path.join(installRoot, 'app/dist/cli.js'))), sha(cliBytes));
  const skill = await readFile(path.join(workspace, '.claude/skills/jumpybrain-memory/SKILL.md'), 'utf8');
  assert.ok(skill.includes(cli) && skill.includes(root));
  assert.doesNotMatch(skill, /__JUMPYBRAIN_/);
  evidence.generatedSkill = skill;
  evidence.provenance.generatedSkillSha256 = sha(skill);
  const settings = path.join(temporary, 'claude-settings.json');
  const mcp = path.join(temporary, 'empty-mcp.json');
  const commandPrefix = `env HOME=${quote(home)} ${quote(cli)}`;
  await writeFile(settings, JSON.stringify({ disableAllHooks: true, autoMemoryEnabled: false,
    permissions: { allow: [`Read(${temporary}/**)`, 'Skill(jumpybrain-memory)', `Bash(${commandPrefix} *)`, 'Bash(printf *)'],
      deny: [`Read(${realHome}/**)`, `Edit(${realHome}/**)`, `Write(${realHome}/**)`] } }));
  await writeFile(mcp, '{"mcpServers":{}}');
  const boundary = `This is an isolated onboarding check. The configured brain is PERSONAL LOCAL, not shared/team/remote. ` +
    `Use only this project's installer-generated jumpybrain-memory skill; its configured CLI and root must stay exclusively inside ${temporary}. ` +
    `Never read, search, write or inspect default/real home memory, real skills/settings, authentication files, Keychain, or anything outside ${temporary}. ` +
    `The host may use the authenticated default account normally, only for authentication. No subagents or web. ` +
    `For every Bash CLI command prefix its configured command with env HOME=${quote(home)} so doctor and child tools see only the disposable home. ` +
    `Do not reinstall, change skills/settings, send feedback, or capture any additional note/summary. Use Read, Skill and narrowly allowed Bash only. ` +
    `If permissions deny an operation, report its exact diagnostic; never bypass them.`;
  // --restricted in Claude 2.1.310 suppresses on-disk project skill discovery.
  // Use project-only settings and explicit tool/file scopes for the activation test.
  const args = ['-p', '--no-session-persistence', '--strict-mcp-config', '--mcp-config', mcp,
    '--setting-sources', 'project', '--settings', settings, '--tools', 'Read,Skill,Bash',
    '--allowedTools', 'Skill(jumpybrain-memory)', `Read(${temporary}/**)`, `Bash(${commandPrefix} *)`, 'Bash(printf *)',
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--output-format', 'stream-json', '--verbose',
    '--append-system-prompt', boundary, '--add-dir', temporary];
  const prompts = [
    'Use the jumpybrain-memory project skill to check my jumpyBrain installation and that local search is ready. Do not save a sample memory. Run doctor with --check --json and bounded recall on the configured brain.',
    'Remember that the community event is on 18 November',
    'When is the community event?',
  ];
  const claudeEnv = { ...sharedEnv, HOME: realHome, DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
  // Preserve normal default-account config resolution. QMD itself isolates
  // HOME/config under the brain, and every model CLI command uses a temporary HOME.
  for (const key of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME']) delete claudeEnv[key];
  // Normal account discovery needs the ordinary login identity environment.
  for (const key of ['USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TERM']) if (process.env[key] !== undefined) claudeEnv[key] = process.env[key];
  const auth = await run('default account authentication status', 'claude', ['auth', 'status'], claudeEnv, 15000);
  let authStatus;
  try { const parsed = JSON.parse(auth.stdout); authStatus = { code: auth.code, loggedIn: parsed.loggedIn, authMethod: parsed.authMethod }; }
  catch { authStatus = { code: auth.code, diagnostic: 'Unparseable auth status (raw output intentionally not retained)' }; }
  evidence.authStatus = authStatus;
  console.log(JSON.stringify(authStatus));
  assert.equal(authStatus.loggedIn, true, 'Default-account auth failed; see sanitized authStatus. No model attempt made.');
  for (let i = 0; i < prompts.length; i++) {
    console.log(`Starting independent Claude invocation ${i + 1}/3`);
    const result = await run(`Claude conversation ${i + 1}`, 'claude', [...args, '--', prompts[i]], claudeEnv);
    const events = result.stdout.trim().split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return { unparsed: line }; } });
    const init = events.find(event => event.type === 'system' && event.subtype === 'init');
    const retainedEvents = events.filter(event => event !== init && event.type !== 'rate_limit_event');
    evidence.conversations.push({ prompt: prompts[i], code: result.code, signal: result.signal, timedOut: result.timedOut,
      stderr: result.stderr, discovery: init ? { cwd: init.cwd, tools: init.tools, skills: init.skills, slash_commands: init.slash_commands,
        model: init.model, mcp_servers: init.mcp_servers, permissionMode: init.permissionMode } : null,
      events: retainedEvents, canonicalAfter: await canonicalFiles() });
    await writeFile(evidencePath, JSON.stringify(clean(evidence), null, 2) + '\n');
    console.log(`Claude invocation ${i + 1}: exit ${result.code}; canonical Markdown files ${(await canonicalFiles()).length}`);
    if (result.timedOut || result.code !== 0) break;
  }
  evidence.checks = summarize(evidence.conversations);
  if (Object.entries(evidence.checks).some(([key, value]) => key !== 'finalAnswer' && value !== true)) process.exitCode = 1;
  console.log(JSON.stringify(clean({ checks: evidence.checks, evidencePath, provenance: evidence.provenance }), null, 2));
} catch (error) {
  evidence.harnessError = String(error.stack || error);
  console.error(clean(evidence.harnessError));
  process.exitCode = 1;
} finally {
  await writeFile(evidencePath, JSON.stringify(clean(evidence), null, 2) + '\n');
  // Explicit output file retains sanitized evidence; all installed runtime and brain data is disposable.
  if (path.resolve(evidencePath).startsWith(temporary + path.sep)) console.log('Evidence retained in disposable tree: ' + evidencePath);
  else await rm(temporary, { recursive: true, force: true });
}
}
