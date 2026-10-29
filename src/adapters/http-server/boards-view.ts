export const boardsStyles = String.raw`
#board-navigation > button,.board-column-header button,.board-card > button,.board-add {background:transparent}
.board-card > button {color:var(--ink);font-weight:500;padding:0;min-height:28px}
.board-card-actions button,.board-card-actions select {min-height:24px;padding:2px 6px}
#sidebar-boards .sidebar-page > button:last-child {opacity:0}
#sidebar-boards .sidebar-page:hover > button:last-child,#sidebar-boards .sidebar-page:focus-within > button:last-child {opacity:1}
#boards-view { padding: var(--space-6); overflow:auto; width:100%; }
#boards-view[hidden] {display:none}
.board-header {display:flex;align-items:center;gap:12px;margin-bottom:28px}
.board-header h1 {font:600 var(--text-heading)/1.3 var(--font-ui);margin:0;flex:1}
.board-columns {display:grid;grid-template-columns:repeat(3,minmax(230px,1fr));gap:20px;align-items:start;padding-bottom:20px}
.board-column {min-height:160px; border-radius:var(--radius-md)}
.board-column.drag-over {background:var(--surface-hover)}
.board-column-header {display:flex;align-items:center;gap:8px;margin-bottom:12px;color:var(--ink-soft);font-size:var(--text-ui)}
.board-dot {width:8px;height:8px;border-radius:50%;background:var(--ink-faint)}
.board-column:nth-child(2) .board-dot {background:var(--accent)}
.board-column:nth-child(3) .board-dot {background:var(--ink-soft)}
.board-column-header button {font-weight:600;flex:1;text-align:left}
.board-card {padding:12px;margin-bottom:8px;border:1px solid var(--line);border-radius:var(--radius-md);background:var(--surface);box-shadow:0 1px 2px #00000008}
.board-card > button {text-align:left;width:100%;line-height:1.5;overflow-wrap:anywhere}
.board-card-actions {display:flex;gap:4px;margin-top:8px;opacity:0}
.board-card:hover .board-card-actions,.board-card:focus-within .board-card-actions {opacity:1}
.board-card-actions select {max-width:140px;font-size:var(--text-caption)}
.board-card-actions button {font-size:var(--text-caption)}
.board-add {width:100%;text-align:left;color:var(--ink-faint)}
.board-row {display:flex;align-items:center;gap:8px;min-height:44px;border-bottom:1px solid var(--line)}
.board-row > :first-child {flex:1;text-align:left;overflow-wrap:anywhere}
#board-dialog, #note-board-dialog {width:min(440px,calc(100vw - 32px));padding:24px;border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface);color:var(--ink)}
#board-dialog input {width:100%;box-sizing:border-box;margin:12px 0}
#board-dialog-results {max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:4px}
#board-dialog-results button {text-align:left}
#board-dialog footer, #note-board-dialog footer {display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
#note-add-to-board {align-self:flex-end;margin-top:8px}
#note-board-dialog label {display:grid;gap:6px;margin:14px 0}
#note-board-dialog select {width:100%;max-width:100%}
#board-notice {color:var(--ink-soft);font-size:var(--text-caption)}
@media(max-width:680px){.board-columns{grid-template-columns:1fr}.board-card-actions{opacity:1}}
`;
export const boardsMarkup = String.raw`
<section id="boards-view" hidden aria-label="Board"><header class="board-header"><h1 id="board-title"></h1><button class="quiet-button" id="board-rename">Rename</button></header><p id="board-notice" role="status"></p><div id="board-columns" class="board-columns"></div></section>
<dialog id="board-dialog"><form id="board-dialog-form"><h2 id="board-dialog-title"></h2><input id="board-dialog-input" aria-label="Name" maxlength="100" autocomplete="off" required><div id="board-dialog-results"></div><p id="board-dialog-status" role="status"></p><footer><button type="button" class="quiet-button" id="board-dialog-cancel">Cancel</button><button class="quiet-button" id="board-dialog-submit">Save</button></footer></form></dialog>
<dialog id="note-board-dialog" aria-labelledby="note-board-heading"><form id="note-board-form">
<h2 id="note-board-heading">Add to board</h2>
<label>Board<select class="dropdown" id="note-board-select"></select></label>
<label>Column<select class="dropdown" id="note-board-column"></select></label>
<p id="note-board-message" role="status"></p>
<footer><button type="button" class="quiet-button" id="note-board-cancel">Cancel</button><button class="quiet-button" id="note-board-add">Add note</button></footer>
</form></dialog>`;
export const boardsScript = String.raw`
const boardsUI = (() => {
  let formBusy=false;
  let packet = {revision:0,boards:[]}, bound = '', busy = false, sequence = 0, selected = null, edit = null, searchSequence = 0;
  const names = new Map();
  const scope = () => companionRegistered && !companionSessionFailed ? String(companionState.generation)+':'+companionState.activeId : '';
  const button = (text, run, label) => { const b=document.createElement('button');b.type='button';b.className='quiet-button';b.textContent=text;if(label)b.setAttribute('aria-label',label);b.onclick=run;return b; };
  const notice = text => { $('board-notice').textContent=text; toast.show('boards',text,{action:{label:'Retry',run:load}}); };
  function render() {
    const sidebar=$('sidebar-boards'), settings=$('settings-boards-list'); sidebar.replaceChildren();settings.replaceChildren();
    for(const b of packet.boards){
      if(!b.archived){const row=document.createElement('li');row.className='sidebar-page';const link=button(b.name,()=>navigation.navigate('/?board='+b.id));link.classList.add('sidebar-page-link');if(selected===b.id)link.setAttribute('aria-current','page');row.append(link,button('✓',()=>change(rows=>{rows.find(x=>x.id===b.id).archived=true;}),'Settle '+b.name));sidebar.append(row);}
      const row=document.createElement('div');row.className='board-row';row.append(button(b.name,()=>navigation.navigate('/?board='+b.id)),button(b.archived?'Restore':'Settle',()=>change(rows=>{rows.find(x=>x.id===b.id).archived=!b.archived;}),(b.archived?'Restore ':'Settle ')+b.name));settings.append(row);
    }
    if(!packet.boards.length)settings.textContent='Your boards will live here.';
    const board=packet.boards.find(b=>b.id===selected); const columns=$('board-columns');columns.replaceChildren();
    $('board-rename').disabled=busy||!board||board.archived;
    if(!selected)return;
    $('board-title').textContent=board?.name||'Board unavailable';
    if(!board||board.archived){$('board-notice').textContent=board?'Settled. Restore it in Settings → Boards.':'Reload to check this board.';return;}
    $('board-notice').textContent='';
    board.columns.forEach((column,index)=>{
      const el=document.createElement('section');el.className='board-column';el.setAttribute('aria-label',column.name);
      const head=document.createElement('div');head.className='board-column-header';const dot=document.createElement('span');dot.className='board-dot';const count=document.createElement('span');count.textContent=column.pages.length;head.append(dot,button(column.name,()=>dialog('Rename column',column.name,value=>change(rows=>{rows.find(b=>b.id===selected).columns[index].name=value;}))),count);el.append(head);
      const move=(id,before=null)=>{if(before===id)return;return change(rows=>{const b=rows.find(b=>b.id===selected);for(const c of b.columns)c.pages=c.pages.filter(p=>p!==id);const target=b.columns[index].pages;const at=before?target.indexOf(before):-1;target.splice(at<0?target.length:at,0,id);});};
      el.ondragover=e=>{e.preventDefault();el.classList.add('drag-over')};el.ondragleave=()=>el.classList.remove('drag-over');el.ondrop=e=>{e.preventDefault();el.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');if(board.columns.some(c=>c.pages.includes(id)))move(id,e.target.closest('[data-board-page]')?.dataset.boardPage);};
      for(const id of column.pages){
        const card=document.createElement('div');card.className='board-card';card.dataset.boardPage=id;card.draggable=!busy;card.ondragstart=e=>e.dataTransfer.setData('text/plain',id);
        card.append(button(names.get(id)||'Loading page…',()=>navigation.navigate('/?note='+id)));
        const actions=document.createElement('div');actions.className='board-card-actions';const select=document.createElement('select');select.className='dropdown';select.setAttribute('aria-label','Move '+(names.get(id)||'page'));board.columns.forEach((c,i)=>{const o=document.createElement('option');o.value=i;o.textContent=c.name;select.append(o)});select.value=index;select.onchange=()=>change(rows=>{const b=rows.find(b=>b.id===selected);for(const c of b.columns)c.pages=c.pages.filter(p=>p!==id);b.columns[Number(select.value)].pages.push(id);});
        actions.append(select,button('↑',()=>move(id,column.pages[Math.max(0,column.pages.indexOf(id)-1)]),'Move up'),button('×',()=>change(rows=>{rows.find(b=>b.id===selected).columns[index].pages=column.pages.filter(p=>p!==id);}),'Remove from board'));card.append(actions);el.append(card);
      }
      el.append(button('+ Add note',()=>addPage(index)));columns.append(el);
    });
    for(const control of document.querySelectorAll('#boards-view button,#boards-view select,#sidebar-boards button,#settings-boards-list button'))control.disabled=busy||companionFrozen||!scope();
  }
  async function load(){const s=scope();if(!s)return;if(bound!==s){bound=s;packet={revision:0,boards:[]};names.clear();$('board-dialog').close();render();}const token=++sequence;
    try{const p=await graphJson('/companion/collections',{headers:{'X-Collection-Brain':companionState.activeId}});if(s!==scope()||token!==sequence)return;packet=p;render();await titles(s,token);return true;}
    catch(e){if(s===scope())notice('Could not load boards. Try again.');}
  }
  async function titles(s,token){const ids=[...new Set(packet.boards.filter(b=>b.id===selected&&!b.archived).flatMap(b=>b.columns.flatMap(c=>c.pages)))];let cursor=0;await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{while(cursor<ids.length){const id=ids[cursor++];try{const page=await graphJson(memoryDocumentPath(id));if(s!==scope()||token!==sequence)return;names.set(id,page.title||'Untitled');}catch(e){if(s!==scope()||token!==sequence)return;names.set(id,e.status===404?'Page missing':'Page unavailable');}}}));if(s===scope()&&token===sequence)render();}
  async function change(update){if(busy||(!formBusy&&companionFrozen)||!scope()||bound!==scope())return false;const s=scope();const rows=structuredClone(packet.boards);update(rows);busy=true;render();try{const p=await graphJson('/companion/collections',{method:'POST',headers:{'Content-Type':'application/json','X-Collection-Brain':companionState.activeId},body:JSON.stringify({revision:packet.revision,boards:rows})});if(s!==scope())return false;packet=p;return true;}catch(e){if(s===scope()){notice(e.status===409?'Boards changed elsewhere. Reloaded; try again.':'Could not save. Reload and try again.');await load();}return false;}finally{busy=false;if(s===scope())render();}}
  function dialog(title,value,run,picker=false){if(busy||companionFrozen||!scope())return;edit={run,scope:scope(),picker};$('board-dialog-title').textContent=title;$('board-dialog-input').value=value;$('board-dialog-input').readOnly=false;$('board-dialog-input').placeholder=picker?'Search notes…':'';$('board-dialog-input').setAttribute('aria-label',picker?'Search notes':'Name');$('board-dialog-submit').textContent=picker?'Create note':'Save';$('board-dialog-submit').disabled=picker&&companionReadOnly();$('board-dialog-results').replaceChildren();$('board-dialog-status').textContent='';$('board-dialog').showModal();$('board-dialog-input').focus();}
  function addPage(index){const boardId=selected;const add=id=>addToBoard(boardId,index,id);dialog('Add note','',async title=>{$('board-dialog-input').readOnly=true;const p=await graphJson('/memories/all/notes',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':edit.key||(edit.key=crypto.randomUUID())},body:JSON.stringify({type:'note',title,body:'',actor:browserActor})});if(edit.scope!==scope())return false;names.set(p.id,title);return add(p.id);},true);edit.add=add;}
  function addToBoard(boardId,index,id) {
    const board=packet.boards.find(b=>b.id===boardId&&!b.archived);
    if(!board||!board.columns[index])return Promise.resolve(false);
    return change(rows=>{const b=rows.find(b=>b.id===boardId);if(!b.columns.some(c=>c.pages.includes(id)))b.columns[index].pages.push(id);});
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
  $('board-dialog-input').oninput=async()=>{const current=edit,token=++searchSequence;if(!current?.picker)return;const query=$('board-dialog-input').value.trim();$('board-dialog-results').replaceChildren();$('board-dialog-status').textContent='';if(!query)return;try{const results=await searchMemoryNotes(query,new AbortController().signal);if(edit!==current||token!==searchSequence||current.scope!==scope())return;for(const hit of (results.results||[]).slice(0,8)){const p={id:hit.provenance?.metadata?.id,title:hit.provenance?.metadata?.title||hit.provenance?.file};if(!p.id)continue;const added=packet.boards.find(b=>b.id===selected)?.columns.some(c=>c.pages.includes(p.id));const result=button(p.title+(added?' · Added':''),async()=>{if(current.scope!==scope())return;names.set(p.id,p.title);if(await current.add(p.id))$('board-dialog').close();});result.disabled=added;$('board-dialog-results').append(result);}if(!$('board-dialog-results').children.length)$('board-dialog-status').textContent='No matching notes.';}catch{if(edit===current&&token===searchSequence&&current.scope===scope())$('board-dialog-status').textContent='Search unavailable. Try again.';}};
  $('board-dialog-form').onsubmit=async e=>{e.preventDefault();const current=edit,value=$('board-dialog-input').value.trim();if(!value||!current||current.scope!==scope()||busy||formBusy)return;formBusy=true;$('board-dialog-cancel').disabled=true;$('board-dialog-submit').disabled=true;try{if(await current.run(value))$('board-dialog').close();}catch{$('board-dialog-status').textContent='Could not confirm creation. Retry with the same name.';}finally{formBusy=false;$('board-dialog-cancel').disabled=false;$('board-dialog-submit').disabled=current.picker&&companionReadOnly();}};
  $('board-dialog').addEventListener('cancel',e=>{if(formBusy)e.preventDefault();else {edit=null;searchSequence++;}});
  $('board-dialog-cancel').onclick=()=>{$('board-dialog').close();edit=null;searchSequence++;};
  const create=()=>dialog('New board','',async name=>{const id=crypto.randomUUID();if(await change(rows=>rows.push({id,name,archived:false,columns:['To do','Doing','Done'].map(name=>({name,pages:[]}))}))){navigation.navigate('/?board='+id);return true;}return false;});
  $('new-board').onclick=create;$('settings-new-board').onclick=create;
  $('board-rename').onclick=()=>{const b=packet.boards.find(b=>b.id===selected);if(b)dialog('Rename board',b.name,name=>change(rows=>{rows.find(x=>x.id===b.id).name=name;}));};
  window.addEventListener('focus',()=>{if(!$('board-dialog').open&&!$('note-board-dialog').open&&!busy)load();});
  return {pending(){return busy||formBusy;},show(id){$('note-board-dialog').close();selected=id;$('boards-view').hidden=!id;load();},refresh:load};
})();
`;
