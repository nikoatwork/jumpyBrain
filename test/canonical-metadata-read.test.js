import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseFrontmatter, readMarkdownDocument } from '../dist/core/canonical/index.js';

test('metadata scanning preserves full-parser semantics at chunk boundaries, EOF and oversized headers', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jb-metadata-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'note.md');
  for(const content of [
    '', 'Plain body\n---\ntitle: not metadata\n---\n', '---\ntitle: Unfinished\n',
    '---\r\ntitle: "café 日本語"\r\n---', '\ufeff --- \n title: ignored\nid: literal\n --- \nbody',
    '---\ntitle: "'+ 'é'.repeat(2100)+'"\n---\nbody',
    '---\ntitle: '+ 'x'.repeat(70000)+'\n---\nbody',
    ' '.repeat(70000)+'---\ntitle: Long opening line\n---\nbody',
  ]) {
    await fs.writeFile(file,content);
    const expected=parseFrontmatter(content),actual=await readMarkdownDocument(root,file);
    assert.deepEqual(actual.frontmatter,expected.frontmatter);
    assert.equal(actual.bodyStartLine,expected.bodyStartLine);
  }
  const abort=new AbortController();abort.abort();
  await assert.rejects(readMarkdownDocument(root,file,abort.signal),{name:'AbortError'});
});

test('ordinary metadata reads do not consume a large body and observe external metadata edits',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jb-metadata-bounded-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'note.md');
  await fs.writeFile(file,'---\ntitle: Original\n---\n'+'body '.repeat(1000000));
  let bytes=0,fullReads=0;
  const originalOpen=fs.open;
  t.mock.method(fs,'open',async(...args)=>{
    const handle=await originalOpen(...args);
    if(args[0]===file) {
      const read=handle.read.bind(handle),readFile=handle.readFile.bind(handle);
      t.mock.method(handle,'read',async(...args)=>{const result=await read(...args);bytes+=result.bytesRead;return result;});
      t.mock.method(handle,'readFile',async(...args)=>{fullReads++;return readFile(...args);});
    }
    return handle;
  });
  syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  assert.equal((await readMarkdownDocument(root,file)).frontmatter.title,'Original');
  assert.ok(bytes<=4096);assert.equal(fullReads,0);
  await fs.writeFile(file,'---\ntitle: External change\n---\nnew body');
  assert.equal((await readMarkdownDocument(root,file)).frontmatter.title,'External change');
});
