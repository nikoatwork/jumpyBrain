import { media } from "./browser-design-system.js";
import { browserIcons } from "./browser-icons.js";
import { boardSettingsScript, boardSettingsStyles } from "./board-settings.js";
import { boardsSidebarScript, boardsSidebarStyles } from "./boards-sidebar.js";

// Self-contained so the same naming function can run in the browser shell.
export function createBoardName(existing: readonly string[], random = Math.random): string {
  const moods = ['Cozy', 'Sunny', 'Happy', 'Peppy', 'Merry', 'Little', 'Bright', 'Jolly'];
  const pursuits = ['Focus', 'Task', 'Progress', 'Goal', 'Sprint', 'Plan'];
  const friends = ['Foxes', 'Otters', 'Bees', 'Pandas', 'Bunnies', 'Penguins', 'Badgers', 'Sparrows'];
  const used = new Set(existing.map(name => name.trim().toLowerCase()));
  const names = moods.flatMap(mood => pursuits.flatMap(pursuit => friends.map(friend => `${mood} ${pursuit} ${friend}`)));
  const available = names.filter(name => !used.has(name.toLowerCase()));
  if (available.length) return available[Math.floor(random() * available.length)]!;
  const base = names[Math.floor(random() * names.length)]!;
  let suffix = 2;
  while (used.has(`${base} ${suffix}`.toLowerCase())) suffix++;
  return `${base} ${suffix}`;
}

export const boardsStyles = String.raw`
${boardSettingsStyles}
${boardsSidebarStyles}
#boards-view {padding:var(--space-6);overflow:auto;width:100%}
.board-header {display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6)}
.board-header h1 {min-width:0;overflow-wrap:anywhere;font:var(--weight-semibold) var(--text-heading)/var(--leading-heading) var(--font-ui);margin:0;flex:1}
.board-columns {display:grid;grid-template-columns:repeat(3,minmax(230px,1fr));gap:var(--space-5);align-items:start;padding-bottom:var(--space-5)}
.board-column {min-height:160px;border-radius:var(--radius-md)}
.board-column.drag-over {background:var(--surface-hover)}
.board-column-header {display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-3);color:var(--ink-soft);font-size:var(--text-ui)}
.board-column-header h2 {font:var(--weight-semibold) var(--text-ui)/var(--leading-ui) var(--font-ui);margin:0;flex:0 1 auto;min-width:0;overflow-wrap:anywhere}
.board-title-button {font:inherit;text-align:left;max-width:100%;overflow-wrap:anywhere}
.board-rename-input {width:100%;min-width:0;font:inherit}
.board-rename-input:focus-visible {outline:1px solid var(--focus-line);outline-offset:0}
.board-composer {margin-bottom:var(--space-3)}
.board-composer input {width:100%;min-width:0}
.board-composer [role=listbox] {max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:var(--space-1);margin-top:var(--space-2)}
.board-composer [role=option] {flex-shrink:0;white-space:normal;overflow-wrap:anywhere}
.board-composer-status {margin-top:var(--space-2)}
.board-composer-close {display:grid;margin-left:auto}
.board-card {--card-pad:var(--space-3);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--space-2);margin-bottom:var(--space-2)}
.board-card > button {--btn-ink:var(--ink);display:block;width:100%;min-width:0;min-height:var(--btn-size);padding:0;align-self:start;text-align:left;overflow-wrap:anywhere}
.board-card-title {display:block}
.board-card-preview {display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;margin-top:var(--space-1);color:var(--ink-faint);font-size:var(--text-caption);line-height:var(--leading-ui)}
.board-card-actions {flex-direction:column;gap:var(--space-1);align-self:start;pointer-events:none}
.board-card:is(:hover,:focus-within) .board-card-actions {opacity:1;pointer-events:auto}
#note-board-message:empty {display:none}
#board-notice {color:var(--ink-soft);font-size:var(--text-caption)}
#sidebar-boards-compatibility {margin:var(--space-2) var(--space-3);font-size:var(--text-caption)}
@media ${media.narrow} {.board-columns{grid-template-columns:1fr}.board-card-actions{opacity:1;pointer-events:auto}}
`;
export const boardsMarkup = String.raw`
<section id="boards-view" hidden aria-label="Board"><header class="board-header"><h1 id="board-title"></h1></header><p id="board-notice" role="status"></p><div id="board-columns" class="board-columns"></div></section>
<dialog id="note-board-dialog" class="dialog--sm" aria-labelledby="note-board-heading"><form id="note-board-form">
<h2 id="note-board-heading" class="dialog-title">Add to board</h2>
<label class="field">Board<select class="dropdown" id="note-board-select"></select></label>
<label class="field">Column<select class="dropdown" id="note-board-column"></select></label>
<p id="note-board-message" class="status-text" role="status"></p>
<div class="dialog-actions"><button type="button" class="quiet-button" id="note-board-cancel">Cancel</button><button class="button button-primary" id="note-board-add">Add note</button></div>
</form></dialog>`;
export const boardsScript = String.raw`
${boardSettingsScript}
${boardsSidebarScript}
${createBoardName.toString()}
const boardsUI = (() => {
  let formBusy=false, support='unknown';
  const unsupportedMessage='This server does not support boards yet. Update the remote server to use boards.';
  let packet = {boards:[],hashes:{}}, bound = '', busy = false, sequence = 0, selected = null, composer = null, rename = null, creation = null;
  const names = new Map(), previews = new Map(), pageStates = new Map();
  let titleSequence=0,titleController=null;
  const scope = () => companionRegistered && !companionSessionFailed ? String(companionState.generation)+':'+companionState.activeId : '';
  const sidebarUI=createBoardsSidebar({host:$('sidebar-boards'),boards:()=>bound===scope()?packet.boards:[],names,pageStates,
    scope:()=>{const active=companionState?.active;return companionRegistered&&active?JSON.stringify([companionState.activeId,active.kind,active.root||active.url]):'';},
    selected:()=>({board:selected,note:state.view==='note'?new URL(location.href).searchParams.get('note'):null}),
    disabled:()=>busy||formBusy||companionFrozen||!scope()||bound!==scope(),readOnly:()=>!accessOffered(),
    navigate:navigateSidebar,settle:id=>change(rows=>{rows.find(b=>b.id===id).archived=true;}),
    changed:()=>{settingsUI.render();void titles(scope(),sequence);}});
  const settingsUI=createBoardSettings({getBoards:()=>packet.boards,disabled:()=>support!=='supported'||busy||formBusy||companionFrozen||!scope()||bound!==scope(),readOnly:()=>!accessOffered(),denied:()=>accessDenied('Changing this board'),sidebar:sidebarUI,scope,change,open:id=>navigation.navigate('/?board='+id)});
  // kind: 'icon' (ghost icon button, glyph set by caller), 'plain' (transparent text row) or default (secondary).
  const button = (text, run, label, kind) => { const b=document.createElement('button');b.type='button';b.className=kind==='icon'?'icon-button':kind==='plain'?'quiet-button quiet-button--plain':'quiet-button';b.textContent=text;if(label){b.setAttribute('aria-label',label);if(kind==='icon')b.title=label;}b.onclick=run;return b; };
  const notice = text => { $('board-notice').textContent=text; toast.show('boards',text,{action:{label:'Retry',run:load}}); };
  function compatibilityMessage(host) {
    // Keep the retry control stable across background reads and failed retries.
    if(host.querySelector('[data-board-retry]'))return;
    const retry=button('Check again',load);retry.dataset.boardRetry='';host.replaceChildren(document.createTextNode(unsupportedMessage+' '),retry);
  }
  const compatibility=document.createElement('div');compatibility.id='sidebar-boards-compatibility';compatibility.className='callout';compatibility.setAttribute('role','status');compatibility.hidden=true;$('sidebar-boards').after(compatibility);
  function syncNote() {
    const host=$('note-board-memberships'),editor=state.editor;
    const id=state.view==='note'&&editor?.state.loaded&&!editor.state.cancelled?editor.state.documentId:null;
    const boards=id&&scope()&&bound===scope()&&support==='supported'?packet.boards.filter(b=>b.columns.some(c=>c.pages.includes(id))):[];
    const retained=new Set();
    for(const board of boards){
      let entry=Array.from(host.children).find(el=>el.dataset.boardId===board.id);
      if(!entry){entry=button('',()=>navigation.navigate('/?board='+board.id),'','plain');entry.classList.add('chip');entry.dataset.boardId=board.id;host.append(entry);}
      const name=board.name+(board.archived?' · Settled':'');
      if(entry.textContent!==name)entry.textContent=name;entry.title='Open board: '+name;entry.setAttribute('aria-label','Open board: '+name);
      entry.disabled=companionFrozen||!scope();retained.add(entry);
    }
    for(const entry of Array.from(host.children))if(!retained.has(entry))entry.remove();
    host.hidden=!boards.length;
  }
  function render() {
    syncNote();
    sidebarUI.render();if(support!=='unsupported')settingsUI.render();
    compatibility.hidden=support!=='unsupported';
    if(support==='unsupported'){compatibilityMessage(compatibility);compatibilityMessage($('settings-boards-list'));}
    // A role restriction leaves board controls available so that using one explains why.
    $('note-add-to-board').disabled=support!=='supported'||!accessOffered()||busy||formBusy||companionFrozen||!scope();
    for(const id of ['new-board','settings-new-board'])$(id).disabled=support!=='supported'||!accessOffered()||busy||formBusy||companionFrozen||!scope()||bound!==scope();
    const board=packet.boards.find(b=>b.id===selected), columns=$('board-columns');
    const available=board&&!board.archived;
    if(composer&&(!available||composer.boardId!==selected||composer.scope!==scope()))dismissComposer(false);
    if(rename&&(!available||rename.boardId!==selected||rename.scope!==scope()))rename=null;
    if(columns.dataset.board!==selected){columns.replaceChildren();columns.dataset.board=selected||'';}
    if(!selected){columns.replaceChildren();return;}
    if(support==='unsupported'){$('board-title').textContent='Boards unavailable';columns.replaceChildren();compatibilityMessage($('board-notice'));return;}
    renderTitle($('board-title'),board?.name||'Board unavailable',null,!!available);
    if(!available){columns.replaceChildren();$('board-notice').textContent=board?'Settled. Restore it in ':'Board unavailable. ';$('board-notice').append(button('Settings → Boards',()=>navigation.navigate('/settings?section=boards')));return;}
    board.columns.forEach((column,index)=>{
      let el=columns.children[index];
      if(!el){
        el=document.createElement('section');el.className='board-column';
        const head=document.createElement('div');head.className='board-column-header';const dot=document.createElement('span');dot.className='status-dot board-dot'+(index===1?' status-dot--accent':index===2?' status-dot--soft':'');dot.setAttribute('aria-hidden','true');
        const heading=document.createElement('h2');
        const add=button('',()=>openComposer(index),'Add note to '+column.name,'icon');add.innerHTML=${JSON.stringify(browserIcons.plus)};add.classList.add('board-add');
        head.append(dot,heading,add);const cards=document.createElement('div');cards.className='board-cards';el.append(head,cards);columns.append(el);
      }
      el.setAttribute('aria-label',column.name);
      const add=el.querySelector('.board-add');add.setAttribute('aria-label','Add note to '+column.name);add.title=add.getAttribute('aria-label');
      renderTitle(el.querySelector('h2'),column.name,index,true);
      const move=(id,before=null)=>{if(before===id)return;return change(rows=>{const b=rows.find(b=>b.id===selected);for(const c of b.columns)c.pages=c.pages.filter(p=>p!==id);const target=b.columns[index].pages;const at=before?target.indexOf(before):-1;target.splice(at<0?target.length:at,0,id);});};
      el.ondragover=e=>{e.preventDefault();el.classList.add('drag-over')};el.ondragleave=()=>el.classList.remove('drag-over');el.ondrop=e=>{e.preventDefault();el.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');if(board.columns.some(c=>c.pages.includes(id)))move(id,e.target.closest('[data-board-page]')?.dataset.boardPage);};
      const cards=el.querySelector('.board-cards');cards.replaceChildren();
      for(const id of column.pages){
        const card=document.createElement('div');card.className='board-card card card--raised';card.dataset.boardPage=id;card.draggable=accessOffered()&&!busy&&!formBusy;card.ondragstart=e=>{if(accessDenied('Moving this card'))e.preventDefault();else e.dataTransfer.setData('text/plain',id);};
        const open=button('',()=>navigation.navigate('/?note='+id),names.get(id)||'Loading page…','plain');
        const title=document.createElement('span');title.className='board-card-title';title.textContent=names.get(id)||'Loading page…';
        const preview=document.createElement('span');preview.className='board-card-preview';preview.textContent=previews.get(id)||'';preview.hidden=!preview.textContent;preview.id='board-preview-'+id;
        if(preview.textContent)open.setAttribute('aria-describedby',preview.id);
        open.setAttribute('aria-keyshortcuts','Alt+ArrowLeft Alt+ArrowRight');open.title='Open note · Alt+←/→ moves between columns';
        open.onkeydown=e=>{if(!e.altKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();if(accessDenied('Moving this card'))return;const target=index+(e.key==='ArrowRight'?1:-1);if(target<0||target>=board.columns.length)return;
          change(rows=>{const b=rows.find(b=>b.id===selected);for(const c of b.columns)c.pages=c.pages.filter(p=>p!==id);b.columns[target].pages.push(id);});};
        open.append(title,preview);card.append(open);
        const actions=document.createElement('div');actions.className='board-card-actions row-actions';
        const up=button('',()=>move(id,column.pages[Math.max(0,column.pages.indexOf(id)-1)]),'Move up','icon');up.innerHTML=${JSON.stringify(browserIcons.arrowUp)};up.classList.add('board-card-up');
        const remove=button('',()=>change(rows=>{rows.find(b=>b.id===selected).columns[index].pages=column.pages.filter(p=>p!==id);}),'Remove from board','icon');remove.innerHTML=${JSON.stringify(browserIcons.close)};
        actions.append(up,remove);card.append(actions);cards.append(card);
      }
    });
    for(const control of document.querySelectorAll('#boards-view button,#boards-view select'))control.disabled=busy||formBusy||companionFrozen||!scope()||(!accessOffered()&&!control.classList.contains('sidebar-page-link')&&!control.closest('.board-card')?.firstElementChild?.isSameNode(control));
    if(rename)rename.input.readOnly=busy||formBusy||companionFrozen;
    if(composer)renderComposer(composer);
  }
  function renderTitle(host,name,index,enabled) {
    host.setAttribute('aria-label',name);
    if(rename&&rename.index===index&&rename.boardId===selected)return;
    let title=host.querySelector('button');
    if(!title){host.replaceChildren();title=button(name,()=>startRename(host,index),'Rename '+(index===null?'board':'column'),'plain');title.classList.add('board-title-button');host.append(title);}
    title.textContent=name;title.disabled=!accessOffered()||!enabled||busy||formBusy||companionFrozen;title.title=name;
  }
  function startRename(host,index) {
    if(busy||formBusy||companionFrozen||rename||accessDenied(index===null?'Renaming this board':'Renaming this column'))return;
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
  async function load(){const s=scope();if(!s)return;if(bound!==s){bound=s;support='unknown';packet={boards:[],hashes:{}};names.clear();previews.clear();pageStates.clear();dismissComposer(false);rename=null;creation=null;render();}const token=++sequence;
    try{const p=await graphJson('/memories/all/boards');if(s!==scope()||token!==sequence)return;const recovered=support==='unsupported';support='supported';packet=p;if(recovered)$('board-notice').textContent='';render();await titles(s,token);return true;}
    catch(e){if(s!==scope()||token!==sequence)return;
      // Only the collection read establishes feature support. A missing note or
      // individual board, authentication failure, or temporary outage does not.
      if(e.status===404||e.status===405){support='unsupported';packet={boards:[],hashes:{}};names.clear();previews.clear();pageStates.clear();dismissComposer(false);rename=null;creation=null;toast.clear('boards');render();}
      else notice(e.code==='backend_version_mismatch'?companionConnectionNotice(companionState?.active,e.code).text:'Could not load boards. Try again.');
    }
  }
  async function titles(s,token){
    titleController?.abort();const revision=++titleSequence;
    if(!s||s!==bound)return;
    titleController=new AbortController();const signal=titleController.signal;
    const ids=[...new Set([...packet.boards.filter(b=>b.id===selected&&!b.archived).flatMap(b=>b.columns.flatMap(c=>c.pages)),...sidebarUI.visiblePageIds()])];
    const current=()=>s===scope()&&token===sequence&&revision===titleSequence;
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{
      while(cursor<ids.length&&current()){
        const id=ids[cursor++];
        try{const page=await graphJson(memoryDocumentPath(id),{signal});if(!current())return;names.set(id,page.title||'Untitled');pageStates.delete(id);previews.set(id,JumpyBrainBrowser.readablePreview(page.content||'',page.title||''));}
        catch(e){if(!current())return;names.set(id,e.status===404?'Page missing':'Page unavailable');pageStates.set(id,e.status===404?'missing':'unavailable');previews.delete(id);}
        sidebarUI.render();
      }
    }));
    if(current())render();
  }
  async function change(update){
    // Every board change passes here: a role restriction stops it and says why.
    if(support!=='supported'||busy||(!formBusy&&companionFrozen)||!scope()||bound!==scope()||accessDenied('Changing this board'))return false;
    const s=scope(), rows=structuredClone(packet.boards);update(rows);
    const changed=rows.filter(board=>JSON.stringify(board)!==JSON.stringify(packet.boards.find(old=>old.id===board.id)));
    const removed=packet.boards.filter(board=>!rows.some(next=>next.id===board.id));
    if(changed.length+removed.length===0)return true;
    if(changed.length+removed.length!==1){notice('Change one board at a time.');return false;}
    const board=changed[0]||removed[0], previous=packet.boards.find(old=>old.id===board.id), deleting=removed.length===1;
    const method=deleting?'DELETE':previous?'PUT':'POST', route='/memories/all/boards'+(previous?'/'+board.id:'');
    const headers={'Content-Type':'application/json',...(previous?{'If-Match':packet.hashes[board.id]}:{})};
    busy=true;++sequence;render();
    try{
      const p=await graphJson(route,{method,headers,...(deleting?{}:{body:JSON.stringify(board)})});
      if(s!==scope())return false;
      packet.boards=packet.boards.filter(old=>old.id!==board.id);
      if(deleting)delete packet.hashes[board.id];else {packet.boards.push(p.board);packet.hashes[board.id]=p.contentHash;}
      packet.boards.sort((a,b)=>a.id.localeCompare(b.id));$('board-notice').textContent='';return true;
    }catch(e){if(s===scope()){notice(e.status===409?'Board changed elsewhere. Reloaded; try again.':'Could not save. Reload and try again.');await load();}return false;}
    finally{busy=false;if(s===scope())render();}
  }
  function dismissComposer(restore=true) {
    const current=composer;if(!current)return;current.search.cancel();composer=null;current.el.remove();
    if(restore&&current.scope===scope())$('board-columns').children[current.index]?.querySelector('.board-add')?.focus();
  }
  function openComposer(index) {
    if(support!=='supported'||accessDenied('Adding a note to this board'))return;
    if(busy||formBusy||companionFrozen||!scope())return;
    if(composer?.index===index){composer.input.focus();return;}
    dismissComposer(false);
    const el=document.createElement('div');el.className='board-composer card card--compact';
    const input=document.createElement('input');input.className='input--bare';input.placeholder='Search or create note…';input.setAttribute('aria-label','Search or create note');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','true');input.setAttribute('aria-controls','board-note-results');input.autocomplete='off';input.maxLength=100;
    const list=document.createElement('div');list.id='board-note-results';list.setAttribute('role','listbox');list.setAttribute('aria-label','Notes and creation');
    const status=document.createElement('p');status.className='board-composer-status status-text status-text--caption';status.id='board-composer-status';status.setAttribute('role','status');input.setAttribute('aria-describedby',status.id);
    const close=button('',()=>dismissComposer(),'Close note composer','icon');close.innerHTML=${JSON.stringify(browserIcons.close)};close.classList.add('board-composer-close');el.append(close,input,list,status);
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
      if(!item){item=button(action.title,()=>{});item.className='menu-item';item.dataset.action=action.key;}
      item.textContent=action.title;item.onclick=()=>activateComposer(current,action);item.id='board-note-option-'+index;item.setAttribute('role','option');item.disabled=action.disabled;item.setAttribute('aria-disabled',String(!!action.disabled));item.setAttribute('aria-selected',String(action.key===current.action));item.onmousedown=e=>e.preventDefault();
      if(action.key===current.action)current.input.setAttribute('aria-activedescendant',item.id);if(current.list.children[index]!==item)current.list.insertBefore(item,current.list.children[index]||null);
    });
    current.list.setAttribute('aria-busy',String(search.status==='loading'));
    current.status.textContent=current.message||(search.status==='loading'?'Searching…':search.status==='error'||search.status==='auth'?search.message:search.query?(search.stale?'Search may not include recent notes. ':'')+(companionReadOnly()?'This brain is read only; board changes are disabled.':'↑ ↓ to choose · Enter to add · or choose Create'):'Search for a note to add.');
  }
  async function activateComposer(current,action) {
    if(companionReadOnly()||composer!==current||current.scope!==scope()||busy||formBusy||companionFrozen||action.disabled)return;
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
    && state.editor===noteDestination.editor && state.editor?.state.loaded && !state.editor.state.cancelled && !companionFrozen && !companionReadOnly();
  function destinationColumns() {
    const board=packet.boards.find(b=>b.id===$('note-board-select').value&&!b.archived);
    const columns=$('note-board-column');columns.replaceChildren();
    if(board)board.columns.forEach((column,index)=>{const option=document.createElement('option');option.value=index;option.textContent=column.name;columns.append(option);});
    JumpyBrainBrowser.prepareDropdown(columns);
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
    JumpyBrainBrowser.prepareDropdown(select);
    const choices=[...select.options].filter(o=>!o.disabled);select.value=choices.find(o=>o.value===previous)?.value||choices[0]?.value||'';
    select.disabled=!choices.length;destinationColumns();
  }
  $('note-add-to-board').hidden=false;
  $('note-add-to-board').onclick=async()=>{
    if(support!=='supported'||accessDenied('Adding this note to a board'))return;
    const editor=state.editor;
    if(busy||formBusy||companionFrozen||!scope()||state.view!=='note'||!editor?.state.loaded||editor.state.navigationPending||documentActions.isBusy())return;
    noteDestination={id:editor.state.documentId,editor,scope:scope()};
    $('note-board-dialog').showModal();$('note-board-add').disabled=true;$('note-board-select').disabled=true;$('note-board-column').disabled=true;
    $('note-board-select').replaceChildren();$('note-board-column').replaceChildren();$('note-board-message').textContent='Loading boards…';
    const loaded=await load();
    if(!destinationValid()||!$('note-board-dialog').open)return;
    if(!loaded){$('note-board-message').textContent=support==='unsupported'?unsupportedMessage:'Could not load boards. Close and try again.';return;}
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
    if(support!=='supported'||accessDenied('Creating a board'))return;
    if(busy||formBusy||companionFrozen||!scope()||bound!==scope())return;
    const s=scope();
    if(!creation)creation={schemaVersion:1,id:crypto.randomUUID(),name:createBoardName(packet.boards.map(b=>b.name)),archived:false,columns:['To do','Doing','Done'].map(name=>({name,pages:[]}))};
    // After a conflict, keep the pending identity but avoid a newly occupied name.
    if(!packet.boards.some(b=>b.id===creation.id)&&packet.boards.some(b=>b.name.trim().toLowerCase()===creation.name.toLowerCase()))creation.name=createBoardName(packet.boards.map(b=>b.name));
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
  return {syncNote,pending(){return busy||formBusy;},fence(){settingsUI.reset();dismissComposer(false);rename=null;render();},show(id){settingsUI.reset();$('note-board-dialog').close();if(id!==selected){dismissComposer(false);rename=null;}selected=id;$('boards-view').hidden=!id;load();},refresh:load};
})();
`;
