import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {isAppNavigation} from '../integrations/electron/host.mjs';

async function fixture(platform='darwin'){
  const moduleUrl=new URL('../integrations/electron/window.mjs',import.meta.url),origin='http://127.0.0.1:3787';
  let installed,handled=true,url=origin+'/',destroyed=false,focused;const scripts=[],native=[];
  const contents=new EventEmitter(),session=new EventEmitter();
  Object.assign(session,{webRequest:{onBeforeRequest(){}},setPermissionRequestHandler(){},setPermissionCheckHandler(){}});
  Object.assign(contents,{session,getURL:()=>url,isDestroyed:()=>destroyed,executeJavaScript:async source=>{scripts.push(source);return handled;},setWindowOpenHandler(){},undo(){native.push('web:undo');},redo(){native.push('web:redo');}});
  class BrowserWindow extends EventEmitter{constructor(){super();this.webContents=contents;focused=this;}loadURL(){return Promise.resolve();}isDestroyed(){return false;}static getFocusedWindow(){return focused;}}
  class MenuItem{constructor(options){Object.assign(this,options);}}
  const originalEdit={items:['undo','redo','cut','copy','paste','selectAll','startSpeaking'].map(role=>new MenuItem({role,label:role[0].toUpperCase()+role.slice(1)})),append(item){this.items.push(item);}};
  const menuFrom=items=>({items,append(item){this.items.push(item);}});
  const Menu={buildFromTemplate:template=>menuFrom(template.map(item=>item.role?.toLowerCase()==='editmenu'?{...item,role:'editmenu',submenu:item.submenu??originalEdit}:item)),setApplicationMenu:menu=>{installed=menu;},sendActionToFirstResponder:action=>native.push(action)};
  const source=(await readFile(moduleUrl,'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(moduleUrl.href));
  const context={BrowserWindow,dialog:{},Menu,MenuItem,shell:{},fileURLToPath,URL,process:{platform},setInterval,clearInterval,installStarterPin(){},createSystemMessages:()=>()=>{},installBackNavigation(){},isAppNavigation};
  vm.runInNewContext(source+'\nglobalThis.openEditor=createEditorWindow;globalThis.installMenu=setApplicationMenu;',context);
  const opened=context.openEditor({origin,key:'disposable'});await opened.loaded;
  context.installMenu({app:{},getWindow:()=>opened.window,reconnect(){}});
  const invoke=async action=>{const item=installed.items.find(item=>item.role==='editmenu').submenu.items.find(item=>item.label.toLowerCase()===action);item.click(item,focused);await new Promise(resolve=>setImmediate(resolve));return item;};
  return {get edit(){return installed.items.find(item=>item.role==='editmenu').submenu;},scripts,native,invoke,get installed(){return installed;},set handled(value){handled=value;},set url(value){url=value;},set destroyed(value){destroyed=value;},set focused(value){focused=value;}};
}
test('native menu history dispatches once to the owned focused editor and preserves other platform roles',async()=>{
  const f=await fixture();assert.ok(f.installed);
  for(const action of ['undo','redo']){const item=await f.invoke(action);assert.equal(item.role,undefined,'native role must not bypass the custom command');assert.equal(item.accelerator,action==='undo'?'CommandOrControl+Z':'CommandOrControl+Shift+Z');assert.match(f.scripts.at(-1),new RegExp('detail:"'+action+'"'));assert.match(f.scripts.at(-1),/document.activeElement.dispatchEvent/);}
  assert.deepEqual(f.native,[]);assert.equal(f.scripts.length,2);
  for(const role of ['cut','copy','paste','selectAll','startSpeaking'])assert.ok(f.edit.items.some(item=>item.role===role));
});
test('unclaimed input history, unavailable renderer and unowned windows retain native fallback',async()=>{
  const f=await fixture();f.handled=false;await f.invoke('undo');assert.deepEqual(f.native,['undo:']);
  f.url='https://outside.example/';await f.invoke('redo');assert.deepEqual(f.native,['undo:','redo:']);assert.equal(f.scripts.length,1);
  f.focused={webContents:{isDestroyed:()=>false,getURL:()=> 'https://other.example/'}};await f.invoke('undo');assert.deepEqual(f.native,['undo:','redo:','undo:']);assert.equal(f.scripts.length,1);
  f.focused=undefined;await f.invoke('redo');assert.equal(f.native.at(-1),'redo:');
});
test('other platforms use the focused web contents standard editing fallback',async()=>{
  const f=await fixture('linux');f.handled=false;await f.invoke('undo');await f.invoke('redo');assert.deepEqual(f.native,['web:undo','web:redo']);
});
