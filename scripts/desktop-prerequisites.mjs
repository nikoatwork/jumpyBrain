import { spawnSync } from 'node:child_process';

// Read-only checks shared by Desktop setup and its preflight-only path.
export function desktopPrerequisites({ platform = process.platform, nodeVersion = process.versions.node, probe = spawnSync } = {}) {
  const missing = [];
  if (platform !== 'darwin') return ['macOS 13 or newer. Desktop setup runs only on macOS.'];
  const [nodeMajor, nodeMinor] = nodeVersion.split('.').map(Number);
  if (!(nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 12))) missing.push(`Node 22.12 or newer (current ${nodeVersion}).`);
  const check = (command, args) => {
    const result = probe(command, args, { encoding: 'utf8', timeout: 10000 });
    return result.error || result.status !== 0 ? null : `${result.stdout || ''}${result.stderr || ''}`.trim();
  };
  const mac = check('sw_vers', ['-productVersion']);
  if (!mac || !(Number(mac.split('.')[0]) >= 13)) missing.push('macOS 13 or newer; check About This Mac.');
  if (check('git', ['--version']) === null) missing.push('Git. Installing Xcode command-line tools provides Git on macOS.');
  if (check('npm', ['--version']) === null) missing.push('npm, included with a standard Node installation.');
  const python = check('python3', ['--version'])?.match(/Python\s+(\d+)\.(\d+)/);
  if (!python || !(Number(python[1]) > 3 || (Number(python[1]) === 3 && Number(python[2]) >= 9))) missing.push('Python 3.9 or newer (python3).');
  if (!check('xcrun', ['--find', 'swiftc'])) missing.push('Xcode command-line tools. Run xcode-select --install and finish Apple’s installer.');
  return missing;
}
