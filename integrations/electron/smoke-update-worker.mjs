// Test-only launcher. Keep native error alerts off the developer's desktop.
import { pathToFileURL } from 'node:url';
const [entry, directory, recovery] = process.argv.slice(2);
const { runWorker } = await import(pathToFileURL(entry));
await runWorker(directory, { recovering: recovery === '--recover', notifyFailure: async () => {} });
