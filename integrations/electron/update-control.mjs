// Same-user Unix socket. No gateway route, renderer capability, URL or path input.
import net from 'node:net';
import path from 'node:path';
import { mkdir, lstat, chmod, unlink, realpath } from 'node:fs/promises';
import { regular } from './update-policy.mjs';
const socketPath = home => path.join(home, '.jumpybrain/u.sock');
async function socketInfo(home) {
  const root = path.join(home, '.jumpybrain');
  await regular(root, { directory: true });
  if (await realpath(root) !== root) throw new Error('The managed installation must not be linked.');
  const info = await lstat(socketPath(home));
  if (!info.isSocket() || info.uid !== process.getuid() || info.mode & 0o077) throw new Error('Unsafe desktop update socket. Repair the installation.');
  return info;
}
export async function requestDesktopUpdate(home, action) {
  if (!['status', 'update'].includes(action)) throw new Error('Unsupported desktop update request.');
  try { await socketInfo(home); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath(home));
    socket.setEncoding('utf8');
    let bytes = '';
    socket.setTimeout(60000, () => socket.destroy(new Error('The app did not answer the update request. Retry in the app.')));
    socket.once('connect', () => socket.write(JSON.stringify({ action }) + '\n'));
    socket.on('data', chunk => {
      bytes += chunk;
      if (Buffer.byteLength(bytes) > 128 * 1024) { socket.destroy(new Error('Invalid desktop update response.')); return; }
      if (!bytes.includes('\n')) return;
      try {
        const packet = JSON.parse(bytes.slice(0, bytes.indexOf('\n')));
        if (packet.error) reject(new Error(packet.error)); else resolve(packet.state);
      } catch (error) { reject(error); }
      socket.end();
    });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? resolve(null) : reject(error));
    socket.once('end', () => { if (!bytes.includes('\n')) reject(new Error('The app closed the update request. Retry in the app.')); });
  });
}
export async function serveDesktopUpdates(home, updater) {
  await mkdir(path.join(home, '.jumpybrain'), { recursive: true });
  const previous = await socketInfo(home).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (previous) {
    if (await requestDesktopUpdate(home, 'status')) throw new Error('Another app owns desktop updates.');
    const current = await socketInfo(home);
    if (current.ino !== previous.ino || current.dev !== previous.dev) throw new Error('The desktop update socket changed.');
    await unlink(socketPath(home));
  }
  const server = net.createServer(socket => {
    socket.setEncoding('utf8');
    let bytes = '', received = false;
    socket.on('error', () => {});
    socket.setTimeout(65000, () => socket.destroy());
    socket.on('data', async chunk => {
      if (received) return;
      bytes += chunk;
      if (Buffer.byteLength(bytes) > 256) { socket.destroy(); return; }
      if (!bytes.includes('\n')) return;
      received = true;
      try {
        const request = JSON.parse(bytes);
        if (Object.keys(request).length !== 1 || !['status', 'update'].includes(request.action)) throw new Error('Unsupported desktop update request.');
        socket.end(JSON.stringify({ state: await updater.action(request.action) }) + '\n');
      } catch (error) { socket.end(JSON.stringify({ error: error.message }) + '\n'); }
    });
  });
  // Bind privately from the first instant, before the asynchronous chmod.
  const previousMask = process.umask(0o077);
  let listening;
  try { listening = new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath(home), resolve); }); }
  finally { process.umask(previousMask); }
  await listening;
  await chmod(socketPath(home), 0o600);
  return () => new Promise(resolve => server.close(resolve));
}
