// Release-only native assets stay outside the standalone CLI tarball.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
if (process.platform !== 'darwin') throw new Error('Native release helpers require a Mac build host with Xcode command-line tools.');
for (const [command,args] of [['/usr/bin/xcrun',['--find','swiftc']],['python3',['--version']]]) {
  const result = spawnSync(command,args,{stdio:'inherit'});
  if (result.status !== 0) throw new Error('Native release build prerequisites are unavailable.');
}
if (process.argv.includes('--check')) process.exit(0);
const { version } = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));
const output = path.join(repo, '.local-pack/native-helpers', version); await mkdir(output, { recursive: true });
const script = `
import base64,json,os,shutil,sys,tempfile
from pathlib import Path
repo=Path(sys.argv[1]); output=Path(sys.argv[2]); version=sys.argv[3]
sys.path.insert(0,str(repo/'integrations/macos-companion'))
import install
node=shutil.which('node'); qmd=os.environ.get('JUMPYBRAIN_QMD_BIN') or shutil.which('qmd')
if not node or not qmd: raise RuntimeError('Provision Node and supported QMD before building release helpers.')
for arch,node_arch in [('arm64','arm64'),('x86_64','x64')]:
    with tempfile.TemporaryDirectory(prefix='jumpybrain-native-release-') as folder:
        scratch=Path(folder)
        app=install.build_app(repo,scratch,dict(node=node,qmd=qmd,runtimeRoot=str(repo),supportDirectory=str(scratch/'support')),reuse_artifact=True,architecture=arch)
        record=json.loads((app/'Contents/Resources/NativeBuild.json').read_text())
        code=scratch/'unsigned-helper';shutil.copy2(app/'Contents/MacOS/jumpyBrain',code)
        install.run('codesign','--remove-signature',code)
        install.run('/usr/bin/lipo',code,'-verify_arch',arch)
        digest=install.file_digest(code)
        if digest!=record['executableDigest']: raise RuntimeError('Native code changed during release signing normalization.')
        artifact=dict(schemaVersion=1,version=version,architecture=arch,artifactFingerprint=record['artifactFingerprint'],executableDigest=digest,executableBase64=base64.b64encode(code.read_bytes()).decode())
        target=output/f'jumpybrain-native-{version}-darwin-{node_arch}.json'
        target.write_text(json.dumps(artifact,separators=(',',':'))+'\\n')
        print('Native release helper: '+str(target),flush=True)
`;
const built = spawnSync('python3', ['-B','-c', script, repo, output, version], { cwd: repo, stdio: 'inherit' });
if (built.status !== 0) throw new Error('Native release asset build failed; nothing was published.');
const artifacts = ['arm64','x64'].map(arch => path.join(output, `jumpybrain-native-${version}-darwin-${arch}.json`));
await writeFile(path.join(repo, '.local-pack/native-helpers.json'), JSON.stringify({ version, artifacts }, null, 2) + '\n');
