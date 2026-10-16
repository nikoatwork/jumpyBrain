// Main-process only. Reuse the installed runtime's safe schema/store; no renderer
// preload, filesystem bridge, telemetry, or raw Chromium exception capture.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';

export async function startElectronDiagnostics(config, { directory, version = '0.1.0' }) {
  const module = (file) => import(pathToFileURL(path.join(config.runtimeRoot, 'dist/adapters/diagnostics', file)).href);
  const { createDiagnosticStore } = await module('store.js');
  const { readDiagnosticBuildInfo } = await module('build-info.js');
  const runtime = readDiagnosticBuildInfo();
  const store = createDiagnosticStore({ directory: path.join(directory, 'diagnostics'), component: 'electron', metadata: { version, runtimeVersion: runtime.version, build: runtime.build } });
  let credentials = null, pending = false, again = false, timer;
  async function publish() {
    if (!credentials || pending) { again = true; return; }
    pending = true; again = false;
    try {
      const snapshot = await store.snapshot();
      const body = JSON.stringify({ events: snapshot.events.slice(-64) });
      if (Buffer.byteLength(body) > 32768) return;
      await new Promise((resolve) => {
        const request = http.request(new URL('/companion/diagnostics', config.origin), { method: 'POST',
          headers: { Authorization: 'Bearer ' + credentials.key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (response) => { response.resume(); response.once('end', resolve); response.once('error', resolve); });
        request.on('error', resolve); request.setTimeout(1500, () => request.destroy()); request.end(body);
      });
    } catch { /* Local persistence remains available on the next successful connection. */ }
    finally { pending = false; if (again) schedule(); }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => { void publish(); }, 200); timer.unref?.(); }
  const record = (event) => { store.record(event); if (credentials) schedule(); };
  record({ operation: 'startup', severity: 'info', outcome: 'ok', code: 'none' });
  return {
    store, record, runtime,
    connect(connection) { credentials = connection; schedule(); },
    async flush() { clearTimeout(timer); await store.flush(); await publish(); },
    async checkRenderer(contents) {
      try {
        const info = await contents.executeJavaScript('typeof JumpyBrainBrowser !== "undefined" && typeof JumpyBrainBrowser.diagnosticBuildInfo === "function" ? JumpyBrainBrowser.diagnosticBuildInfo() : null');
        if (!info || info.version !== runtime.version || info.build !== runtime.build) record({ operation: 'renderer', severity: 'warn', outcome: 'failed', code: 'version_mismatch' });
      } catch { record({ operation: 'renderer', severity: 'warn', outcome: 'failed', code: 'load_failed' }); }
    },
  };
}
