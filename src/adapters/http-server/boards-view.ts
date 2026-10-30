import { browserIcons } from "./browser-icons.js";
import { boardSettingsScript, boardSettingsStyles } from "./board-settings.js";

export const boardsStyles = String.raw`
${boardSettingsStyles}
#board-title button,.board-composer button,#board-navigation > button,.board-column-header button,.board-card > button,.board-add,.board-card-actions button {--quiet-fill:transparent;--quiet-hover:var(--hover-fill)}
.board-card > button {color:var(--ink);font-weight:var(--weight-regular);padding:0;min-height:var(--control-height);align-self:start}
.board-card-actions .note-icon {width:var(--control-compact);height:var(--control-compact);min-height:var(--control-compact);padding:var(--space-1);flex:none}
#sidebar-boards .sidebar-page > button {background:transparent}
#sidebar-boards .sidebar-page-link {display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
#sidebar-boards .sidebar-page > button:last-child {opacity:0}
#sidebar-boards .sidebar-page:hover > button:last-child,#sidebar-boards .sidebar-page:focus-within > button:last-child {opacity:1}
#boards-view { padding: var(--space-6); overflow:auto; width:100%; }
#boards-view[hidden] {display:none}
.board-header {display:flex;align-items:center;gap:12px;margin-bottom:28px}
.board-header h1 {min-width:0;overflow-wrap:anywhere;font:600 var(--text-heading)/1.3 var(--font-ui);margin:0;flex:1}
.board-columns {display:grid;grid-template-columns:repeat(3,minmax(230px,1fr));gap:20px;align-items:start;padding-bottom:20px}
.board-column {min-height:160px; border-radius:var(--radius-md)}
.board-column.drag-over {background:var(--surface-hover)}
.board-column-header {display:flex;align-items:center;gap:8px;margin-bottom:12px;color:var(--ink-soft);font-size:var(--text-ui)}
.board-dot {width:8px;height:8px;border-radius:50%;background:var(--ink-faint)}
.board-column:nth-child(2) .board-dot {background:var(--accent)}
.board-column:nth-child(3) .board-dot {background:var(--ink-soft)}
.board-column-header h2 {font:600 var(--text-ui)/1.5 var(--font-ui);margin:0;flex:1;min-width:0;overflow-wrap:anywhere}
.board-title-button {font:inherit;text-align:left;max-width:100%;overflow-wrap:anywhere}
.board-rename-input {width:100%;min-width:0;box-sizing:border-box;font:inherit}
.board-composer {padding:var(--space-2);margin-bottom:var(--space-3);border:1px solid var(--line);border-radius:var(--radius-md);background:var(--surface)}
.board-composer input {width:100%;min-width:0;box-sizing:border-box;background:transparent;box-shadow:none}
.board-composer input:focus-visible,.board-rename-input:focus-visible {outline:1px solid color-mix(in srgb,var(--focus-ring) 45%,var(--line-strong));outline-offset:0}
.board-composer [role=listbox] {max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:var(--space-1);margin-top:var(--space-2)}
.board-composer [role=option] {text-align:left;overflow-wrap:anywhere;white-space:normal;flex-shrink:0}
.board-composer [aria-selected=true] {background:var(--hover-fill);outline:1px solid var(--accent);outline-offset:-1px}
.board-composer-status {font-size:var(--text-caption);color:var(--ink-soft);margin:var(--space-2) 0 0}
.board-composer-close {display:block;margin-left:auto}
.board-card {display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--space-2);padding:var(--space-3);margin-bottom:var(--space-2);border:1px solid var(--line);border-radius:var(--radius-md);background:var(--surface);box-shadow:0 1px 2px #00000008}
.board-card > button {text-align:left;width:100%;min-width:0;line-height:var(--leading-ui);overflow-wrap:anywhere}
.board-card-title {display:block}
.board-card-preview {display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;margin-top:var(--space-1);color:var(--ink-faint);font-size:var(--text-caption);font-weight:var(--weight-regular);line-height:var(--leading-ui)}
.board-card-preview[hidden] {display:none}
.board-card-actions {display:flex;flex-direction:column;gap:var(--space-1);align-self:start;opacity:0;pointer-events:none}
.board-card:hover .board-card-actions,.board-card:focus-within .board-card-actions {opacity:1;pointer-events:auto}
.board-card-up svg {transform:rotate(90deg)}
@media(hover:none){.board-card-actions{opacity:1;pointer-events:auto}}
.board-add {flex:none;color:var(--ink-faint)}
#note-board-dialog {width:min(440px,calc(100vw - 32px));padding:24px;border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface);color:var(--ink)}
#note-board-dialog footer {display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
#note-board-dialog label {display:grid;gap:6px;margin:14px 0}
#note-board-dialog select {width:100%;max-width:100%}
#board-notice {color:var(--ink-soft);font-size:var(--text-caption)}
@media(max-width:680px){#boards-view{--control-compact:var(--control-touch);--control-height:var(--control-touch)}.board-columns{grid-template-columns:1fr}.board-card-actions{opacity:1;pointer-events:auto}}
`;
export const boardsMarkup = String.raw`
<section id="boards-view" hidden aria-label="Board"><header class="board-header"><h1 id="board-title"></h1></header><p id="board-notice" role="status"></p><div id="board-columns" class="board-columns"></div></section>
<dialog id="note-board-dialog" aria-labelledby="note-board-heading"><form id="note-board-form">
<h2 id="note-board-heading">Add to board</h2>
<label>Board<select class="dropdown" id="note-board-select"></select></label>
<label>Column<select class="dropdown" id="note-board-column"></select></label>
<p id="note-board-message" role="status"></p>
<footer><button type="button" class="quiet-button" id="note-board-cancel">Cancel</button><button class="quiet-button" id="note-board-add">Add note</button></footer>
</form></dialog>`;
export const boardsScript = String.raw`
${boardSettingsScript}
const boardsUI = (() => {
  let formBusy=false;
  let packet = {revision:0,boards:[]}, bound = '', busy = false, sequence = 0, selected = null, composer = null, rename = null, creation = null;
  const names = new Map(), previews = new Map();
  const scope = () => companionRegistered && !companionSessionFailed ? String(companionState.generation)+':'+companionState.activeId : '';
  const settingsUI=createBoardSettings({getBoards:()=>packet.boards,disabled:()=>busy||formBusy||companionFrozen||!scope()||bound!==scope(),scope,change,open:id=>navigation.navigate('/?board='+id)});
  const button = (text, run, label, icon = false) => { const b=document.createElement('button');b.type='button';b.className=icon?'quiet-button note-icon':'quiet-button';b.textContent=text;if(label)b.setAttribute('aria-label',label);b.onclick=run;return b; };
  const notice = text => { $('board-notice').textContent=text; toast.show('boards',text,{action:{label:'Retry',run:load}}); };
  function render() {
    const sidebar=$('sidebar-boards'); sidebar.replaceChildren();settingsUI.render();
    for(const b of packet.boards){
      if(!b.archived){const row=document.createElement('li');row.className='sidebar-page';const link=button(b.name,()=>navigation.navigate('/?board='+b.id));link.classList.add('sidebar-page-link');if(selected===b.id)link.setAttribute('aria-current','page');row.append(link,button('✓',()=>change(rows=>{rows.find(x=>x.id===b.id).archived=true;}),'Settle '+b.name,true));sidebar.append(row);}
    }
    for(const id of ['new-board','settings-new-board'])$(id).disabled=busy||formBusy||companionFrozen||!scope()||bound!==scope();
    for(const control of sidebar.querySelectorAll('button'))control.disabled=busy||formBusy||companionFrozen||!scope()||bound!==scope();
    const board=packet.boards.find(b=>b.id===selected), columns=$('board-columns');
    const available=board&&!board.archived;
    if(composer&&(!available||composer.boardId!==selected||composer.scope!==scope()))dismissComposer(false);
    if(rename&&(!available||rename.boardId!==selected||rename.scope!==scope()))rename=null;
    if(columns.dataset.board!==selected){columns.replaceChildren();columns.dataset.board=selected||'';}
    if(!selected){columns.replaceChildren();return;}
    renderTitle($('board-title'),board?.name||'Board unavailable',null,!!available);
    if(!available){columns.replaceChildren();$('board-notice').textContent=board?'Settled. Restore it in ':'Board unavailable. ';$('board-notice').append(button('Settings → Boards',()=>navigation.navigate('/settings?section=boards')));return;}
    board.columns.forEach((column,index)=>{
      let el=columns.children[index];
      if(!el){
        el=document.createElement('section');el.className='board-column';
        const head=document.createElement('div');head.className='board-column-header';const dot=document.createElement('span');dot.className='board-dot';
        const heading=document.createElement('h2'),count=document.createElement('span');count.className='board-count';
        const add=button('+',()=>openComposer(index),'Add note to '+column.name,true);add.classList.add('board-add');
        head.append(dot,heading,count,add);const cards=document.createElement('div');cards.className='board-cards';el.append(head,cards);columns.append(el);
      }
      el.setAttribute('aria-label',column.name);el.querySelector('.board-count').textContent=column.pages.length;
      el.querySelector('.board-add').setAttribute('aria-label','Add note to '+column.name);
      renderTitle(el.querySelector('h2'),column.name,index,true);
      const move=(id,before=null)=>{if(before===id)return;return change(rows=>{const b=rows.find(b=>b.id===selected);for(const c of b.columns)c.pages=c.pages.filter(p=>p!==id);const target=b.columns[index].pages;const at=before?target.indexOf(before):-1;target.splice(at<0?target.length:at,0,id);});};
      el.ondragover=e=>{e.preventDefault();el.classList.add('drag-over')};el.ondragleave=()=>el.classList.remove('drag-over');el.ondrop=e=>{e.preventDefault();el.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');if(board.columns.some(c=>c.pages.includes(id)))move(id,e.target.closest('[data-board-page]')?.dataset.boardPage);};
      const cards=el.querySelector('.board-cards');cards.replaceChildren();
      for(const id of column.pages){
        const card=document.createElement('div');card.className='board-card';card.dataset.boardPage=id;card.draggable=!busy&&!formBusy;card.ondragstart=e=>e.dataTransfer.setData('text/plain',id);
        const open=button('',()=>navigation.navigate('/?note='+id),names.get(id)||'Loading page…');
        const title=document.createElement('span');title.className='board-card-title';title.textContent=names.get(id)||'Loading page…';
        const preview=document.createElement('span');preview.className='board-card-preview';preview.textContent=previews.get(id)||'';preview.hidden=!preview.textContent;preview.id='board-preview-'+id;
        if(preview.textContent)open.setAttribute('aria-describedby',preview.id);
        open.setAttribute('aria-keyshortcuts','Alt+ArrowLeft Alt+ArrowRight');open.title='Open note · Alt+←/→ moves between columns';
        open.onkeydown=e=>{if(!e.altKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const target=index+(e.key==='ArrowRight'?1:-1);if(target<0||target>=board.columns.length)return;
          change(rows=>{const b=rows.find(b=>b.id===selected);for(const c of b.columns)c.pages=c.pages.filter(p=>p!==id);b.columns[target].pages.push(id);});};
        open.append(title,preview);card.append(open);
        const actions=document.createElement('div');actions.className='board-card-actions';
        const up=button('',()=>move(id,column.pages[Math.max(0,column.pages.indexOf(id)-1)]),'Move up',true);up.innerHTML=${JSON.stringify(browserIcons.back)};up.classList.add('board-card-up');
        const remove=button('',()=>change(rows=>{rows.find(b=>b.id===selected).columns[index].pages=column.pages.filter(p=>p!==id);}),'Remove from board',true);remove.innerHTML=${JSON.stringify(browserIcons.close)};
        actions.append(up,remove);card.append(actions);cards.append(card);
      }
    });
    for(const control of document.querySelectorAll('#boards-view button,#boards-view select,#sidebar-boards button'))control.disabled=busy||formBusy||companionFrozen||!scope();
    if(rename)rename.input.readOnly=busy||formBusy||companionFrozen;
    if(composer)renderComposer(composer);
  }
  function renderTitle(host,name,index,enabled) {
    host.setAttribute('aria-label',name);
    if(rename&&rename.index===index&&rename.boardId===selected)return;
    let title=host.querySelector('button');
    if(!title){host.replaceChildren();title=button(name,()=>startRename(host,index),'Rename '+(index===null?'board':'column'));title.classList.add('board-title-button');host.append(title);}
    title.textContent=name;title.disabled=!enabled||busy||formBusy||companionFrozen;title.title=name;
  }
  function startRename(host,index) {
    if(busy||formBusy||companionFrozen||rename)return;
    const board=packet.boards.find(b=>b.id===selected&&!b.archived);if(!board)return;
    const previous=index===null?board.name:board.columns[index].name,input=document.createElement('input');
    input.className='board-rename-input';input.maxLength=100;input.value=previous;input.setAttribute('aria-label',index===null?'Board name':'Column name');
    const current={boardId:selected,index,scope:scope(),input,saving:false};rename=current;host.replaceChildren(input);input.focus();input.select();
    const finish=async cancel=>{
      if(rename!==current||current.saving)return;
      const value=input.value.trim();
      if(cancel||!value||value===previous){rename=null;render();if(cancel)host.querySelector('button')?.focus();return;}
      if(/[\x00-\x1f]/.test(value)||value.length>100){notice('Use a name of 1–100 characters without control characters.');return;}
      current.saving=true;const ok=await change(rows=>{const b=rows.find(b=>b.id===current.boardId);if(index===null)b.name=value;else b.columns[index].name=value;});
      current.saving=false;if(rename!==current)return;if(ok){rename=null;render();}else input.readOnly=false;
    };
    input.onblur=()=>finish(false);input.onkeydown=e=>{if(e.isComposing)return;if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();finish(e.key==='Escape');}};
  }
  async function load(){const s=scope();if(!s)return;if(bound!==s){bound=s;packet={revision:0,boards:[]};names.clear();previews.clear();dismissComposer(false);rename=null;creation=null;render();}const token=++sequence;
    try{const p=await graphJson('/companion/collections',{headers:{'X-Collection-Brain':companionState.activeId}});if(s!==scope()||token!==sequence)return;packet=p;render();await titles(s,token);return true;}
    catch(e){if(s===scope()&&token===sequence)notice('Could not load boards. Try again.');}
  }
  async function titles(s,token,ids=[...new Set(packet.boards.filter(b=>b.id===selected&&!b.archived).flatMap(b=>b.columns.flatMap(c=>c.pages)))]){let cursor=0;await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{while(cursor<ids.length){const id=ids[cursor++];try{const page=await graphJson(memoryDocumentPath(id));if(s!==scope()||token!==sequence)return;names.set(id,page.title||'Untitled');previews.set(id,JumpyBrainBrowser.readablePreview(page.content||'',page.title||''));}catch(e){if(s!==scope()||token!==sequence)return;names.set(id,e.status===404?'Page missing':'Page unavailable');previews.delete(id);}}}));if(s===scope()&&token===sequence)render();}
  async function change(update){if(busy||(!formBusy&&companionFrozen)||!scope()||bound!==scope())return false;const s=scope();const rows=structuredClone(packet.boards);update(rows);busy=true;++sequence;render();try{const p=await graphJson('/companion/collections',{method:'POST',headers:{'Content-Type':'application/json','X-Collection-Brain':companionState.activeId},body:JSON.stringify({revision:packet.revision,boards:rows})});if(s!==scope())return false;packet=p;$('board-notice').textContent='';return true;}catch(e){if(s===scope()){notice(e.status===409?'Boards changed elsewhere. Reloaded; try again.':'Could not save. Reload and try again.');await load();}return false;}finally{busy=false;if(s===scope())render();}}
  function dismissComposer(restore=true) {
    const current=composer;if(!current)return;current.search.cancel();composer=null;current.el.remove();
    if(restore&&current.scope===scope())$('board-columns').children[current.index]?.querySelector('.board-add')?.focus();
  }
  function openComposer(index) {
    if(busy||formBusy||companionFrozen||!scope())return;
    if(composer?.index===index){composer.input.focus();return;}
    dismissComposer(false);
    const el=document.createElement('div');el.className='board-composer';
    const input=document.createElement('input');input.placeholder='Search or create note…';input.setAttribute('aria-label','Search or create note');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','true');input.setAttribute('aria-controls','board-note-results');input.autocomplete='off';input.maxLength=100;
    const list=document.createElement('div');list.id='board-note-results';list.setAttribute('role','listbox');list.setAttribute('aria-label','Notes and creation');
    const status=document.createElement('p');status.className='board-composer-status';status.id='board-composer-status';status.setAttribute('role','status');input.setAttribute('aria-describedby',status.id);
    const close=button('×',()=>dismissComposer(),'Close note composer',true);close.classList.add('board-composer-close');el.append(close,input,list,status);
    const current={el,input,list,status,close,index,boardId:selected,scope:scope(),action:null,actions:[],attempt:null,message:''};composer=current;
    current.search=createNoteSearch({fetch:searchMemoryNotes,resultLimit:8,retainResultsWhileLoading:true,abortController:()=>new AbortController(),setTimer:(run,delay)=>setTimeout(run,delay),clearTimer:timer=>clearTimeout(timer),onChange:()=>{if(composer===current){current.action=null;renderComposer(current);}}});
    input.oninput=()=>{current.message='';current.search.query(input.value);};
    el.onkeydown=e=>{
      if(e.isComposing)return;
      if(e.key==='Escape'){e.preventDefault();if(!formBusy)dismissComposer();return;}
      if(e.target!==input)return;
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();const choices=current.actions.filter(a=>!a.disabled);if(!choices.length)return;
        const at=choices.findIndex(a=>a.key===current.action),delta=e.key==='ArrowDown'?1:-1;
        current.action=choices[(at<0?(delta>0?0:choices.length-1):(at+delta+choices.length)%choices.length)].key;renderComposer(current);$(input.getAttribute('aria-activedescendant'))?.scrollIntoView({block:'nearest'});
      }else if(e.key==='Enter'){e.preventDefault();const action=current.actions.find(a=>a.key===current.action&&!a.disabled);if(action)activateComposer(current,action);}
    };
    $('board-columns').children[index].insertBefore(el,$('board-columns').children[index].querySelector('.board-cards'));renderComposer(current);input.focus();
  }
  function renderComposer(current) {
    if(composer!==current)return;
    const search=current.search.state,board=packet.boards.find(b=>b.id===current.boardId),locked=busy||formBusy||companionFrozen;
    current.input.readOnly=locked||!!current.attempt;current.close.disabled=locked;
    const actions=[];
    if(current.attempt){actions.push({key:'retry',title:current.attempt.id?'Retry adding created note':'Retry creation',disabled:locked||(!current.attempt.id&&companionReadOnly())});}
    else {
      for(const result of search.results){if(!result.documentId)continue;const added=board?.columns.some(c=>c.pages.includes(result.documentId));actions.push({key:result.documentId,id:result.documentId,title:result.title+(added?' · Added':''),name:result.title,disabled:locked||added||search.status==='loading'});}
      if(search.query)actions.push({key:'create',title:'Create “'+search.query+'”',disabled:locked||companionReadOnly()||search.status==='loading'});
      if(search.status==='error'||search.status==='auth')actions.push({key:'search',title:'Retry search',disabled:locked});
    }
    current.actions=actions;
    if(!actions.some(a=>a.key===current.action&&!a.disabled))current.action=actions.find(a=>a.id&&!a.disabled)?.key||null;
    current.input.removeAttribute('aria-activedescendant');
    // Keep eligible option nodes stable too: a refresh must not drop Tab focus.
    for(const item of [...current.list.children])if(!actions.some(a=>a.key===item.dataset.action))item.remove();
    actions.forEach((action,index)=>{
      let item=[...current.list.children].find(item=>item.dataset.action===action.key);
      if(!item){item=button(action.title,()=>{});item.dataset.action=action.key;}
      item.textContent=action.title;item.onclick=()=>activateComposer(current,action);item.id='board-note-option-'+index;item.setAttribute('role','option');item.disabled=action.disabled;item.setAttribute('aria-disabled',String(!!action.disabled));item.setAttribute('aria-selected',String(action.key===current.action));item.onmousedown=e=>e.preventDefault();
      if(action.key===current.action)current.input.setAttribute('aria-activedescendant',item.id);if(current.list.children[index]!==item)current.list.insertBefore(item,current.list.children[index]||null);
    });
    current.list.setAttribute('aria-busy',String(search.status==='loading'));
    current.status.textContent=current.message||(search.status==='loading'?'Searching…':search.status==='error'||search.status==='auth'?search.message:search.query?(search.stale?'Search may not include recent notes. ':'')+(companionReadOnly()?'Read-only brain: choose an existing note.':'↑ ↓ to choose · Enter to add · or choose Create'):'Search for a note to add.');
  }
  async function activateComposer(current,action) {
    if(composer!==current||current.scope!==scope()||busy||formBusy||companionFrozen||action.disabled)return;
    if(action.key==='search'){current.search.query(current.input.value,true);return;}
    if(action.key==='create'&&companionReadOnly())return;
    if(action.key==='create')current.attempt={key:crypto.randomUUID(),body:JSON.stringify({type:'note',title:current.input.value.trim(),body:'',actor:browserActor}),title:current.input.value.trim(),id:null};
    if(current.el.contains(document.activeElement))current.input.focus({preventScroll:true});
    formBusy=true;current.message=action.id?'Adding…':current.attempt?.id?'Adding created note…':'Creating…';render();
    try {
      let id=action.id;
      if(current.attempt){
        if(!current.attempt.id){
          const p=await graphJson('/memories/all/notes',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':current.attempt.key},body:current.attempt.body});
          if(current.scope!==scope())return;
          if(!isValidMemoryDocumentId(p?.id))throw new Error('Invalid creation result');current.attempt.id=p.id;
          recentWrites.remember({id:p.id,title:current.attempt.title,body:'',file:p.file||''});
        }
        id=current.attempt.id;names.set(id,current.attempt.title);
      }else names.set(id,action.name);
      if(current.scope!==scope())return;
      const added=await addToBoard(current.boardId,current.index,id);
      if(composer!==current||current.scope!==scope())return;
      if(added){current.attempt=null;current.input.value='';current.search.query('');current.message='Added to board.';}
      else current.message=current.attempt?.id?'Note created, but not added to this board. Retry adding the created note.':'Not added. Boards reloaded; choose the note again to retry.';
    }catch{if(composer===current)current.message='Could not confirm creation. Retry uses the same note request.';}
    finally{formBusy=false;if(current.scope===scope())render();}
  }
  async function addToBoard(boardId,index,id) {
    const board=packet.boards.find(b=>b.id===boardId&&!b.archived);
    if(!board||!board.columns[index])return Promise.resolve(false);
    if(board.columns.some(c=>c.pages.includes(id)))return Promise.resolve(true);
    const added=await change(rows=>{const b=rows.find(b=>b.id===boardId);if(!b.columns.some(c=>c.pages.includes(id)))b.columns[index].pages.push(id);});
    if(added&&selected===boardId)void titles(scope(),sequence,[id]);
    return added;
  }
  let noteDestination=null;
  const destinationValid=()=>noteDestination && noteDestination.scope===scope() && state.view==='note'
    && state.editor===noteDestination.editor && state.editor?.state.loaded && !state.editor.state.cancelled && !companionFrozen;
  function destinationColumns() {
    const board=packet.boards.find(b=>b.id===$('note-board-select').value&&!b.archived);
    const columns=$('note-board-column');columns.replaceChildren();
    if(board)board.columns.forEach((column,index)=>{const option=document.createElement('option');option.value=index;option.textContent=column.name;columns.append(option);});
    const added=board?.columns.some(c=>c.pages.includes(noteDestination?.id));
    $('note-board-add').disabled=!destinationValid()||!board||added||busy;
    $('note-board-column').disabled=!board||added||busy;
    $('note-board-message').textContent=added?'Already on this board.':board?'':packet.boards.some(b=>!b.archived)?'This note is already on your boards.':'Create a board from the sidebar first.';
  }
  function destinationBoards() {
    const select=$('note-board-select'),previous=select.value;select.replaceChildren();
    for(const board of packet.boards.filter(b=>!b.archived)){
      const option=document.createElement('option');option.value=board.id;const added=board.columns.some(c=>c.pages.includes(noteDestination?.id));
      option.textContent=board.name+(added?' · Added':'');option.disabled=added;select.append(option);
    }
    const choices=[...select.options].filter(o=>!o.disabled);select.value=choices.find(o=>o.value===previous)?.value||choices[0]?.value||'';
    select.disabled=!choices.length;destinationColumns();
  }
  $('note-add-to-board').hidden=false;
  $('note-add-to-board').onclick=async()=>{
    const editor=state.editor;
    if(busy||formBusy||companionFrozen||!scope()||state.view!=='note'||!editor?.state.loaded||editor.state.navigationPending||documentActions.isBusy())return;
    noteDestination={id:editor.state.documentId,editor,scope:scope()};
    $('note-board-dialog').showModal();$('note-board-add').disabled=true;$('note-board-select').disabled=true;$('note-board-column').disabled=true;
    $('note-board-select').replaceChildren();$('note-board-column').replaceChildren();$('note-board-message').textContent='Loading boards…';
    const loaded=await load();
    if(!destinationValid()||!$('note-board-dialog').open)return;
    if(!loaded){$('note-board-message').textContent='Could not load boards. Close and try again.';return;}
    destinationBoards();($('note-board-select').disabled?$('note-board-cancel'):$('note-board-select')).focus();
  };
  $('note-board-select').onchange=destinationColumns;
  $('note-board-cancel').onclick=()=>$('note-board-dialog').close();
  $('note-board-dialog').addEventListener('close',()=>{if(destinationValid())$('note-add-to-board').focus({preventScroll:true});noteDestination=null;});
  $('note-board-form').onsubmit=async event=>{
    event.preventDefault();if(!destinationValid()||busy||$('note-board-add').disabled)return;
    const current=noteDestination,boardId=$('note-board-select').value,index=Number($('note-board-column').value);
    $('note-board-add').disabled=true;$('note-board-message').textContent='Adding…';
    const added=await addToBoard(boardId,index,current.id);
    if(noteDestination!==current||!destinationValid())return;
    if(added){$('note-board-dialog').close();toast.show('boards','Added to board.');}
    else {destinationBoards();$('note-board-message').textContent='Not added. Check your connection or board selection and retry.';}
  };
  const create=async()=>{
    if(busy||formBusy||companionFrozen||!scope()||bound!==scope())return;
    const s=scope();
    if(!creation){let name='Untitled board',suffix=2;const used=new Set(packet.boards.map(b=>b.name));while(used.has(name))name='Untitled board '+suffix++;creation={id:crypto.randomUUID(),name,archived:false,columns:['To do','Doing','Done'].map(name=>({name,pages:[]}))};}
    const current=creation;formBusy=true;render();
    try{
      const ok=packet.boards.some(b=>b.id===current.id)||await change(rows=>rows.push(current));
      if(s!==scope())return;
      // A lost POST response may have been confirmed by change()'s recovery read.
      if(ok||packet.boards.some(b=>b.id===current.id)){creation=null;await navigation.navigate('/?board='+current.id);}
    }finally{formBusy=false;if(s===scope())render();}
  };
  $('new-board').onclick=create;$('settings-new-board').onclick=create;
  window.addEventListener('pagehide',()=>dismissComposer(false));
  window.addEventListener('focus',()=>{if(!$('note-board-dialog').open&&!busy&&!formBusy)load();});
  return {pending(){return busy||formBusy;},fence(){settingsUI.reset();dismissComposer(false);rename=null;render();},show(id){settingsUI.reset();$('note-board-dialog').close();if(id!==selected){dismissComposer(false);rename=null;}selected=id;$('boards-view').hidden=!id;load();},refresh:load};
})();
`;
