// Test-only entrypoint: production sandboxed Mac window with real CLI/root and loopback remote data.
import { app } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createEditorWindow } from './window.mjs';
import { companionControl } from './setup.mjs';

const config=JSON.parse(await readFile(process.env.JUMPYBRAIN_BOARDS_FIXTURE,'utf8'));
app.setPath('userData',config.userData);app.on('window-all-closed',()=>{});
const execute=promisify(execFile),checks=[];
let window;
const js=async code=>{try{return await window.webContents.executeJavaScript(code,true);}catch{throw new Error('Native renderer failed: '+code);}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(code){const deadline=Date.now()+15000;while(Date.now()<deadline){try{if(await js(code))return;}catch{}await pause(30);}throw new Error('Native board timeout: '+code);}
const cli=async(...args)=>JSON.parse((await execute(config.node,[config.cli,'board',...args,'--root',config.root,'--json'],{env:{...process.env,JUMPYBRAIN_API_KEY:''},maxBuffer:1024*1024})).stdout);
const capture=async name=>writeFile(path.join(config.output,name+'.png'),(await window.webContents.capturePage()).toPNG());
const mark=text=>{checks.push(text);console.log('Boards native: '+text);};
async function run() {
try {
  await app.whenReady();
  let saved=await cli('create','--name','Wedding planning QA','--column','Ideas','--column','Arranging','--column','Confirmed');
  const id=saved.board.id;
  saved=await cli('add','--board',id,'--page',config.ids[0],'--column','1','--if-match',saved.contentHash);
  const editor=createEditorWindow(config,{confirmClose:()=>false});window=editor.window;window.webContents.setBackgroundThrottling(false);await editor.loaded;
  await wait('companionRegistered && !companionFrozen && !document.getElementById("new-board").disabled');
  assert.equal(await js('typeof require'),'undefined');
  await wait("[...document.querySelectorAll('#sidebar-boards .sidebar-page-link')].some(b=>b.textContent==='Wedding planning QA')");
  await js(`[...document.querySelectorAll('#sidebar-boards .sidebar-page-link')].find(b=>b.textContent==='Wedding planning QA').click()`);
  await wait('document.querySelectorAll(".board-column").length===3 && document.querySelector(".board-card-title")?.textContent==="Venue shortlist"');
  await capture('01-cli-created');mark('CLI creation appears in native Mac board');
  await js(`document.querySelector('[aria-label="Rename board"]').click();const input=document.querySelector('.board-rename-input');input.value='Our wedding QA';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
  await wait('!boardsUI.pending() && document.getElementById("board-title").textContent==="Our wedding QA"');
  assert.equal((await cli('show','--board',id)).board.name,'Our wedding QA');
  await js(`document.querySelector('.board-card > button').focus()`);
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right',modifiers:['alt']});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right',modifiers:['alt']});
  await wait('!boardsUI.pending() && document.querySelectorAll(".board-column")[1].querySelector(".board-card")');
  saved=await cli('show','--board',id);assert.deepEqual(saved.board.columns.map(c=>c.pages),[[],[config.ids[0]],[]]);
  mark('native rename and actual keyboard card move persist to CLI');
  saved=await cli('add','--board',id,'--page',config.ids[1],'--column','1','--if-match',saved.contentHash);
  await js('boardsUI.refresh()');await wait('document.querySelectorAll(".board-card").length===2');
  await capture('02-shared-edits');
  const status=await cli('status','--board',id);assert.equal(status.totalCards,2);assert.equal(status.partial,false);
  saved=await cli('update','--board',id,'--archived','true','--if-match',saved.contentHash);
  await js('boardsUI.refresh()');await wait('document.getElementById("board-notice").textContent.includes("Settled")');
  await js(`document.querySelector('#board-notice button').click()`);
  await wait(`document.querySelector('[aria-label="Restore Our wedding QA"]')`);
  await js(`document.querySelector('[aria-label="Restore Our wedding QA"]').click()`);await wait(`!boardsUI.pending() && document.querySelector('[aria-label="Settle Our wedding QA"]')`);
  assert.equal((await cli('show','--board',id)).board.archived,false);mark('CLI settle and native Settings restore agree');
  await js('document.getElementById("new-board").click()');await wait(`!boardsUI.pending() && new URL(location.href).searchParams.get('board') && new URL(location.href).searchParams.get('board')!==${JSON.stringify(id)}`);
  const secondId=await js(`new URL(location.href).searchParams.get('board')`);
  assert.equal((await cli('list')).boards.length,2);
  await js(`navigation.navigate('/settings?section=boards')`);await wait(`document.querySelector('[data-board-id="${secondId}"] .board-settings-actions button')`);
  await js(`document.querySelector('[data-board-id="${secondId}"] .board-settings-actions button:last-child').click()`);
  await js(`document.querySelector('[data-board-id="${secondId}"] [aria-label="Delete board"]').click()`);
  await wait(`!boardsUI.pending() && !document.querySelector('[data-board-id="${secondId}"]')`);assert.equal((await cli('list')).boards.length,1);
  mark('native create and confirmed delete manipulate individual JSON boards');
  saved=await cli('show','--board',id);await cli('delete','--board',id,'--if-match',saved.contentHash);
  await js('boardsUI.refresh()');await wait('document.querySelectorAll("#sidebar-boards li").length===0');mark('CLI deletion refreshes native sidebar and preserves notes');
  await companionControl(config,'switch',{id:config.remoteId});
  await wait(`companionRegistered && !companionFrozen && companionState.activeId===${JSON.stringify(config.remoteId)}`);
  await js('boardsUI.refresh()');await wait("[...document.querySelectorAll('#sidebar-boards .sidebar-page-link')].some(b=>b.textContent==='Shared wedding QA')");
  assert.equal(await js('document.getElementById("new-board").disabled'),true);
  await js(`[...document.querySelectorAll('#sidebar-boards .sidebar-page-link')].find(b=>b.textContent==='Shared wedding QA').click()`);
  await wait('document.querySelector(".board-card-title")?.textContent==="Venue shortlist"');
  assert.equal(await js(`document.querySelector('[aria-label="Rename board"]').disabled`),true);
  assert.equal(await js(`document.querySelector('.board-card > button').disabled`),false);
  assert.equal(await js(`document.querySelector('.board-add').disabled`),true);
  await capture('03-remote-read-only');
  await js(`navigation.navigate('/settings?section=boards')`);await wait('document.querySelector(".board-settings-name")');
  assert.equal(await js('document.querySelector(".board-settings-name").disabled'),false);
  assert.equal(await js('[...document.querySelectorAll(".board-settings-actions button")].every(b=>b.disabled)'),true);
  await js('document.querySelector(".board-settings-name").click()');await wait('document.querySelector(".board-card > button")');
  await js('document.querySelector(".board-card > button").click()');await wait('state.editor?.state.loaded');
  assert.equal(await js('document.getElementById("note-add-to-board").disabled'),true);
  mark('loopback remote boards render; read-only navigation works and all board writes are disabled');
  await companionControl(config,'switch',{id:config.localId});await wait(`companionRegistered && !companionFrozen && companionState.activeId===${JSON.stringify(config.localId)}`);
  await writeFile(config.result,JSON.stringify({ok:true,checks},null,2)+'\n');
  window.destroy();app.exit(0);
} catch(error) {
  await writeFile(config.result,JSON.stringify({ok:false,error:error.stack,checks},null,2)).catch(()=>{});
  console.error(error);window?.destroy();app.exit(1);
}

}
void run().catch(error=>{console.error(error);app.exit(1);});
