// Production-shell status presentation only; fake status metadata, no model/download.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jb-semantic-status-'));let server,browser;
try {
  await initializeMemoryRoot(root);server=await startJumpyBrainHttpServer({root,apiKeys:['fixture'],port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});const page=await browser.newPage();
  let state='lexical',failed=false,mutations=0;
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/index'))mutations++;});
  await page.route('**/memories/all/status',route=>failed?route.fulfill({status:503,json:{error:{code:'unavailable'}}}):route.fulfill({json:{index:{stale:state!=='ready'},readiness:{freshness:state==='ready'?'fresh':'stale'},maintenance:{enabled:false,indexing:false,failed:state==='failed'},semanticSetup:{state}}}));
  await page.goto(server.url+'/#apiKey=fixture');await page.locator('#open-search').click();
  for(const [next,expected]of [['lexical','Text search.'],['ready','Semantic search ready.'],['unavailable','selected semantic model is unavailable'],['incomplete','indexing is incomplete'],['failed','indexing failed']]) {
    state=next;await page.evaluate(()=>searchMaintenance.check());await page.waitForFunction(expected=>document.getElementById('search-semantic-state').textContent.includes(expected),expected);
    assert.equal(await page.locator('#search-semantic-state').isVisible(),true);
  }
  failed=true;await page.evaluate(()=>searchMaintenance.check());assert.equal(await page.locator('#search-semantic-state').isVisible(),false);
  assert.equal(mutations,0);console.log('Semantic status shell: PASS (all states, failed observation clears stale label, no index/download mutation).');
}finally{await browser?.close();await server?.close();await rm(root,{recursive:true,force:true});}
