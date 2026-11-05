#!/usr/bin/env node
// Focused profile over the existing immutable capture/verify implementation.
import {parseArgs} from 'node:util';
import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {runGate,installedDependencyIdentity,filesBelow} from './multiplayer-verify.mjs';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function focusedEnvironment(root) {
  if (process.env.JUMPYBRAIN_EDITOR_ISOLATED_ONLY) throw new Error('The contract profile requires full editor scenarios; unset JUMPYBRAIN_EDITOR_ISOLATED_ONLY.');
  const installedDependencies={root:await installedDependencyIdentity(root)};
  let playwrightPackage;
  try {playwrightPackage=createRequire(path.join(root,'package.json')).resolve('playwright/package.json');} catch {}
  for(const bin of (process.env.PATH??'').split(path.delimiter)) {
    if(playwrightPackage)break;
    const candidate=path.resolve(bin,'..','playwright','package.json');
    try {if(JSON.parse(await readFile(candidate)).name==='playwright')playwrightPackage=candidate;}catch{}
  }
  if(!playwrightPackage)throw new Error('Provision Playwright and invoke through npx --no-install --package=playwright.');
  const toolPackages={};
  for(const entry of [playwrightPackage,createRequire(playwrightPackage).resolve('playwright-core/package.json')]) {
    const directory=path.dirname(await realpath(entry)),pkg=JSON.parse(await readFile(entry));
    const files=await filesBelow(directory,['.']);
    const hashes=await Promise.all(files.sort().map(async file=>[file,digest(await readFile(path.join(directory,file)))]));
    toolPackages[pkg.name]={version:pkg.version,contentHash:digest(JSON.stringify(hashes))};
  }
  // Put dependency identity into a controlled field already compared by runGate.
  toolPackages.lockedRoot={contentHash:digest(JSON.stringify(installedDependencies.root))};
  const browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  let browserVersion;try{browserVersion=browser.version();}finally{await browser.close();}
  return {node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),platform:process.platform,arch:process.arch,osRelease:os.release(),
    installedDependencies,toolPackages,browser:browserVersion,browserChannel:process.env.JUMPYBRAIN_PLAYWRIGHT_CHANNEL??'chrome-fallback',qmd:{version:'deterministic fixtures only'},semanticModelHash:null,
    limits:'No real-model, native platform, public deployment or browser binary authenticity claim. Browser version/channel and installed JS/lock identity are controlled.'};
}
async function main() {
  const {values,positionals}=parseArgs({allowPositionals:true,options:Object.fromEntries(['root','out','baseline','baseline-sha256','delta','delta-sha256'].map(key=>[key,{type:'string'}]))});
  const mode=positionals[0];
  if(positionals.length!==1||!['capture','verify'].includes(mode)||!values.out)throw new Error('Use capture --out DIR or verify --baseline DIR --baseline-sha256 SHA --out DIR; optional --root CHECKOUT.');
  if(mode==='capture'&&(values.baseline||values['baseline-sha256']))throw new Error('Capture does not accept a baseline.');
  process.env.JUMPYBRAIN_CONTRACT_OBSERVATIONS='1';
  const result=await runGate({mode,root:values.root??fileURLToPath(new URL('..',import.meta.url)),out:values.out,baseline:values.baseline,baselineSha256:values['baseline-sha256'],deltaFile:values.delta,deltaSha256:values['delta-sha256'],contractFile:'test/fixtures/architecture-contracts/profile.json',probe:focusedEnvironment});
  console.log(JSON.stringify({status:result.status,error:result.error,manifestSha256:result.manifestSha256,checks:result.checks.map(({id,status,reason})=>({id,status,reason}))},null,2));
  process.exitCode=result.status==='passed'?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
