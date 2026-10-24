import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createQuitFlow } from '../integrations/electron/lifecycle.mjs';
import { startDesktopHost } from '../integrations/electron/desktop-host.mjs';
import { loginEnabled, loginPlist, setLoginEnabled } from '../integrations/electron/login.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-desktop-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const supportDirectory = path.join(root, 'support'); await mkdir(supportDirectory, { mode: 0o700 });
  await writeFile(path.join(supportDirectory, 'api-key'), 'a'.repeat(64), { mode: 0o600 });
  return { root, supportDirectory, executable: '/fixture/host', origin: 'http://127.0.0.1:3787' };
}

test('quit waits for all-tab saves and window close before stopping only the owned host', async () => {
  const events = [];
  const quit = createQuitFlow({ getHost: () => ({ isAlive: () => true, connection: {}, stop: async () => events.push('stop') }),
    control: async (_c, _r, body) => { events.push(body.action); return { id: 'lease' }; },
    closeWindows: async () => { events.push('close'); return true; }, flush: async () => events.push('flush'),
    exit: () => events.push('exit'), cancelClose: () => assert.fail(), showError: () => assert.fail() });
  await Promise.all([quit(), quit()]);
  assert.deepEqual(events, ['prepare', 'close', 'flush', 'commit', 'stop', 'exit']);
});

test('failed saves and unload veto keep the service running and release the shutdown freeze', async () => {
  for (const failure of ['save', 'close']) {
    const events = [];
    const quit = createQuitFlow({ getHost: () => ({ isAlive: () => true, connection: {}, stop: () => assert.fail() }),
      control: async (_c, _r, body) => { events.push(body.action); if (failure === 'save') throw new Error('unsaved'); return { id: 'lease' }; },
      closeWindows: async () => false, flush: () => assert.fail(), exit: () => assert.fail(),
      cancelClose: () => events.push('resume'), showError: async () => events.push('error') });
    await quit();
    assert.deepEqual(events, failure === 'save' ? ['prepare', 'resume', 'error'] : ['prepare', 'cancel', 'resume']);
  }
});

test('host refuses occupied services and authenticates its specific child before readiness', async (t) => {
  const config = await fixture(t);
  await assert.rejects(startDesktopHost(config, { probe: async () => ({}), spawnHost: () => assert.fail() }), /Another/);
  let calls = 0, instance, killed = 0;
  const child = new EventEmitter(); child.kill = () => { killed++; child.emit('exit', 0); };
  const host = await startDesktopHost(config, {
    spawnHost: (file, args, options) => {
      assert.equal(file, config.executable); assert.deepEqual(args, ['--desktop-host']);
      assert.equal(options.env.JUMPYBRAIN_SERVER_API_KEYS, undefined);
      instance = options.env.JUMPYBRAIN_DESKTOP_INSTANCE; return child;
    },
    probe: async () => { if (!calls++) throw Object.assign(new Error(), { code: 'ECONNREFUSED' }); return { hostInstance: instance }; },
  });
  assert.equal(host.isAlive(), true); await host.stop(); await host.stop();
  assert.equal(killed, 1); assert.equal(host.isAlive(), false);
});

test('host stops its failed child without adopting a racing foreign gateway', async (t) => {
  const config = await fixture(t);
  let calls = 0, killed = 0;
  const child = new EventEmitter(); child.kill = () => { killed++; child.emit('exit', 0); };
  await assert.rejects(startDesktopHost(config, { spawnHost: () => child,
    probe: async () => { if (!calls++) throw Object.assign(new Error(), { code: 'ECONNREFUSED' }); return { hostInstance: 'foreign' }; },
  }), /another service/);
  assert.equal(killed, 1);
});

test('login preference uses the one app in background mode and refuses foreign entries', async (t) => {
  const { root } = await fixture(t);
  const file = path.join(root, 'LaunchAgents/desktop.plist'), executable = '/Applications/Brain & Notes.app/Contents/MacOS/jumpyBrain';
  assert.equal(await loginEnabled(file, executable), false);
  await setLoginEnabled(file, executable, true);
  assert.equal(await readFile(file, 'utf8'), loginPlist(executable));
  assert.equal(await loginEnabled(file, executable), true);
  assert.match(await readFile(file, 'utf8'), /Brain &amp; Notes/);
  await setLoginEnabled(file, executable, false);
  assert.equal(await loginEnabled(file, executable), false);
  await writeFile(file, '<plist>foreign</plist>');
  await assert.rejects(setLoginEnabled(file, executable, true), /changed/);
});

test('bundled runtime moves with the app and needs no separately installed companion', async (t) => {
  const { bundledHost } = await import('../integrations/electron/desktop-host.mjs');
  const { root, supportDirectory } = await fixture(t);
  const resources = path.join(root, 'Moved App.app/Contents/Resources');
  await mkdir(path.join(resources, 'runtime/dist'), { recursive: true });
  await mkdir(path.join(resources, 'native/jumpyBrain Host.app/Contents/MacOS'), { recursive: true });
  await writeFile(path.join(resources, 'runtime/dist/cli.js'), '');
  await writeFile(path.join(resources, 'native/jumpyBrain Host.app/Contents/MacOS/jumpyBrain'), '');
  const config = { schema: 1, supportDirectory, port: 3787, launchAgent: path.join(root, 'login.plist') };
  await writeFile(path.join(resources, 'desktop.json'), JSON.stringify(config));
  const host = await bundledHost(resources);
  assert.equal(host.runtimeRoot, path.join(resources, 'runtime'));
  assert.equal(host.origin, 'http://127.0.0.1:3787');
  await writeFile(path.join(resources, 'desktop.json'), JSON.stringify({ ...config, port: 80 }));
  await assert.rejects(bundledHost(resources), /invalid/);
});


test('desktop installation migration and rollback regressions', { skip: process.platform !== 'darwin' }, async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { stderr } = await promisify(execFile)('python3', ['-B', 'integrations/electron/test_desktop_install.py']);
  assert.match(stderr, /OK/);
});

test('readiness-only native launches carry an explicit internal flag; ordinary launches omit it', async t => {
  for (const readinessOnly of [false, true]) {
    const config = await fixture(t); let calls = 0, instance;
    const child = new EventEmitter(); child.kill = () => child.emit('exit', 0);
    const host = await startDesktopHost(config, { readinessOnly,
      spawnHost: (_file, _args, options) => { instance = options.env.JUMPYBRAIN_DESKTOP_INSTANCE; assert.equal(options.env.JUMPYBRAIN_READINESS_ONLY, readinessOnly ? '1' : undefined); return child; },
      probe: async () => { if (!calls++) throw Object.assign(new Error(), {code:'ECONNREFUSED'}); return {hostInstance:instance}; },
    });
    await host.stop();
  }
});
