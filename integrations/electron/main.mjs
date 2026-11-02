import { app } from 'electron';
import { openSync, fstatSync, writeFileSync, closeSync, ftruncateSync, constants } from 'node:fs';
import path from 'node:path';
try {
  const { startDesktopApplication } = await import('./application.mjs');
  startDesktopApplication();
} catch {
  // One bounded, content-free breadcrumb even when config/import fails before diagnostics.
  // Use only Electron's existing user-data directory; never create/repair host paths here.
  try {
    const fd = openSync(path.join(app.getPath('userData'), 'startup-failure.json'), constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try {
      const info = fstatSync(fd);
      if (info.isFile() && info.nlink === 1 && info.uid === process.getuid() && !(info.mode & 0o077)) {
        ftruncateSync(fd, 0);
        writeFileSync(fd, JSON.stringify({ at: new Date().toISOString(), code: 'bootstrap_failed' }) + '\n');
      }
    } finally { closeSync(fd); }
  } catch { /* A missing/unsafe diagnostic destination cannot change launch ownership. */ }
  process.stderr.write('jumpyBrain bootstrap failed before host readiness; inspect the private startup breadcrumb and installation.\n');
  app.exit(1);
}
