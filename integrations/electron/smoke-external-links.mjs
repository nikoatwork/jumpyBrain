// Test-only real Electron editor/host entrypoint; excluded from shipped bundles.
import {app,BrowserWindow} from 'electron';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createEditorWindow} from './window.mjs';
async function run(){
  const config=JSON.parse(await readFile(process.env.JUMPYBRAIN_EXTERNAL_LINK_FIXTURE,'utf8'));
  app.setPath('userData',config.userData);app.on('window-all-closed',()=>{});
  let window;
  const opened=[];
  const js=source=>window.webContents.executeJavaScript(source,true);
  async function until(source){
    const deadline=Date.now()+12000;
    while(Date.now()<deadline){if(await js(source))return;await new Promise(resolve=>setTimeout(resolve,40));}
    throw new Error('External-link fixture timed out.');
  }
  try{
    await app.whenReady();
    const editor=createEditorWindow(config,{openExternalLink:async url=>opened.push(url)});
    window=editor.window;await editor.loaded;
    await until('typeof companionRegistered!=="undefined" && companionRegistered && !companionFrozen');
    await js(`navigation.navigate('/?brain='+encodeURIComponent(companionState.activeId)+'&note='+${JSON.stringify(config.id)})`);
    await until('document.querySelector("#note-editor a.markdown-external-link") && document.querySelector("#note-editor").isContentEditable');
    const before=await js('richEditor.getMarkdown()');
    assert.equal(await js('document.querySelectorAll("#note-editor .markdown-bullet").length'),2,'ordinary bullets render in the real Mac window');
    assert.equal(await js('document.querySelectorAll("#note-editor .markdown-bullet .editor-bold").length'),2,'bullet emphasis renders');
    assert.equal(await js('document.querySelectorAll("#note-editor a.markdown-external-link").length'),2,'safe links render beside inert relative source');
    assert.equal(await js('document.querySelector("#note-editor").textContent.includes("[Earlier](../decisions/example.md)")'),true);
    assert.equal(await js('Array.from(document.querySelectorAll("#note-editor a")).some(link=>link.getAttribute("href")?.startsWith("../"))'),false);

    const p=await js('(()=>{const r=document.querySelector("#note-editor a.markdown-external-link").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
    for(const type of ['mouseDown','mouseUp'])window.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});
    const deadline=Date.now()+5000;
    while(!opened.length&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,40));
    assert.deepEqual(opened,['https://example.com/issue/1145']);
    assert.equal(await js('richEditor.getMarkdown()'),before);
    assert.equal(BrowserWindow.getAllWindows().length,1,'No external renderer window is created.');
    assert.equal(new URL(window.webContents.getURL()).origin,config.origin);
    await js("window.open('file:///tmp/example');window.open('javascript:alert(1)');true");
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(opened.length,1,'Other protocols cannot reach the system opener.');
    await js('companionFrozen=true;richEditor.setReadOnly(true);document.querySelector("#note-editor a.markdown-external-link").click();true');
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(opened.length,1,'Frozen sessions cannot activate external links.');
    await writeFile(config.result,JSON.stringify({ok:true}));
    console.log('PASS real Electron renders ordinary Markdown bullets/emphasis and inert relative source; external-link click reaches the system-opener seam once and retains the note');
  }catch(error){await writeFile(config.result,JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
  finally{window?.destroy();app.exit(process.exitCode||0);}
}
run().catch(()=>app.exit(1));
