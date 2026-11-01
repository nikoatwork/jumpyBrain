import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { loadPlaywrightChromium, launchPlaywrightChromium } from '../../../scripts/playwright-runtime.mjs';
import { sourceEditorInstrumentation, editorSourceHash } from './instrument.mjs';
import { SourceSession, difference } from './model.mjs';
import { modelCases } from './cases.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const corpusBytes = await readFile(path.join(root,'prototypes/multiplayer/corpus.json'));
const corpus = JSON.parse(corpusBytes);
const output = path.resolve(process.env.JUMPYBRAIN_M1_SOURCE_OUT ?? path.join(root,'.local-pack/multiplayer/M1-source-model.json'));
const report = {
  version:1, candidate:'source-model-v1', status:'error',
  corpusSha256:createHash('sha256').update(corpusBytes).digest('hex'), cases:[], metrics:{},
  scope:'M1 design-only bounded source-operation experiment with actual production createNoteEditor, isolated browser contexts, prototype-only source instrumentation and no production source edits.',
  limits:[
    'Not a general OT/CRDT correctness proof; server-ordered nonoverlapping splices and deterministic insert ties only. Overlapping replacements require recovery.',
    'Granular current-editor binding accepts source ranges wholly inside unambiguous text leaves. Cross-block/newline/delimiter-only operations reject and preserve both versions; complete structural live editing is not delivered.',
    'Prototype disables built-in snapshot history; actor-local undo is an operation command. No production keyboard shortcut or persistent offline-draft integration is delivered.',
    'No transport, role authorization, raw filesystem watcher or disk durability is implemented by this candidate. Separate design-gate fixtures must prove those seams.',
    'Physical IME, accessibility, other browsers, arbitrary Markdown, mixed line endings and internet/VPS behavior are not established.',
    'No candidate dependency added. Build uses the existing pinned root esbuild/Lexical packages and separately provisioned Playwright.',
  ],
};
let browser;
const execute = async (id, operation) => {
  try { const details = await operation(); report.cases.push({id,status:'passed',...(details??{})}); }
  catch(error) { report.cases.push({id,status:'error',error:error.stack??String(error)}); }
};
try {
  report.cases.push(...modelCases());
  const started = performance.now();
  const bundled = await build({absWorkingDir:root,entryPoints:['prototypes/multiplayer/source-model/browser.ts'],bundle:true,write:false,
    format:'iife',platform:'browser',target:'es2022',minify:true,define:{'process.env.NODE_ENV':'"production"'},
    plugins:[sourceEditorInstrumentation(root)],metafile:true});
  const bundle = bundled.outputFiles[0].text;
  report.metrics={bundleBytes:Buffer.byteLength(bundle),bundleGzipBytes:gzipSync(bundle).length,buildMs:performance.now()-started,
    productionEditorSha256:await editorSourceHash(root),sourceModelDependencies:0,historyLimit:128,maxDocumentBytes:65536,maxActors:32,maxStreams:16};
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  report.metrics.chromium=browser.version();
  const makeClient=async(markdown,id='editor')=>{
    const context=await browser.newContext();
    const page=await context.newPage(); page.setDefaultTimeout(10000);
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await page.addScriptTag({content:bundle});
    await page.evaluate(({id,markdown})=>window.sourcePrototype.create(id,markdown),{id,markdown});
    return {context,page,id,snapshot:()=>page.evaluate(id=>window.sourcePrototype.snapshot(id),id)};
  };
  const patchTo=async(client,next)=>{
    const before=(await client.snapshot()).markdown;
    if(before===next)return {status:'unchanged'};
    const patch={before,...difference(before,next)};
    const outcome=await client.page.evaluate(({id,patch})=>window.sourcePrototype.patch(id,patch),{id:client.id,patch});
    assert.equal(outcome.status,'applied',JSON.stringify(outcome));
    assert.equal((await client.snapshot()).markdown,next);
    return outcome;
  };
  for (const specimen of corpus.cases) {
    await execute('source-editor-roundtrip-and-unrelated-preservation/'+specimen.id,async()=>{
      const client=await makeClient(specimen.markdown);
      try {
        const before=await client.snapshot(); assert.equal(before.markdown,specimen.markdown); assert.deepEqual(before.errors,[]);
        const start=specimen.markdown.indexOf(specimen.probe.needle)+specimen.probe.needle.length;
        assert.ok(start>=specimen.probe.needle.length);
        const next=specimen.markdown.slice(0,start)+specimen.probe.insert+specimen.markdown.slice(start);
        await patchTo(client,next);
        const after=await client.snapshot();
        assert.deepEqual(after.keys,before.keys,'granular patch must not rebuild root nodes');
        assert.deepEqual(after.changes,[],'remote hydration must not echo a local save');
        assert.deepEqual(after.errors,[]);
      } finally {await client.context.close();}
    });
  }
  for (const [id,markdown,needle,insert] of [
    ['task-leaf','Human\n\n- [X] Keep source exact\n\nAgent','Keep source',' agent'],
    ['code-leaf','Human\n\n\x60\x60\x60js\nconst value = 1;\n\x60\x60\x60\n\nAgent','const value','_agent'],
    ['table-leaf','Human\n\n| A | B |\n| --- | --- |\n| cell | other |\n\nAgent','cell','_agent'],
    ['reference-leaf','Human [[Project plan]] and tail\n\nAgent','Project plan',' updated'],
  ]) {
    await execute('source-editor-custom-node/'+id,async()=>{
      const client=await makeClient(markdown);try {
        const before=await client.snapshot(),start=markdown.indexOf(needle)+needle.length;
        await patchTo(client,markdown.slice(0,start)+insert+markdown.slice(start));
        assert.deepEqual((await client.snapshot()).keys,before.keys);
      } finally {await client.context.close();}
    });
  }
  await execute('source-editor-empty-note-stream-start',async()=>{
    const client=await makeClient('');try{
      const before=await client.snapshot();
      await patchTo(client,'First streamed chunk');
      await patchTo(client,'First streamed chunk and second');
      assert.deepEqual((await client.snapshot()).keys,before.keys);
    }finally{await client.context.close();}
  });
  await execute('source-real-two-human-stream-and-local-undo',async()=>{
    const initial='Human anchor.\n\nRepeated paragraph.\n\nRepeated paragraph.\n\nAgent anchor.';
    const a=await makeClient(initial),b=await makeClient(initial),session=new SourceSession(initial);
    try {
      const typeAt=async(client,needle,offset,text)=>{
        await client.page.locator('#editor').focus();
        await client.page.evaluate(({needle,offset})=>window.sourcePrototype.focusAt('editor',needle,offset),{needle,offset});
        await client.page.keyboard.insertText(text);
        await client.page.waitForFunction(({text})=>window.sourcePrototype.snapshot('editor').markdown.includes(text),{text});
        return (await client.snapshot()).markdown;
      };
      // Both edit independently from revision0 before either receives its peer.
      const [draftA,draftB]=await Promise.all([
        typeAt(a,'Human anchor.',13,' Alice'),typeAt(b,'Agent anchor.',13,' Bob')]);
      session.apply({actor:'alice',id:'a',epoch:session.epoch,baseRevision:0,...difference(initial,draftA)});
      session.apply({actor:'bob',id:'b',epoch:session.epoch,baseRevision:0,...difference(initial,draftB)});
      assert.equal(session.body,'Human anchor. Alice\n\nRepeated paragraph.\n\nRepeated paragraph.\n\nAgent anchor. Bob');
      await patchTo(a,session.body);await patchTo(b,session.body);
      assert.ok((await a.snapshot()).changes.length===1&&(await b.snapshot()).changes.length===1,'peer changes do not echo writes');
      await a.page.evaluate(()=>window.sourcePrototype.focusAt('editor','Human anchor.',3));
      const caret=(await a.snapshot()).selection;
      session.beginStream('agent','generated',session.body.length);
      let sequence=0;
      for(const token of [' Generated',' text',' \x60partial']) {
        session.chunk('agent','generated',sequence++,token);
        await patchTo(a,session.body);await patchTo(b,session.body);
        assert.deepEqual((await a.snapshot()).selection,caret,'remote stream keeps another paragraph caret');
      }
      const current=session.body;
      const duplicate=session.chunk('agent','generated',2,' \x60partial');
      assert.equal(duplicate.duplicate,true);assert.equal(session.body,current);assert.equal(duplicate.body,current);
      session.cancel('agent','generated');
      session.undo('alice','undo-a');
      assert.ok(!session.body.includes(' Alice')&&session.body.includes(' Bob')&&session.body.includes('Generated text \x60partial'));
      await patchTo(a,session.body);await patchTo(b,session.body);
      assert.deepEqual((await a.snapshot()).errors,[]);assert.deepEqual((await b.snapshot()).errors,[]);
      return {contexts:2,streamChunks:3,actorLocalUndo:'retained Bob and agent output'};
    } finally {await a.context.close();await b.context.close();}
  });
  await execute('source-real-structural-recovery-retains-both-inputs',async()=>{
    const original='Human anchor.\n\nAgent anchor.',incoming='Human anchor.\nA new paragraph\n\nAgent anchor.';
    const client=await makeClient(original);try {
      const outcome=await client.page.evaluate(({before,patch})=>window.sourcePrototype.patch('editor',{before,...patch}),{before:original,patch:difference(original,incoming)});
      assert.equal(outcome.status,'recovery');assert.equal(outcome.reason,'structural_patch_requires_binding');
      assert.equal((await client.snapshot()).markdown,original);assert.equal(incoming,'Human anchor.\nA new paragraph\n\nAgent anchor.');
      return {incomingRetained:true,canonicalRetained:true,capability:'structural live binding remains unimplemented'};
    } finally {await client.context.close();}
  });
  await execute('source-real-inline-markup-applies-or-recovers-without-loss',async()=>{
    const original='Human anchor.\n\nAgent anchor.';
    const client=await makeClient(original);
    try {
      const before=await client.snapshot();
      const at=original.indexOf('Human');
      const result=await client.page.evaluate(({at,original})=>window.sourcePrototype.patch('editor',{before:original,start:at,deleteCount:0,insert:'[[linked]] '}),{at,original});
      assert.ok(['applied','recovery'].includes(result.status),JSON.stringify(result));
      const after=await client.snapshot();
      if(result.status==='recovery') {
        assert.equal(after.markdown,original);
        assert.deepEqual(after.keys,before.keys);
      } else {
        assert.equal(after.markdown,'[[linked]] '+original);
      }
      assert.deepEqual(after.changes,[]);
      assert.deepEqual(after.errors,[]);
      return {result:result.status,incomingRetained:true};
    } finally {await client.context.close();}
  });
  await execute('source-real-injected-serialization-failure-restores-editor',async()=>{
    const original='Human anchor.\n\nAgent anchor.',client=await makeClient(original);
    try {
      const before=await client.snapshot();
      const outcome=await client.page.evaluate(original=>window.sourcePrototype.patch('editor',{before:original,start:5,deleteCount:0,insert:' proposed',__injectSerializationFailure:true}),original);
      assert.equal(outcome.status,'recovery');assert.equal(outcome.injected,true);
      const after=await client.snapshot();
      assert.equal(after.markdown,original);assert.deepEqual(after.keys,before.keys);
      assert.equal(after.text,before.text);assert.deepEqual(after.changes,[]);
      assert.deepEqual(after.errors,[]);
      return {faultInjected:true,sourceAndDomRestored:true,incoming:' proposed'};
    } finally {await client.context.close();}
  });
  report.status=report.cases.every(result=>result.status==='passed')?'passed':'rejected';
} catch(error) {report.status='error';report.error=error.stack??String(error);}
finally {
  await browser?.close();
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({candidate:report.candidate,status:report.status,cases:report.cases.map(({id,status,error})=>({id,status,...(error?{error:error.split('\n')[0]}:{})})),output,metrics:report.metrics},null,2));
  process.exitCode=report.status==='passed'?0:1;
}
