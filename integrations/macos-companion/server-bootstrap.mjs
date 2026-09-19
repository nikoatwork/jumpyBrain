// The companion owns this server. If the GUI crashes, don't leave an orphan
// holding the port. Normal quit is SIGTERM and uses the CLI's graceful shutdown.
const parentPID = process.ppid;
if (parentPID <= 1) process.exit(1);
const watchdog = setInterval(() => {
  if (process.ppid !== parentPID) process.kill(process.pid, 'SIGTERM');
}, 1000);
watchdog.unref();
await import('./runtime/dist/cli.js');
