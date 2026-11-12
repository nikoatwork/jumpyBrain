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
    throw new Error('External-link fixture timed out: '+source.slice(0,160));
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
    assert.equal(await js('document.querySelectorAll("#note-editor a.markdown-external-link").length'),3,'safe web links and the note link render as labels');
    assert.equal(await js('document.querySelector("#note-editor [data-note-link][title=\'../decisions/example.md\']")?.textContent'),'Earlier','the note link shows its label with the path on hover');
    assert.equal(await js('Array.from(document.querySelectorAll("#note-editor a")).some(link=>link.getAttribute("href")?.startsWith("../"))'),false);

    const p=await js('(()=>{const r=document.querySelector("#note-editor a.markdown-external-link").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
    for(const type of ['mouseDown','mouseUp'])window.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});
    const deadline=Date.now()+5000;
    while(!opened.length&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,40));
    assert.deepEqual(opened,['https://example.com/issue/1145']);
    assert.equal(await js('richEditor.getMarkdown()'),before);
    assert.equal(BrowserWindow.getAllWindows().length,1,'No external renderer window is created.');
    assert.equal(new URL(window.webContents.getURL()).origin,config.origin);
    // Live preview with native keys: the link at the caret shows its Markdown, its path is editable, and leaving it renders the label.
    const text='document.querySelector("#note-editor").textContent';
    const place=(find,offset)=>js(`(()=>{const e=document.querySelector("#note-editor");e.focus();const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n,o=e.textContent.indexOf(${JSON.stringify(find)})+${offset};while((n=w.nextNode())&&o>n.length)o-=n.length;const r=document.createRange();r.setStart(n,o);const s=getSelection();s.removeAllRanges();s.addRange(r);return true})()`);
    const key=async(keyCode,char)=>{window.webContents.sendInputEvent({type:'keyDown',keyCode});if(char)window.webContents.sendInputEvent({type:'char',keyCode});window.webContents.sendInputEvent({type:'keyUp',keyCode});await new Promise(resolve=>setTimeout(resolve,60))};
    const saved='state.editor?.collaboration?.state.status==="saved"';
    await place('Issue.',6);await key('Left');
    await until(`${text}.includes("[Issue](https://example.com/issue/1145).")`);
    await key('Left');await key('Right');await key('Right');
    await until(`!${text}.includes("[Issue](")`);
    assert.equal(await js('richEditor.getMarkdown()'),before,'revealing and collapsing are not edits');
    await place('Earlier',3);
    await until(`${text}.includes("[Earlier](../decisions/example.md)")`);
    await place('example.md',7);await key('x',true);
    await until(`richEditor.getMarkdown().includes("[Earlier](../decisions/examplex.md)") && ${saved}`);
    assert.match(await readFile(config.note,'utf8'),/\[Earlier\]\(\.\.\/decisions\/examplex\.md\)/,'the path edit saves exactly');
    await place('See',0);
    await until('document.querySelector("#note-editor [data-note-link][title=\'../decisions/examplex.md\']")');
    await place('Earlier',3);await until(`${text}.includes("examplex.md")`);await place('examplex.md',8);await key('Backspace');
    await until(`richEditor.getMarkdown()===${JSON.stringify(before)} && ${saved}`);
    await place('See',0);await until(`!${text}.includes("[Earlier](")`);
    await js("window.open('file:///tmp/example');window.open('javascript:alert(1)');true");
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(opened.length,1,'Other protocols cannot reach the system opener.');
    await js('companionFrozen=true;richEditor.setReadOnly(true);document.querySelector("#note-editor a.markdown-external-link").click();true');
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(opened.length,1,'Frozen sessions cannot activate external links.');
    await writeFile(config.result,JSON.stringify({ok:true}));
    console.log('PASS real Electron renders ordinary Markdown bullets/emphasis and label-only note links; native keys reveal, edit and collapse link source; external-link click reaches the system-opener seam once and retains the note');
  }catch(error){await writeFile(config.result,JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
  finally{window?.destroy();app.exit(process.exitCode||0);}
}
run().catch(()=>app.exit(1));
