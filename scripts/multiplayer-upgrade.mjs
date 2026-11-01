#!/usr/bin/env node
// Coordinated upgrade evidence/recovery, deliberately separate from installers.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, open, readdir, readFile, realpath, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = `Usage: node scripts/multiplayer-upgrade.mjs --root ROOT [--mode status|prepare|verify|restore] [--backup PRIVATE_DIRECTORY] [--apply] [--cli-runtime DIRECTORY] [--app-runtime DIRECTORY]
status is observational. prepare defaults to dry-run; --apply stops the authenticated owner and creates a private backup. verify compares every canonical and operational file with that backup. restore defaults to dry-run; --apply restores only missing files and refuses to overwrite changed files. Software installation remains jumpybrain update (or the documented source/VPS deployment procedure).`;
const options = { root: {type:'string'}, mode: {type:'string',default:'status'}, backup: {type:'string'}, apply: {type:'boolean',default:false}, 'cli-runtime': {type:'string'}, 'app-runtime': {type:'string'}, help: {type:'boolean',default:false} };
const digest = value => createHash('sha256').update(value).digest('hex');
const absent = error => error?.code === 'ENOENT';
const within = (child,parent) => child === parent || child.startsWith(parent + path.sep);
async function hash(file) { const value=createHash('sha256'); for await(const chunk of createReadStream(file))value.update(chunk); return value.digest('hex'); }
async function inventory(root) {
  const files=[];
  async function walk(directory,relative='',kind='canonical') {
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      if(!relative && ['.git','node_modules','.jumpybrain'].includes(entry.name))continue;
      const name=path.posix.join(relative,entry.name), file=path.join(directory,entry.name), stat=await lstat(file);
      if(stat.isSymbolicLink() || (!stat.isDirectory()&&!stat.isFile()))throw new Error('Unsupported linked or special brain entry; inspect before upgrading.');
      if(stat.isDirectory())await walk(file,name,kind);
      else {
        if(kind==='operational'&&(stat.mode&0o077))throw new Error('Operational recovery state must have private permissions.');
        files.push({path:name,kind,size:stat.size,sha256:await hash(file),mode:stat.mode&0o777});
      }
    }
  }
  await walk(root);
  try { const support=await lstat(path.join(root,'.jumpybrain'));if(support.isSymbolicLink()||!support.isDirectory())throw new Error('Operational state directory must be unlinked.'); }catch(error){if(!absent(error))throw error;}
  for(const relative of ['.jumpybrain/access.json','.jumpybrain/recovery']) {
    const file=path.join(root,relative);
    let stat;try{stat=await lstat(file);}catch(error){if(absent(error))continue;throw error;}
    if(stat.isSymbolicLink())throw new Error('Operational state must not be linked.');
    if(stat.isDirectory())await walk(file,relative,'operational');
    else if(stat.isFile()&&!(stat.mode&0o077))files.push({path:relative,kind:'operational',size:stat.size,sha256:await hash(file),mode:stat.mode&0o777});
    else throw new Error('Operational state must be a private regular file.');
  }
  return files.sort((a,b)=>a.path.localeCompare(b.path));
}
async function buildInfo(directory) {
  const root=await realpath(directory), info=JSON.parse(await readFile(path.join(root,'dist/adapters/diagnostics/build-info.json'),'utf8'));
  if(typeof info.build!=='string'||typeof info.version!=='string')throw new Error('Runtime build metadata is missing.');
  return {version:info.version,build:info.build};
}
function compare(before,after) {
  const expected=new Map(before.map(item=>[item.path,item.sha256])), current=new Map(after.map(item=>[item.path,item.sha256]));
  return [...new Set([...expected.keys(),...current.keys()])].filter(name=>expected.get(name)!==current.get(name)).sort();
}
async function loadBackup(directory,root) {
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw new Error('Backup directory must be private and unlinked.');
  const manifestFile=path.join(directory,'manifest.json'), manifestStat=await lstat(manifestFile);
  if(!manifestStat.isFile()||manifestStat.isSymbolicLink()||manifestStat.size>16*1024*1024)throw new Error('Invalid backup manifest.');
  const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
  if(manifest.version!==1||manifest.complete!==true||manifest.rootId!==digest(root)||!Array.isArray(manifest.files))throw new Error('Backup is incomplete or belongs to another root.');
  const names=new Set();
  for(const item of manifest.files) {
    if(typeof item.path!=='string'||item.path.includes('\\')||item.path.startsWith('/')||item.path.split('/').some(part=>!part||part==='.'||part==='..')||names.has(item.path)||!/^[a-f0-9]{64}$/.test(item.sha256)||!['canonical','operational'].includes(item.kind)||!Number.isInteger(item.mode)||item.mode<0||item.mode>0o777)throw new Error('Invalid backup file manifest.');
    if(item.kind==='operational'&&item.path!=='.jumpybrain/access.json'&&!item.path.startsWith('.jumpybrain/recovery/'))throw new Error('Unsupported operational restore path.');
    if(item.kind==='canonical'&&['.jumpybrain','.git','node_modules'].includes(item.path.split('/')[0]))throw new Error('Invalid canonical restore path.');
    names.add(item.path);
    const file=path.join(directory,'files',item.path), stat=await lstat(file);
    // Reject linked parent directories too; never follow a backup out of its tree.
    let parent=path.dirname(file);while(parent!==directory){const parentStat=await lstat(parent);if(parentStat.isSymbolicLink()||!parentStat.isDirectory())throw new Error('Unsafe backup path.');parent=path.dirname(parent);}
    if(!stat.isFile()||stat.isSymbolicLink()||await hash(file)!==item.sha256)throw new Error('Backup file verification failed.');
  }
  return manifest;
}
async function main() {
  const {values}=parseArgs({options,strict:true,allowPositionals:false});
  if(values.help){console.log(usage);return;}
  if(!values.root||!['status','prepare','verify','restore'].includes(values.mode)||values.apply&&!['prepare','restore'].includes(values.mode))throw new Error(usage);
  const root=await realpath(values.root), stat=await lstat(root);if(!stat.isDirectory())throw new Error('A brain directory is required.');
  const {backendStatus,stopRootBackend}=await import(pathToFileURL(path.join(runtime,'dist/app/backend-host/index.js')).href);
  const cli=await buildInfo(values['cli-runtime']??runtime), app=values['app-runtime']?await buildInfo(values['app-runtime']):undefined;
  const matching=!app||cli.version===app.version&&cli.build===app.build;
  const status=await backendStatus(root), builds={cli,...(app?{app}:{}),matching,appChecked:!!app};
  if(values.mode==='status') {console.log(JSON.stringify({mode:'status',owner:status.status,builds,actions:matching?['Save pending browser drafts; pause agents and external editors before prepare.']:['Update app and CLI to the same release/build before resuming.']}));return;}
  if(!values.backup)throw new Error('--backup is required for prepare, verify and restore.');
  const backup=path.resolve(values.backup), parent=await realpath(path.dirname(backup));
  if(within(path.join(parent,path.basename(backup)),root)||within(root,path.join(parent,path.basename(backup))))throw new Error('Choose a backup directory outside the brain and its parents.');
  if(values.mode==='prepare') {
    if(!values.apply){const files=await inventory(root);console.log(JSON.stringify({mode:'prepare',dryRun:true,owner:status.status,builds,files:files.length,operationalFiles:files.filter(item=>item.kind==='operational').length,actions:['Pause app clients, agents and direct file writers.','Create private verified backup; stop only authenticated root owner.','Apply one release to app, CLI, server and integrations; then run verify.']}));return;}
    await mkdir(backup,{mode:0o700});
    const stopped=await stopRootBackend(root), files=await inventory(root);
    for(const item of files){const target=path.join(backup,'files',item.path);await mkdir(path.dirname(target),{recursive:true,mode:0o700});await copyFile(path.join(root,item.path),target);await chmod(target,0o600);const copy=await open(target,'r');try{await copy.sync();}finally{await copy.close();}if(await hash(target)!==item.sha256)throw new Error('Brain changed during backup; keep clients paused and retry using a new backup directory.');}
    if(compare(files,await inventory(root)).length||(await backendStatus(root)).status!=='stopped')throw new Error('Brain or owner changed during backup; backup is not marked complete.');
    const manifest={version:1,complete:true,createdAt:new Date().toISOString(),rootId:digest(root),builds,files};
    const handle=await open(path.join(backup,'manifest.json'),'wx',0o600);try{await handle.writeFile(JSON.stringify(manifest,null,2)+'\n');await handle.sync();}finally{await handle.close();}
    console.log(JSON.stringify({mode:'prepare',complete:true,stopped:stopped.stopped,files:files.length,operationalFiles:files.filter(item=>item.kind==='operational').length,actions:['Install coordinated app/CLI/server/integration release.','Run verify against this backup before reopening clients.']}));return;
  }
  const manifest=await loadBackup(backup,root), current=await inventory(root), differences=compare(manifest.files,current);
  if(values.mode==='verify') {
    const result={mode:'verify',ok:!differences.length&&matching,builds,changedFiles:differences.length,actions:!matching?['Update app and CLI to one identical build.']:differences.length?['Inspect changed files before resuming; no files were overwritten.']:['Open/search existing notes; verify simultaneous editing on a disposable copy before resuming.']};
    console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;return;
  }
  if(status.status!=='stopped')throw new Error('Restore requires a stopped authenticated owner.');
  const existing=new Map(current.map(item=>[item.path,item]));
  if(manifest.files.some(item=>existing.has(item.path)&&existing.get(item.path).sha256!==item.sha256))throw new Error('Restore refuses changed files, including changed/revoked access credentials. Inspect and recover them explicitly.');
  const missing=manifest.files.filter(item=>!existing.has(item.path));
  if(values.apply)for(const item of missing){const target=path.join(root,item.path);let parent=path.dirname(target);while(parent!==root){try{const parentStat=await lstat(parent);if(parentStat.isSymbolicLink()||!parentStat.isDirectory())throw new Error('Unsafe restore path.');}catch(error){if(!absent(error))throw error;}parent=path.dirname(parent);}await mkdir(path.dirname(target),{recursive:true,mode:0o700});const temporary=target+'.restore-'+randomUUID();try{await copyFile(path.join(backup,'files',item.path),temporary);await chmod(temporary,item.kind==='operational'?0o600:item.mode&0o777);const appeared=await lstat(target).catch(error=>{if(absent(error))return undefined;throw error;});if(appeared)throw new Error('A file appeared during restore; recovery stopped.');await link(temporary,target);}finally{await unlink(temporary).catch(()=>{});}}
  console.log(JSON.stringify({mode:'restore',dryRun:!values.apply,restoredFiles:values.apply?missing.length:0,missingFiles:missing.length,canonicalSchema:'preserved byte-for-byte',operationalState:'preserved; never migrated as cache'}));
}
await main().catch(()=>{console.error('Upgrade check failed safely. Keep clients paused; inspect roots, private backup, credentials and build metadata. No credentials were printed. Use --help for supported options.');process.exitCode=1;});
