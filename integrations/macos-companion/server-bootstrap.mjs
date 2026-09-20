import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The first argument is the exact installed runtime root, never a bundle snapshot.
const runtimeRoot = process.argv[2];
if (!runtimeRoot || !path.isAbsolute(runtimeRoot)) {
  throw new Error('Companion requires an absolute installed runtime root');
}
const cli = path.join(runtimeRoot, 'dist', 'cli.js');
// Present the CLI with its normal argv shape after consuming our private argument.
process.argv.splice(1, 2, cli);

// The companion owns this server. If the GUI crashes, don't leave an orphan
// holding the port. Normal quit is SIGTERM and uses the CLI's graceful shutdown.
const parentPID = process.ppid;
if (parentPID <= 1) process.exit(1);
const watchdog = setInterval(() => {
  if (process.ppid !== parentPID) process.kill(process.pid, 'SIGTERM');
}, 1000);
watchdog.unref();
await import(pathToFileURL(cli).href);
