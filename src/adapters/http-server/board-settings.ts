import { browserIcons } from "./browser-icons.js";

export const boardSettingsStyles = String.raw`
#settings-boards-list {margin-top:var(--space-3)}
.board-settings-row {display:flex;align-items:center;gap:var(--space-2);min-height:var(--space-12);border-bottom:1px solid var(--line)}
.board-settings-row:last-child {border-bottom:0}
.board-settings-name {flex:1;min-width:0;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;--quiet-fill:transparent;--quiet-hover:var(--hover-fill)}
.board-settings-status {color:var(--ink-faint);font-size:var(--text-caption)}
.board-settings-actions {display:flex;gap:var(--space-1);flex:none}
.board-settings-actions .note-icon {width:var(--control-compact);height:var(--control-compact);min-height:var(--control-compact);padding:var(--space-1);flex:none}
.board-settings-actions [aria-pressed=true] {color:var(--accent);background:var(--surface-hover);box-shadow:inset 0 0 0 1px var(--accent)}
.board-settings-row input {flex:1;min-width:0;width:0;font-size:var(--text-body)}
.board-settings-confirm {flex:1;min-width:0;margin:0;font-size:var(--text-caption);overflow-wrap:anywhere}
@media(max-width:680px){.board-settings-row{--control-compact:var(--control-touch);flex-wrap:wrap;padding:var(--space-1) 0}.board-settings-status{display:none}.board-settings-confirm{flex-basis:100%}}
`;

// Brain organization: writes use per-board hashes, scope guards and the selected brain's write permission.
export const boardSettingsScript = String.raw`
function createBoardSettings({getBoards,disabled,readOnly=()=>false,scope,change,open}) {
  const list=$('settings-boards-list');
  let edit=null;
  const action=(label,run,icon)=>{
    const el=document.createElement('button');el.type='button';el.className=icon?'quiet-button note-icon':'quiet-button';
    el.setAttribute('aria-label',label);el.title=label;el.onclick=run;
    if(icon)el.innerHTML=icon;else el.textContent=label;
    return el;
  };
  const focusRow=id=>(list.querySelector('[data-board-id="'+id+'"] button')||$('settings-new-board')).focus();
  function reset(){edit=null;}
  function start(board,mode){
    if(disabled()||readOnly()||!board)return;
    edit={id:board.id,mode,scope:scope(),saving:false};render();
    const row=list.querySelector('[data-board-id="'+board.id+'"]');
    (row.querySelector('input')||row.querySelector('button')).focus();row.querySelector('input')?.select();
  }
  function cancel(){if(edit?.saving)return;const id=edit?.id;reset();render();if(id)focusRow(id);}
  async function save(){
    const current=edit;if(!current||current.saving||disabled()||readOnly()||current.scope!==scope())return;
    const input=current.input,value=input?.value.trim();
    if(input){
      input.setCustomValidity(!value||value.length>100||/[\x00-\x1f]/.test(value)?'Use a name of 1–100 characters without control characters.':'');
      if(!input.reportValidity())return;
    }
    current.saving=true;
    const ok=await change(rows=>{
      const index=rows.findIndex(b=>b.id===current.id);if(index<0)return;
      if(current.mode==='rename')rows[index].name=value;else rows.splice(index,1);
    });
    current.saving=false;if(edit!==current||current.scope!==scope())return;
    if(ok){reset();render();focusRow(current.id);toast.show('boards',current.mode==='rename'?'Board renamed.':'Board deleted. Notes kept.');}
    else {render();current.input?.focus();}
  }
  function render(){
    const boards=getBoards();
    if(edit&&(edit.scope!==scope()||!boards.some(b=>b.id===edit.id)))reset();
    if(!boards.length){list.textContent='Your boards will live here.';return;}
    if(!list.firstElementChild)list.replaceChildren();
    const ids=new Set(boards.map(b=>b.id));
    for(const row of [...list.children])if(!ids.has(row.dataset.boardId))row.remove();
    for(const [index,b] of boards.entries()){
      let row=list.querySelector('[data-board-id="'+b.id+'"]');
      if(!row){row=document.createElement('div');row.className='board-settings-row';row.dataset.boardId=b.id;list.append(row);}
      const mode=edit?.id===b.id?edit.mode:'view';
      if(row.dataset.mode!==mode){
        row.replaceChildren();row.dataset.mode=mode;
        const actions=document.createElement('div');actions.className='board-settings-actions';
        if(mode==='rename'){
          const input=document.createElement('input');input.value=b.name;input.maxLength=100;input.setAttribute('aria-label','Board name');edit.input=input;
          input.oninput=()=>input.setCustomValidity('');input.onkeydown=e=>{if(e.isComposing)return;if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();if(e.key==='Enter')void save();else cancel();}};
          actions.append(action('Save board name',save,${JSON.stringify(browserIcons.check)}),action('Cancel rename',cancel,${JSON.stringify(browserIcons.close)}));row.append(input,actions);
        }else if(mode==='delete'){
          const message=document.createElement('p');message.className='board-settings-confirm';message.textContent='Delete “'+b.name+'”? Notes are kept.';
          actions.append(action('Cancel',cancel),action('Delete board',save));row.append(message,actions);
          row.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();cancel();}};
        }else{
          row.onkeydown=null;
          const name=action(b.name,()=>open(b.id));name.classList.add('board-settings-name');
          const status=document.createElement('span');status.className='board-settings-status';
          actions.append(action('Rename '+b.name,()=>start(getBoards().find(x=>x.id===b.id),'rename'),${JSON.stringify(browserIcons.edit)}),action('Settle '+b.name,()=>toggle(b.id),${JSON.stringify(browserIcons.check)}),action('Delete '+b.name,()=>start(getBoards().find(x=>x.id===b.id),'delete'),${JSON.stringify(browserIcons.remove)}));
          row.append(name,status,actions);
        }
      }
      if(mode==='view'){
        const name=row.querySelector('.board-settings-name');name.textContent=b.name;name.title=b.name;name.setAttribute('aria-label',b.name);
        row.querySelector('.board-settings-status').textContent=b.archived?'Settled':'Active';
        const [rename,toggle,remove]=row.querySelectorAll('.board-settings-actions button');
        for(const [el,label] of [[rename,'Rename '+b.name],[toggle,(b.archived?'Restore ':'Settle ')+b.name],[remove,'Delete '+b.name]]){el.title=label;el.setAttribute('aria-label',label);}
        toggle.setAttribute('aria-pressed',String(b.archived));
      }
      const blocked=disabled()||!!edit?.saving;
      for(const control of row.querySelectorAll('button'))control.disabled=blocked||(readOnly()&&!control.classList.contains('board-settings-name'));
      const input=row.querySelector('input');if(input)input.readOnly=blocked||readOnly();
      if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
    }
  }
  async function toggle(id){
    if(disabled()||readOnly())return;const b=getBoards().find(b=>b.id===id);if(!b)return;
    const archived=!b.archived,s=scope();
    if(await change(rows=>{rows.find(b=>b.id===id).archived=archived;})&&s===scope()){
      list.querySelector('[data-board-id="'+id+'"] [aria-pressed]')?.focus();
      toast.show('boards',archived?'Board settled.':'Board restored.');
    }
  }
  return {render,reset};
}
`;
