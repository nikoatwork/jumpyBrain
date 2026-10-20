import path from 'node:path';
import { lstat, readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const label = 'local.jumpybrain.desktop';
const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function loginPlist(executable) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(executable)}</string><string>--background</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>ProcessType</key><string>Interactive</string><key>LimitLoadToSessionType</key><string>Aqua</string></dict></plist>\n`;
}
export async function loginEnabled(file, executable) {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid()) throw new Error('The login item is not owned by this app.');
    const data = await readFile(file, 'utf8');
    if (data !== loginPlist(executable)) throw new Error('The login item has changed. Run desktop setup to repair it.');
    return true;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function setLoginEnabled(file, executable, enabled) {
  const current = await loginEnabled(file, executable);
  if (current === enabled) return;
  if (!enabled) { await unlink(file); return; } // Affects next login; never boot out the running app.
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), '.jumpybrain-login-' + randomUUID());
  try {
    await writeFile(temporary, loginPlist(executable), { flag: 'wx', mode: 0o600 });
    if (await loginEnabled(file, executable)) return;
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}
