// Disposable real runtime replacement, not a published GUI updater trial.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {cp,lstat,mkdir,mkdtemp,readFile,readdir,realpath,rename,rm,symlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {readBaseline,filesBelow} from './multiplayer-verify.mjs';

const repo=fileURLToPath(new URL('..',import.meta.url)),scriptFile=fileURLToPath(import.meta.url),oldCommit='be5493ba9a3c5aa796d371043e56d6539d6dabf4';
const sha=value=>createHash('sha256').update(value).digest('hex'),json=value=>JSON.stringify(value,null,2)+'\n',sensitiveValues=new Set();
function safeMessage(error){let result=String(error.message??error);for(const value of sensitiveValues)result=result.replaceAll(value,'[redacted]');return result;}
async function artifact(runtime){const result={};for(const file of await filesBelow(runtime,['dist']))result[file]=sha(await readFile(path.join(runtime,file)));return Object.fromEntries(Object.keys(result).sort().map(file=>[file,result[file]]));}
async function canonical(root){const result={};for(const file of await filesBelow(root,['notes','boards','jumpybrain.json']))result[file]=sha(await readFile(path.join(root,file)));return result;}
function child(command,args,options={}){const process=spawn(command,args,{cwd:options.cwd??repo,env:options.env??globalThis.process.env,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';process.stdout.on('data',chunk=>{stdout+=chunk;});process.stderr.on('data',chunk=>{stderr+=chunk;});const result=new Promise((resolve,reject)=>{process.once('error',reject);process.once('close',code=>resolve({code,stdout,stderr}));});process.stdin.end(options.input??'');return result;}
async function main(){
  const {values}=parseArgs({options:{package:{type:'string'},'package-sha256':{type:'string'},baseline:{type:'string'},'baseline-sha256':{type:'string'},out:{type:'string'}},strict:true,allowPositionals:false});
  for(const key of ['package','package-sha256','baseline','baseline-sha256'])assert.ok(values[key],'Missing --'+key);
  assert.match(values['package-sha256'],/^[a-f0-9]{64}$/);assert.equal(sha(await readFile(values.package)),values['package-sha256'],'Candidate package pin differs.');
  const baseline=await readBaseline(values.baseline,values['baseline-sha256']);assert.equal(baseline.source.gitSha,oldCommit);
  const out=path.resolve(values.out??path.join(repo,'.local-pack','multiplayer','packaged-upgrade-'+Date.now()));await mkdir(path.dirname(out),{recursive:true});await mkdir(out);await mkdir(path.join(out,'logs'));
  const temporary=await mkdtemp(path.join(os.tmpdir(),'jb-packaged-upgrade-')),home=path.join(temporary,'home');await mkdir(home);
  const env={...process.env,HOME:home,JUMPYBRAIN_CLI_CONFIG:path.join(temporary,'device.json'),JUMPYBRAIN_QMD_EMBED:'0',QMD_EMBED_MODEL:'',npm_config_cache:path.join(home,'npm-cache')};await writeFile(env.JUMPYBRAIN_CLI_CONFIG,json({schemaVersion:1,remoteTargets:[]}));
  assert.ok(process.env.JUMPYBRAIN_QMD_BIN,'Provision the real supported QMD CLI/SDK before the upgrade proof.');
  const receipt={version:1,passed:false,head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),scriptSha256:sha(await readFile(scriptFile)),packageSha256:values['package-sha256'],roots:2,upgradeMode:'disposable-runtime-replacement',steps:[],out,limits:['Uses the exact frozen M0 compiled runtime and its original source package manifests, then an independently pinned extracted candidate npm package with its own production dependencies. Both can have internal version0.3.16; exact builds are recorded.','Exercises a disposable atomic runtime selector, real old/new CLI/search, coordinated backup/drain/retry and missing-file recovery. It does not claim a published GUI update, real user installation, automatic browser-storage migration or a public VPS deployment.','Recovery fixtures are private filesystem recovery/export files. Browser-origin drafts must be explicitly exported before coordinated upgrade as documented.']};
  const active=path.join(temporary,'current'),old=path.join(temporary,'old'),stage=path.join(temporary,'stage'),roots=[];let target;
  async function run(label,command,args,options={}){const result=await child(command,args,{env,...options});receipt.steps.push({label,code:result.code});if(label.startsWith('npm-'))await writeFile(path.join(out,'logs',label+'.log'),result.stdout+result.stderr);assert.equal(result.code,0,label+': '+safeMessage(new Error(result.stderr.slice(-2000))));return result.stdout;}
  const cli=(runtime,args,input)=>run('cli-'+args[0],process.execPath,[path.join(runtime,'dist/cli.js'),...args],{input});
  const helper=(args)=>run('upgrade-'+args[args.indexOf('--mode')+1],process.execPath,[path.join(target,'scripts/multiplayer-upgrade.mjs'),...args]);
  async function select(runtime){const pending=active+'.next';await rm(pending,{force:true});await symlink(runtime,pending);await rename(pending,active);}
  try{
    receipt.toolchain={node:process.version,npm:(await run('npm-version','npm',['--version'])).trim(),qmd:{version:(await run('qmd-version',process.env.JUMPYBRAIN_QMD_BIN,['--version'])).trim(),executableSha256:sha(await readFile(await realpath(process.env.JUMPYBRAIN_QMD_BIN)))}};
    const listing=execFileSync('tar',['-tf',path.resolve(values.package)],{encoding:'utf8'}).trim().split('\n');assert.ok(listing.every(name=>{const parts=name.replace(/\/$/,'').split('/');return parts[0]==='package'&&parts.every(part=>part&&part!=='.'&&part!=='..');}),'Unsafe archive path.');
    const types=execFileSync('tar',['-tvf',path.resolve(values.package)],{encoding:'utf8'}).trim().split('\n');assert.ok(types.every(line=>line[0]==='-'||line[0]==='d'),'Linked archive entries are unsupported.');
    await mkdir(stage);execFileSync('tar',['-xf',path.resolve(values.package),'-C',stage]);target=path.join(stage,'package');
    const currentArtifact=await artifact(repo),targetArtifact=await artifact(target);assert.deepEqual(targetArtifact,currentArtifact,'Candidate package runtime must equal current tested dist.');receipt.runtimeArtifactSha256=sha(json(targetArtifact));
    receipt.target=JSON.parse(await readFile(path.join(target,'dist/adapters/diagnostics/build-info.json')));receipt.build=receipt.target.build;
    await writeFile(path.join(target,'package-lock.json'),await readFile(path.join(target,'dist/runtime-package-lock.json')));await run('npm-target','npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:target});
    await mkdir(old);await cp(path.join(values.baseline,'runtime'),path.join(old,'dist'),{recursive:true});
    for(const name of ['package.json','package-lock.json'])await writeFile(path.join(old,name),execFileSync('git',['show',oldCommit+':'+name],{cwd:repo}));
    await run('npm-old','npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:old});
    receipt.old={sourceCommit:oldCommit,...JSON.parse(await readFile(path.join(old,'dist/adapters/diagnostics/build-info.json')))};
    assert.notEqual(receipt.old.build,receipt.target.build,'The proof must replace a different real runtime build.');await select(old);
    const sharedId='mem_'+randomUUID(),needle='upgradequartz'+randomUUID().replaceAll('-','').slice(0,8);
    for(let index=0;index<2;index++){
      const root=path.join(temporary,'brain-'+index);await cli(active,['init','--root',root,'--json']);
      await cli(active,['remember','--root',root,'--title','Existing '+index,'--type','note','--json'],needle+' existing note '+index+'\n');
      const note=path.join(root,'notes','same-id.md'),body=`---\nid: ${sharedId}\ntitle: Same id ${index}\ntype: note\ncustom: unchanged\n---\n${needle} brain-specific-${index}\n`;
      await writeFile(note,body);const boardFile=path.join(temporary,'board-'+index+'.json');await writeFile(boardFile,json({name:'Existing board '+index,columns:[{name:'Next',pages:[sharedId]},{name:'Doing',pages:[]},{name:'Done',pages:[]}]}));await cli(active,['board','create','--root',root,'--file',boardFile,'--json']);await cli(active,['index','--root',root,'--lexical','--json']);
      const beforeSearch=await cli(active,['search','--root',root,'--query',needle,'--json']);assert.ok(beforeSearch.includes('brain-specific-'+index));
      const recovery=path.join(root,'.jumpybrain/recovery',sharedId,'export');await mkdir(recovery,{recursive:true,mode:0o700});await writeFile(path.join(recovery,'draft.md'),'Exported private recovery '+index,{mode:0o600});
      // Model preexisting private operational state without claiming M0 issued it.
      const issued=JSON.parse(await cli(target,['access','issue','--root',root,'--name','Upgrade writer '+index,'--role','writer','--json']));sensitiveValues.add(issued.token);
      const accessBytes=await readFile(path.join(root,'.jumpybrain/access.json')),canonicalBefore=await canonical(root),backup=path.join(temporary,'backup-'+index);
      const prepared=JSON.parse(await helper(['--root',root,'--mode','prepare','--backup',backup,'--cli-runtime',old,'--app-runtime',old,'--apply']));assert.equal(prepared.complete,true);
      roots.push({root,note,body,recovery,backup,canonicalBefore,accessBytes,issued});
    }
    // Interrupt after staging but before activation; the old installation stays usable.
    await symlink(target,active+'.next');for(const item of roots)assert.ok((await cli(active,['search','--root',item.root,'--query',needle,'--json'])).includes(needle));
    await select(target);receipt.interruptedRetry=true;
    for(const item of roots){
      assert.ok((await cli(active,['search','--root',item.root,'--query',needle,'--json'])).includes(needle));
      const opened=JSON.parse(await cli(active,['collaborate','open','--root',item.root,'--id',sharedId,'--json']));assert.ok(opened.body.includes('brain-specific-'+roots.indexOf(item)));
      const status=JSON.parse(await cli(active,['backend','status','--root',item.root,'--json']));const authenticated=await fetch(status.backend.url+'/capabilities',{headers:{Authorization:'Bearer '+item.issued.token}});assert.equal(authenticated.status,200);assert.equal((await authenticated.json()).principal.id,item.issued.credential.id);
      const checked=JSON.parse(await helper(['--root',item.root,'--mode','verify','--backup',item.backup,'--cli-runtime',active,'--app-runtime',target]));assert.equal(checked.ok,true);
      assert.deepEqual(await canonical(item.root),item.canonicalBefore);assert.deepEqual(await readFile(path.join(item.root,'.jumpybrain/access.json')),item.accessBytes);assert.equal(await readFile(path.join(item.recovery,'draft.md'),'utf8'),'Exported private recovery '+roots.indexOf(item));
      await cli(active,['backend','stop','--root',item.root,'--json']);
    }
    receipt.sameIdRoots=true;receipt.canonicalPreserved=true;receipt.recoveryPreserved=true;receipt.searchBeforeAfter=true;
    // Software rollback retains new operational files; missing-file recovery is explicit.
    await select(old);for(const item of roots)assert.ok((await cli(active,['search','--root',item.root,'--query',needle,'--json'])).includes(needle));
    const first=roots[0];await rm(first.note);await rm(path.join(first.recovery,'draft.md'));
    const restored=JSON.parse(await helper(['--root',first.root,'--mode','restore','--backup',first.backup,'--apply']));assert.equal(restored.restoredFiles,2);assert.equal(await readFile(first.note,'utf8'),first.body);assert.equal(await readFile(path.join(first.recovery,'draft.md'),'utf8'),'Exported private recovery 0');
    for(const item of roots){assert.ok((await cli(active,['search','--root',item.root,'--query',needle,'--json'])).includes(needle));assert.deepEqual(await canonical(item.root),item.canonicalBefore);assert.deepEqual(await readFile(path.join(item.root,'.jumpybrain/access.json')),item.accessBytes);}
    receipt.rollbackRecovered=true;await select(target);
    assert.equal(sha(await readFile(values.package)),values['package-sha256']);assert.deepEqual(await artifact(target),targetArtifact);assert.deepEqual(await artifact(repo),currentArtifact);assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),receipt.head);assert.equal(sha(await readFile(scriptFile)),receipt.scriptSha256);
    receipt.passed=true;await writeFile(path.join(out,'report.json'),json(receipt));console.log(JSON.stringify(receipt,null,2));
  }catch(error){receipt.error=safeMessage(error);await writeFile(path.join(out,'report.json'),json(receipt));console.error('Packaged upgrade proof failed: '+receipt.error);console.log(JSON.stringify(receipt,null,2));process.exitCode=1;}
  finally{if(target)for(const item of roots)await cli(target,['backend','stop','--root',item.root,'--json']).catch(()=>{});await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
}
await main().catch(error=>{console.error(safeMessage(error));process.exitCode=1;});
