import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const filePath = value => typeof value === 'string' && value.length > 0 && !value.includes('\\') && !path.isAbsolute(value) && !value.split('/').some(part => !part || part === '.' || part === '..');
const mapping = value => Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim() === item && item.length > 0 && item.length <= 500) && new Set(value).size === value.length;

/** The digest comes from a separately reviewed command/config, never a sibling hash file. */
export async function readContractDelta(file, pinnedSha256, { baselineSha256 } = {}) {
  if (!file || !digest(pinnedSha256)) throw new Error('An externally pinned --delta-sha256 digest is required with --delta.');
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error('Contract delta must be a bounded regular file.');
  const bytes = await readFile(file);
  if (sha(bytes) !== pinnedSha256) throw new Error('Contract delta digest does not match the externally pinned digest.');
  const declaration = JSON.parse(bytes);
  if (declaration.version !== 1 || declaration.status !== 'reviewed' || !digest(declaration.baselineSha256)
    || declaration.baselineSha256 !== baselineSha256 || !Array.isArray(declaration.entries) || declaration.entries.length < 1 || declaration.entries.length > 10000)
    throw new Error('Contract delta must be reviewed, nonempty and bound to this pinned original baseline.');
  const keys = new Set();
  for (const entry of declaration.entries) {
    const key = entry.kind + ':' + entry.file;
    if (!['assertion','harness'].includes(entry.kind) || !filePath(entry.file)
      || !(digest(entry.oldSha256) || entry.oldSha256 === null)
      || !digest(entry.newSha256) || entry.oldSha256 === entry.newSha256
      || typeof entry.reason !== 'string' || entry.reason.trim().length < 20 || entry.reason.length > 4000
      || !mapping(entry.scenarioIds) || !mapping(entry.evidence) || keys.has(key))
      throw new Error('Contract delta entries require unique paths, exact old/new hashes, reasons and coverage/evidence mappings.');
    keys.add(key);
  }
  return { declaration, sha256: pinnedSha256 };
}

export function validateContractDelta({ frozen, assertions, harness, delta, extraAssertions = [] }) {
  const entries = new Map((delta?.declaration.entries ?? []).map(entry => [entry.kind + ':' + entry.file, entry]));
  const used = new Set(), additions = { assertions: [], harness: [] }, changed = [];
  const knownScenarios = new Set(frozen.checks.flatMap(check => check.scenarioIds ?? []));
  function authorize(kind, file, oldSha256, newSha256) {
    const key = kind + ':' + file, entry = entries.get(key);
    if (!entry) throw new Error('Frozen ' + kind + ' changed without an explicitly pinned contract delta: ' + file);
    if (entry.oldSha256 !== oldSha256 || entry.newSha256 !== newSha256) throw new Error('Contract delta old/new fingerprints disagree: ' + file);
    if (knownScenarios.size && entry.scenarioIds.some(id => !knownScenarios.has(id))) throw new Error('Contract delta references an unknown original scenario: ' + file);
    used.add(key); changed.push({ kind, file, oldSha256, newSha256 });
  }
  for (const [kind, before, after] of [['assertion',frozen.assertions,assertions],['harness',frozen.harness,harness]]) {
    for (const [file, oldSha256] of Object.entries(before)) {
      if (!Object.hasOwn(after,file)) throw new Error('Frozen ' + kind + ' missing; contract deltas cannot remove existing files: ' + file);
      if (after[file] !== oldSha256) authorize(kind,file,oldSha256,after[file]);
    }
    for (const file of Object.keys(after).filter(file => !Object.hasOwn(before,file))) {
      additions[kind === 'assertion' ? 'assertions' : 'harness'].push(file);
      if (kind === 'harness' || extraAssertions.includes(file)) authorize(kind,file,null,after[file]);
    }
  }
  for (const key of entries.keys()) if (!used.has(key)) throw new Error('Unused contract delta entry: ' + key);
  if (delta && !used.size) throw new Error('Unused contract delta declaration.');
  return { changed, additions };
}

/** Produces an unapproved draft only. Reasons and coverage need manual review. */
export function proposeContractDelta({ frozen, baselineSha256, assertions, harness, extraAssertions = [] }) {
  if (!digest(baselineSha256)) throw new Error('A pinned original baseline digest is required.');
  const entries=[];
  for (const [kind,before,after] of [['assertion',frozen.assertions,assertions],['harness',frozen.harness,harness]]) {
    for (const [file,oldSha256] of Object.entries(before)) {
      if (!Object.hasOwn(after,file)) throw new Error('Restore removed frozen ' + kind + ' before proposing a delta: ' + file);
      if (after[file] !== oldSha256) entries.push({kind,file,oldSha256,newSha256:after[file],reason:'',scenarioIds:[],evidence:[]});
    }
    for (const file of Object.keys(after).filter(file=>!Object.hasOwn(before,file))) if(kind === 'harness' || extraAssertions.includes(file)) entries.push({kind,file,oldSha256:null,newSha256:after[file],reason:'',scenarioIds:[],evidence:[]});
  }
  return {version:1,status:'draft',baselineSha256,entries:entries.sort((a,b)=>(a.kind+':'+a.file).localeCompare(b.kind+':'+b.file))};
}

/** Find literal relative imports among script oracles without executing them.
 * Runtime imports under dist/src/integrations remain implementation inputs.
 * Computed import expressions still require review; this is not a whole-program
 * dependency proof. TypeScript itself is part of the locked controlled tools.
 */
export async function discoverAssertionHelpers(root, assertionFiles) {
  root=await realpath(root);
  const script=file=>file.startsWith('scripts/') && /\.[cm]?js$/.test(file);
  const initial=new Set(assertionFiles),queue=assertionFiles.filter(script),visited=new Set(),extra=new Set();
  const imported=await import('typescript'),ts=imported.default??imported;
  while(queue.length) {
    const file=queue.shift();if(visited.has(file))continue;visited.add(file);
    const absolute=path.join(root,file),stat=await lstat(absolute);
    if(!stat.isFile()||stat.isSymbolicLink()||await realpath(absolute)!==absolute)throw new Error('Assertion helper is missing or unsafe: '+file);
    const source=ts.createSourceFile(file,await readFile(absolute,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),specifiers=[];
    function visit(node){if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))specifiers.push(node.moduleSpecifier.text);else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))specifiers.push(node.arguments[0].text);ts.forEachChild(node,visit);}
    visit(source);
    for(const specifier of specifiers.filter(value=>value.startsWith('.'))) {
      const dependency=path.relative(root,path.resolve(path.dirname(absolute),specifier)).split(path.sep).join('/');
      if(!dependency.startsWith('scripts/'))continue;
      if(!filePath(dependency)||/[?#]/.test(dependency)||dependency==='scripts/multiplayer-verify.mjs'||dependency.startsWith('scripts/multiplayer-verification/'))throw new Error('Unsupported regression helper dependency: '+dependency);
      const target=path.join(root,dependency),targetStat=await lstat(target);
      if(!targetStat.isFile()||targetStat.isSymbolicLink()||await realpath(target)!==target)throw new Error('Assertion helper is missing or unsafe: '+dependency);
      if(!initial.has(dependency))extra.add(dependency);
      if(script(dependency))queue.push(dependency);
    }
  }
  return [...extra].sort();
}

export function assertExtraAssertionDeclarations({frozen,assertionFiles,extraAssertions,delta}) {
  const declared=(delta?.declaration.entries??[]).filter(entry=>entry.kind==='assertion'&&entry.oldSha256===null).map(entry=>entry.file);
  for(const file of extraAssertions)if(!declared.includes(file))throw new Error('New assertion helper requires an explicitly pinned null-old declaration: '+file);
  for(const file of declared)if(assertionFiles.includes(file)||Object.hasOwn(frozen.assertions,file)||!extraAssertions.includes(file))throw new Error('Unused or invalid extra assertion declaration; it must be a referenced helper outside original roots: '+file);
}

async function main() {
  const values={};const args=process.argv.slice(2);
  for(let index=0;index<args.length;index+=2){if(!['--root','--baseline','--baseline-sha256','--out'].includes(args[index])||!args[index+1]||args[index+1].startsWith('--')||values[args[index]])throw new Error('Use --root DIR --baseline DIR --baseline-sha256 DIGEST --out NEW_DRAFT.json.');values[args[index]]=args[index+1];}
  if(!values['--baseline']||!values['--baseline-sha256']||!values['--out'])throw new Error('Use --root DIR --baseline DIR --baseline-sha256 DIGEST --out NEW_DRAFT.json.');
  const root=await realpath(path.resolve(values['--root']??fileURLToPath(new URL('../..',import.meta.url))));
  const {readBaseline,filesBelow,verificationHarnessRoots}=await import(pathToFileURL(path.join(root,'scripts/multiplayer-verify.mjs')).href);
  const frozen=await readBaseline(path.resolve(values['--baseline']),values['--baseline-sha256']);
  const contract=JSON.parse(await readFile(path.join(root,'test/fixtures/multiplayer-parity/contract.json'),'utf8'));
  const fingerprints=async files=>Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await readFile(path.join(root,file)))])));
  const assertionFiles=await filesBelow(root,[...contract.assertionRoots,...Object.keys(frozen.assertions).filter(file=>!contract.assertionRoots.some(entry=>file===entry||file.startsWith(entry+'/')))]);
  const extraAssertions=await discoverAssertionHelpers(root,assertionFiles);
  const assertions=await fingerprints([...assertionFiles,...extraAssertions]);
  const harness=await fingerprints(await filesBelow(root,await verificationHarnessRoots(root)));
  const draft=proposeContractDelta({frozen,baselineSha256:values['--baseline-sha256'],assertions,harness,extraAssertions});
  await writeFile(values['--out'],JSON.stringify(draft,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:'draft',entries:draft.entries.length,reviewRequired:true,message:'Fill every reason and coverage/evidence mapping after reviewing exact diffs; set reviewed only then, and pin the resulting digest separately. This draft cannot authorize verification.'}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
