import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, chmod, symlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from '../dist/cli/args.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
const execute = promisify(execFile);
const repo = path.resolve('.');
const key = 'c'.repeat(64);
async function cli(args, env = {}) {
  return execute(process.execPath, [path.join(repo, 'dist/cli.js'), 'extensions', ...args], { env: { ...process.env, JUMPYBRAIN_API_KEY: '', ...env }, maxBuffer: 1024 * 1024 });
}
async function fixture(t) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-extensions-cli-')));
  const gateways = [];
  t.after(async () => { for (const gateway of gateways) await gateway.close(); await rm(temporary, { recursive: true, force: true }); });
  const support = path.join(temporary, 'support'), directory = path.join(support, 'extensions'), source = path.join(temporary, 'package');
  await mkdir(support, { mode: 0o700 }); await mkdir(source);
  const executed = path.join(temporary, 'factory-executed');
  await writeFile(path.join(source, 'jumpybrain-extension.json'), JSON.stringify({ apiVersion: 1, id: 'cli-fixture', name: 'CLI fixture', version: '1.0.0', main: 'main.ts' }));
  await writeFile(path.join(source, 'main.ts'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(executed + '.module')}, 'imported');\nexport default function(api) { writeFileSync(${JSON.stringify(executed)}, 'activated'); api.registerCommand({id:'hello',title:'Hello',handler(){return {message:'hello'}}}); }`);
  return { temporary, support, directory, source, executed, gateways };
}

test('extension parsing is strict before remote policy, credentials and filesystem access', async () => {
  for (const argv of [
    ['extensions', 'list', '--target-url'], ['extensions', 'install', '--remote-url='],
    ['extensions', 'enable', '--id', 'x', '--target-url', 'https://example.com', '--directory', '/no/access'],
  ]) assert.throws(() => parseArgs(argv), /desktop-local/);
  for (const argv of [
    ['extensions', 'typo'], ['extensions', 'list', '--json=true'], ['extensions', 'list', '--directory'],
    ['extensions', 'list', '--json', '--json'], ['extensions', 'list', '--source', 'x'],
    ['extensions', 'install', '--source=x', '--source=y'], ['extensions', 'remove'],
    ['extensions', 'enable', '--id', 'x', 'unexpected'], ['extensions', 'list', '--root', '/brain'],
  ]) assert.throws(() => parseArgs(argv));
  assert.equal(parseArgs(['extensions', 'install', '--source=/local/package', '--directory=/host/extensions']).source, '/local/package');
  const help = await cli(['enable', '--help']); assert.match(help.stdout, /extensions install --source/);
  await assert.rejects(cli(['list', '--target-url'], { JUMPYBRAIN_CLI_CONFIG: '/no/access', JUMPYBRAIN_API_KEY: '' }), error => /desktop-local/.test(error.stderr) && !/API key|cli-config/.test(error.stderr));
});

test('offline install/list/disable/reload/remove share package management without executing a factory; removal preserves state', async t => {
  const f = await fixture(t);
  const run = (...args) => cli([...args, '--directory', f.directory, '--json']);
  const installed = JSON.parse((await run('install', '--source', f.source)).stdout);
  assert.equal(installed.manifest.id, 'cli-fixture');
  await assert.rejects(access(f.executed)); await assert.rejects(access(f.executed + '.module'));
  assert.equal(JSON.parse((await run('list')).stdout)[0].enabled, true);
  await run('disable', '--id', 'cli-fixture');
  assert.equal(JSON.parse((await run('list')).stdout)[0].enabled, false);
  await run('reload'); await assert.rejects(access(f.executed)); await assert.rejects(access(f.executed + '.module'));
  await mkdir(path.join(f.directory, 'state')); await writeFile(path.join(f.directory, 'state/cli-fixture.json'), '{"retained":true}');
  assert.deepEqual(JSON.parse((await run('remove', '--id', 'cli-fixture')).stdout), { ok: true });
  assert.deepEqual(JSON.parse(await readFile(path.join(f.directory, 'state/cli-fixture.json'), 'utf8')), { retained: true });
  assert.deepEqual(JSON.parse((await run('list')).stdout), []);
});

test('live CLI management targets the exact companion support directory and native key, with explicit current generation', async t => {
  const f = await fixture(t);
  await cli(['install', '--source', f.source, '--directory', f.directory, '--json']);
  await writeFile(path.join(f.support, 'api-key'), key, { mode: 0o600 });
  const gateway = await startCompanionGateway({ runtimeRoot: repo, directory: f.support, port: 0, controlKey: key, credentials: { get: async () => null } });
  f.gateways.push(gateway);
  const run = (...args) => cli([...args, '--directory', f.directory, '--json']);
  const active = JSON.parse((await run('list')).stdout);
  assert.equal(active.extensions[0].status, 'active');
  assert.equal(await readFile(f.executed, 'utf8'), 'activated');
  const oldRevision = active.revision;
  const disabled = JSON.parse((await run('disable', '--id', 'cli-fixture')).stdout);
  assert.equal(disabled.extensions[0].enabled, false); assert.notEqual(disabled.revision, oldRevision);
  await writeFile(path.join(f.support, 'api-key'), 'd'.repeat(64), { mode: 0o600 });
  await assert.rejects(run('enable', '--id', 'cli-fixture'), error => /401/.test(error.stderr));
  assert.equal(gateway.state().extensions.revision, disabled.revision);
  await writeFile(path.join(f.support, 'api-key'), key, { mode: 0o600 });
  await chmod(path.join(f.support, 'api-key'), 0o644);
  await assert.rejects(run('reload'), error => /Unsafe companion control/.test(error.stderr));
  await chmod(path.join(f.support, 'api-key'), 0o600);
  await rm(path.join(f.support, 'api-key')); await symlink(path.join(f.source, 'main.ts'), path.join(f.support, 'api-key'));
  await assert.rejects(run('reload'));
  assert.equal(gateway.state().extensions.revision, disabled.revision);
});

test('safe mode prepares/manages broken packages without executing top-level or factory code', async t => {
  const f = await fixture(t);
  await mkdir(f.directory); await writeFile(path.join(f.directory, 'disabled'), '');
  await writeFile(path.join(f.source, 'main.ts'), `throw new Error('broken top level'); export default function() { throw new Error('broken factory'); }`);
  await cli(['install', '--source', f.source, '--directory', f.directory, '--json']);
  const gateway = await startCompanionGateway({ runtimeRoot: repo, directory: f.support, port: 0, controlKey: key, credentials: { get: async () => null } });
  f.gateways.push(gateway);
  assert.equal(gateway.state().extensions.safeMode, true);
  await writeFile(path.join(f.support, 'api-key'), key, { mode: 0o600 });
  const result = JSON.parse((await cli(['disable', '--id', 'cli-fixture', '--directory', f.directory, '--json'])).stdout);
  assert.equal(result.safeMode, true); assert.equal(result.extensions[0].enabled, false);
});

test('explicit local check reports bounded locations and reasons, executes no code and ignores live host descriptors', async t => {
  const f = await fixture(t);
  // A broken live-host pointer must not prevent independent local author checks.
  await writeFile(path.join(f.support, 'extensions-control.json'), 'broken');
  const run = (...args) => cli(['check', '--source', f.source, '--directory', f.directory, ...args]);
  await run(); await assert.rejects(access(f.executed + '.module'));
  for (const source of ['const secret = "PRIVATE_SOURCE_MARKER";\nexport default () => { const broken = ; };', 'import missing from "missing-local-dependency";\nexport default () => missing();']) {
    await writeFile(path.join(f.source, 'main.ts'), source);
    await assert.rejects(run('--json'), error => {
      const result = JSON.parse(error.stdout);
      assert.equal(result.ok, false); assert.ok(result.diagnostics.length > 0 && result.diagnostics.length <= 5);
      assert.equal(result.diagnostics[0].file, 'main.ts'); assert.ok(result.diagnostics[0].line >= 1);
      assert.match(result.diagnostics[0].reason, /Unexpected|Could not resolve/);
      assert.equal(error.stdout.includes('PRIVATE_SOURCE_MARKER'), false); return true;
    });
    await assert.rejects(run(), error => /main.ts:\d+:\d+:/.test(error.stderr));
  }
  await assert.rejects(access(f.executed)); await assert.rejects(access(path.join(f.directory, 'registry.json')));
});

test('readiness probes suppress factory/state migration, including repeated probes and a damaged registry', async t => {
  const f = await fixture(t);
  await cli(['install', '--source', f.source, '--directory', f.directory]);
  for (let i = 0; i < 2; i++) {
    const gateway = await startCompanionGateway({runtimeRoot:repo, directory:f.support, port:0, controlKey:key, readinessOnly:true, credentials:{get:async()=>null}});
    assert.equal(gateway.state().extensions.safeMode, true); await gateway.close();
    await assert.rejects(access(f.executed)); await assert.rejects(access(f.executed + '.module'));
    await assert.rejects(access(path.join(f.directory, 'disabled')));
  }
  const actual = await startCompanionGateway({runtimeRoot:repo,directory:f.support,port:0,controlKey:key,credentials:{get:async()=>null}});
  assert.equal(await readFile(f.executed, 'utf8'), 'activated'); await actual.close();
  for (const file of ['registry.json','registry.backup.json']) await writeFile(path.join(f.directory,file),'damaged');
  await writeFile(path.join(f.directory,'disabled'),'');
  const safe = await startCompanionGateway({runtimeRoot:repo,directory:f.support,port:0,controlKey:key,credentials:{get:async()=>null}});
  const response = await fetch(safe.url + '/'); assert.equal(response.status,200); assert.match(await response.text(), /note-editor/);
  await safe.close();
  for (const file of ['registry.json','registry.backup.json']) assert.equal(await readFile(path.join(f.directory,file),'utf8'),'damaged');
});

test('current CLI manages an older desktop with the frozen v1 envelope and ignores additive snapshot fields', async t => {
  const { createServer } = await import('node:http');
  const { createExtensionGateway } = await import('../scripts/fixtures/extensions-management-v1/extensions-gateway.mjs');
  const { SwitchCoordinator } = await import('../scripts/fixtures/extensions-management-v1/switch-coordinator.mjs');
  const f = await fixture(t), coordinator = new SwitchCoordinator();
  let recovery, enabled = true;
  const snapshot = () => ({apiVersion:1,revision:'historical',safeMode:false,extensions:[{id:'fixture',enabled}], ...(recovery ? {recovery} : {})});
  const host = {snapshot,reload:async()=>snapshot(),setEnabled:async (_id,value)=>{enabled=value;return snapshot();}};
  const json = (res,status,packet) => {res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(packet));};
  const adapter = createExtensionGateway({host,coordinator,active:()=>({id:'brain'}),json,
    jsonBody:async req => {let body='';for await(const chunk of req)body+=chunk;return JSON.parse(body);}});
  const server = createServer(async (req,res) => {
    try {
      assert.equal(req.headers.authorization,'Bearer '+key);
      const url = new URL(req.url,'http://localhost');
      if(url.pathname==='/companion/state') json(res,200,{generation:coordinator.generation});
      else assert.equal(await adapter.handle(req,res,url,{native:true}),true);
    } catch(error) {json(res,400,{error:{message:error.message}});}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await writeFile(path.join(f.support,'api-key'),key,{mode:0o600});
  await writeFile(path.join(f.support,'extensions-control.json'),JSON.stringify({version:1,directory:f.support,origin:`http://127.0.0.1:${server.address().port}`,pid:process.pid}),{mode:0o600});
  const run = (...args) => cli([...args,'--directory',f.directory,'--json']);
  assert.equal(JSON.parse((await run('reload')).stdout).apiVersion,1);
  assert.equal(JSON.parse((await run('disable','--id','fixture')).stdout).extensions[0].enabled,false);
  recovery='Optional newer-host recovery detail';
  assert.equal(JSON.parse((await run('list')).stdout).recovery,recovery);
});
