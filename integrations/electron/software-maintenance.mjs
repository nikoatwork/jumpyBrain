import { spawn } from 'node:child_process';
import path from 'node:path';

// The helper is copied outside ASAR while packaging. Python never writes inside
// sealed resources. This retry neither stops backends nor recovers installer locks.
export async function maintainInstalledSoftware({ resources, home }) {
  return new Promise(resolve => {
    const child = spawn('python3', ['-B', path.join(resources, 'installation-tools/installation-retention.py')], { stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => child.kill(), 120000); timer.unref();
    const done = () => { clearTimeout(timer); resolve(); };
    child.once('error', done); child.once('close', done);
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ operation: 'apply', home, root: path.join(home, '.jumpybrain') }));
  });
}
