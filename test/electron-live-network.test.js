import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {isAppNavigation,isFeedbackMailto,isFeedbackDownload} from '../integrations/electron/host.mjs';
import {nativeUpdateAction} from '../integrations/electron/update-inline.mjs';

const moduleUrl=new URL('../integrations/electron/window.mjs',import.meta.url);
async function fixture(origin='http://127.0.0.1:3787'){
  const session=new EventEmitter(),contents=new EventEmitter();let beforeRequest,windowOptions,windowOpen;
  session.webRequest={onBeforeRequest(callback){beforeRequest=callback;}};
  session.setPermissionRequestHandler=callback=>{session.permissionRequest=callback;};
  session.setPermissionCheckHandler=callback=>{session.permissionCheck=callback;};
  Object.assign(contents,{session,getURL:()=>origin+'/',isDestroyed:()=>false,executeJavaScript:async()=>true,setWindowOpenHandler:callback=>{windowOpen=callback;}});
  class BrowserWindow extends EventEmitter{constructor(options){super();windowOptions=options;this.webContents=contents;}loadURL(){return Promise.resolve();}isDestroyed(){return false;}show(){}}
  const source=(await readFile(moduleUrl,'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(moduleUrl.href));
  const context={BrowserWindow,dialog:{},Menu:{},MenuItem:class{},shell:{},fileURLToPath,URL,process:{platform:process.platform},setInterval,clearInterval,installStarterPin(){},createSystemMessages:()=>()=>{},installBackNavigation(){},mountInlineUpdates(){},nativeUpdateAction,isAppNavigation,isFeedbackMailto,isFeedbackDownload};
  vm.runInNewContext(source+'\nglobalThis.openEditor=createEditorWindow;',context,{filename:moduleUrl.pathname});
  const opened=context.openEditor({origin,key:'example-bootstrap-fixture'});await opened.loaded;
  const request=(url,resourceType='webSocket')=>{let result;beforeRequest({url,resourceType},decision=>{result=decision.cancel;});assert.equal(typeof result,'boolean');return !result;};
  return {request,contents,session,options:windowOptions,windowOpen:()=>windowOpen()};
}
test('actual editor webRequest callback allows only the owned protocol-paired live endpoint',async()=>{
  const local=await fixture();assert.equal(local.request('ws://127.0.0.1:3787/ws'),true);
  assert.equal(local.request('ws://127.0.0.1:3787/ws','xhr'),false,'The exception is for WebSocket resources only.');
  for(const url of [
    'ws://127.0.0.1:3787/ws?token=example-fixture', 'ws://127.0.0.1:3787/ws?apiKey=example-fixture',
    'ws://example-user:example-password@127.0.0.1:3787/ws', 'ws://example-user@127.0.0.1:3787/ws',
    'ws://127.0.0.1:3787/ws#example-fragment', 'ws://127.0.0.1:3787/ws?', 'ws://127.0.0.1:3787/ws#',
    'ws://127.0.0.1:3787/ws/', 'ws://127.0.0.1:3787/WS', 'ws://127.0.0.1:3787/other',
    'ws://127.0.0.1:3787/./ws', 'ws://127.0.0.1:3787/%77s', 'ws://127.0.0.1:3788/ws',
    'ws://localhost:3787/ws', 'ws://outside.example/ws', 'wss://127.0.0.1:3787/ws',
    'wss://outside.example/ws', 'file:///ws', 'data:text/plain,fixture', 'not a URL',
  ])assert.equal(local.request(url),false,url);
  const secure=await fixture('https://127.0.0.1:8443');assert.equal(secure.request('wss://127.0.0.1:8443/ws'),true);
  for(const url of ['ws://127.0.0.1:8443/ws','wss://127.0.0.1:8444/ws','wss://outside.example:8443/ws'])assert.equal(secure.request(url),false,url);
});
test('live exception retains gateway HTTP assets, navigation denial, sandbox and permission policy',async()=>{
  const editor=await fixture();
  for(const url of ['http://127.0.0.1:3787/','http://127.0.0.1:3787/graph','http://127.0.0.1:3787/memories/all/recent?limit=8','blob:http://127.0.0.1:3787/example-feedback'])assert.equal(editor.request(url,'xhr'),true,url);
  for(const url of ['https://127.0.0.1:3787/','http://127.0.0.1:3788/','http://outside.example/'])assert.equal(editor.request(url,'xhr'),false,url);
  assert.equal(editor.options.webPreferences.sandbox,true);assert.equal(editor.options.webPreferences.contextIsolation,true);assert.equal(editor.options.webPreferences.nodeIntegration,false);assert.equal(editor.options.webPreferences.webSecurity,true);assert.equal(editor.options.webPreferences.preload,undefined);
  assert.equal(editor.windowOpen().action,'deny');
  for(const url of ['ws://127.0.0.1:3787/ws','wss://outside.example/ws','http://outside.example/']){let blocked=false;editor.contents.emit('will-navigate',{preventDefault(){blocked=true;}},url);assert.equal(blocked,true,url);}
  let blocked=false;editor.contents.emit('will-navigate',{preventDefault(){blocked=true;}},'http://127.0.0.1:3787/graph');assert.equal(blocked,false);
  assert.equal(editor.session.permissionCheck(editor.contents,'clipboard-sanitized-write','http://127.0.0.1:3787/',{isMainFrame:true}),true);
  assert.equal(editor.session.permissionCheck(editor.contents,'clipboard-read','http://127.0.0.1:3787/',{isMainFrame:true}),false);
  assert.equal(editor.session.permissionCheck(editor.contents,'clipboard-sanitized-write','http://outside.example/',{isMainFrame:true}),false);
});
