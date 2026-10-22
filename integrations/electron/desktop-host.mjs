// Electron owns this child; the child owns only its gateway and local engine.
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readControlKey, probeCompanion } from './host.mjs';

export async function bundledHost(resources) {
  const config = JSON.parse(await readFile(path.join(resources, 'desktop.json'), 'utf8'));
  if (config.schema !== 1 || !path.isAbsolute(config.supportDirectory || '') || !path.isAbsolute(config.launchAgent || '')
    || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('The app configuration is invalid. Reinstall jumpyBrain.');
  const runtimeRoot = path.join(resources, 'runtime');
  const executable = path.join(resources, 'native/jumpyBrain Host.app/Contents/MacOS/jumpyBrain');
  await access(executable); await access(path.join(runtimeRoot, 'dist/cli.js'));
  return { ...config, runtimeRoot, executable, origin: `http://127.0.0.1:${config.port}` };
}

export function desktopControl({ origin, key }, route, body, { timeoutMs = 22000 } = {}) {
  if (!['state', 'shutdown'].includes(route)) throw new Error('Unsupported desktop control.');
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request(new URL('/companion/' + route, origin), {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + key, ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }) },
    }, (response) => {
      const chunks = []; let size = 0;
      response.on('data', (chunk) => { size += chunk.length; if (size > 131072) response.destroy(new Error('Invalid local service response.')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        let result;
        try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { reject(new Error('Invalid local service response.')); return; }
        if (response.statusCode !== 200) { reject(new Error(result?.error?.message || 'The local service could not complete this action.')); return; }
        resolve(result);
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('The local service did not respond. Resolve pending work in open editor tabs and retry.')), timeoutMs);
    request.once('close', () => clearTimeout(timer));
    request.on('error', () => reject(new Error('The local service is unavailable. Reopen jumpyBrain and retry.')));
    request.end(data);
  });
}

export async function startDesktopHost(config, { spawnHost = spawn, probe = probeCompanion, deadlineMs = 25000, onExit = () => {}, instance = randomUUID() } = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(instance)) throw new Error('Invalid desktop instance.');
  const key = await readControlKey(config.supportDirectory);
  try { await probe(config.origin, key); }
  catch (error) { if (error.code !== 'ECONNREFUSED') throw error; return launch(); }
  throw new Error('Another jumpyBrain service is using this port. Quit the older app before opening jumpyBrain.');

  async function launch() {
    // No inherited credentials, renderer arguments, shell, detached child, or PID adoption.
    const child = spawnHost(config.executable, ['--desktop-host'], {
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8', JUMPYBRAIN_DESKTOP_INSTANCE: instance }, stdio: ['ignore', 'ignore', 'ignore'],
    });
    let exited = false, stopping = null;
    const ended = new Promise((resolve) => {
      const done = () => { if (!exited) { exited = true; resolve(); onExit(); } };
      child.once('exit', done); child.once('error', done);
    });
    const stop = () => stopping ??= (async () => {
      if (exited) return;
      child.kill('SIGTERM');
      const timer = setTimeout(() => { if (!exited) child.kill('SIGKILL'); }, 12000);
      try { await ended; } finally { clearTimeout(timer); }
    })();
    const connection = { ...config, key };
    try {
      const deadline = Date.now() + deadlineMs;
      while (!exited && Date.now() < deadline) {
        try {
          const state = await probe(config.origin, key);
          if (exited) break;
          if (state?.hostInstance !== instance) throw new Error('The local port belongs to another service. Nothing was adopted or restarted.');
          return { connection, stop, isAlive: () => !exited };
        } catch (error) { if (!['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) throw error; }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('The local brain service could not start. Check the app logs or quit any older jumpyBrain app, then retry.');
    } catch (error) { await stop(); throw error; }
  }
}
