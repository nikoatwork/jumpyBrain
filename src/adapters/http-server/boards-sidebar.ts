// Companion-only presentation over canonical boards. Preferences never write to a brain.
export const boardsSidebarStyles = String.raw`
#sidebar-boards {margin-bottom:var(--space-3)}
#sidebar-boards:empty {margin:0}
#sidebar-boards .board-nav-item {min-width:0}
#sidebar-boards .sidebar-page {margin-top:0;max-width:none}
#sidebar-boards .sidebar-page > button {background:transparent}
#sidebar-boards .sidebar-page-link {display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
#sidebar-boards .board-nav-settle {opacity:0}
#sidebar-boards .sidebar-page:is(:hover,:focus-within) .board-nav-settle {opacity:1}
#sidebar-boards .board-nav-disclosure {display:grid;place-items:center;flex:0 0 var(--control-compact);width:var(--control-compact);min-height:var(--control-height);padding:0;color:var(--ink-soft)}
.board-nav-disclosure::before {content:'';width:var(--space-1);height:var(--space-1);border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg)}
.board-nav-disclosure[aria-expanded=true]::before {transform:rotate(45deg)}
#sidebar-boards .board-nav-head:has(.board-nav-disclosure:not([hidden])) .sidebar-page-link {padding-left:0}
#sidebar-boards .board-nav-column > .sidebar-page {padding-left:var(--space-8)}
#sidebar-boards .board-nav-column > .sidebar-page button {font-weight:var(--weight-regular)}
#sidebar-boards .board-nav-column > .sidebar-page .sidebar-page-link {padding-left:0}
#sidebar-boards .board-nav-page {padding-left:calc(var(--space-8) + var(--control-compact) + var(--space-5))}
#sidebar-boards .board-nav-page .sidebar-page-link {padding-left:0}
.board-nav-empty {padding:var(--space-1) var(--space-3) var(--space-2) calc(var(--space-8) + var(--control-compact) + var(--space-5));color:var(--ink-faint);font-size:var(--text-caption)}
#sidebar-boards [hidden] {display:none}
@media(hover:none){#sidebar-boards .board-nav-settle{opacity:1}}
@media(max-width:680px){
  #sidebar-boards,#sidebar-boards ul{display:block;overflow:visible}
  #sidebar-boards {--control-compact:var(--control-touch);--control-height:var(--control-touch)}
  #sidebar-boards .sidebar-page{padding-right:var(--space-3);border-radius:0}
}
`;

export const boardsSidebarScript = String.raw`
function createBoardsSidebar({host,scope,boards,names,selected,disabled,readOnly,navigate,settle,changed}) {
  const prefix='jumpybrain.boardNavigation.v1:',sessions=new Map();
  let key='',prefs={};
  function sync() {
    const next=scope();if(next===key)return;
    key=next;prefs=sessions.get(key)||{};
    if(!sessions.has(key)){
      try{const raw=JSON.parse(localStorage.getItem(prefix+key)||'{}');
        for(const [id,p] of Object.entries(raw).slice(0,100))if(/^[a-f0-9-]{36}$/i.test(id)&&p&&typeof p.enabled==='boolean')prefs[id]={enabled:p.enabled,open:p.open!==false,closed:[0,1,2].filter(i=>Array.isArray(p.closed)&&p.closed.includes(i))};
      }catch{}
      sessions.set(key,prefs);
    }
  }
  const preference=id=>{sync();return Object.hasOwn(prefs,id)?prefs[id]:null;};
  const enabled=id=>!!preference(id)?.enabled;
  function persist(){const ids=new Set(boards().map(b=>b.id));for(const id of Object.keys(prefs))if(!ids.has(id))delete prefs[id];try{localStorage.setItem(prefix+key,JSON.stringify(prefs));}catch{}render();changed();}
  function setEnabled(id,value){
    if(disabled()||!scope())return;
    sync();prefs[id]||={enabled:false,open:true,closed:[]};prefs[id].enabled=value;persist();
  }
  function toggle(id,index){
    if(disabled())return;
    const p=preference(id);if(!p)return;
    if(index===undefined)p.open=!p.open;
    else p.closed=p.closed.includes(index)?p.closed.filter(i=>i!==index):[...p.closed,index];
    persist();
  }
  function visiblePageIds(){return boards().filter(b=>!b.archived&&enabled(b.id)&&preference(b.id).open).flatMap(b=>b.columns.flatMap((c,i)=>preference(b.id).closed.includes(i)?[]:c.pages));}
  function control(label,run,classes){const b=document.createElement('button');b.type='button';b.className='quiet-button '+classes;b.onclick=run;b.textContent=label;return b;}
  function label(el,text){el.textContent=text;el.title=text;el.setAttribute('aria-label',text);}
  function disclosure(el,text,open,group){el.title=(open?'Collapse ':'Expand ')+text;el.setAttribute('aria-label',el.title);el.setAttribute('aria-expanded',String(open));el.setAttribute('aria-controls',group.id);group.hidden=!open;}
  function reconcile(parent,items,make,update,fallback){
    const keys=new Set(items.map(x=>x.key));
    for(const el of [...parent.children])if(!keys.has(el.dataset.key)){if(el.contains(document.activeElement))fallback?.focus();el.remove();}
    items.forEach((item,i)=>{let el=[...parent.children].find(el=>el.dataset.key===item.key);if(!el){el=make(item);el.dataset.key=item.key;}
      update(el,item);if(parent.children[i]!==el)parent.insertBefore(el,parent.children[i]||null);
    });
  }
  function render(){
    sync();
    reconcile(host,boards().filter(b=>!b.archived).map(b=>({...b,key:b.id})),b=>{
      const li=document.createElement('li');li.className='board-nav-item';li.dataset.sidebarBoard=b.id;
      const head=document.createElement('div');head.className='sidebar-page board-nav-head';
      const expand=control('',()=>toggle(b.id),'board-nav-disclosure board-nav-target');
      const link=control('',()=>navigate('/?board='+b.id),'sidebar-page-link board-nav-target');
      const park=control('✓',()=>settle(b.id),'note-icon board-nav-settle');park.title='Settle board';
      const group=document.createElement('ul');group.id='board-tree-'+b.id;
      head.append(expand,link,park);li.append(head,group);return li;
    },(li,b)=>{
      const [head,group]=li.children,[expand,link,park]=head.children,p=preference(b.id),on=!!p?.enabled,active=document.activeElement;
      label(link,b.name);link.toggleAttribute('aria-current',false);if(selected().board===b.id)link.setAttribute('aria-current','page');
      park.setAttribute('aria-label','Settle '+b.name);park.disabled=disabled()||readOnly();
      expand.hidden=!on;disclosure(expand,b.name,on&&p.open,group);group.setAttribute('aria-label',b.name+' columns');
      if((expand.hidden&&active===expand)||(group.hidden&&group.contains(active)))link.focus();
      reconcile(group,on&&p.open?b.columns.map((c,i)=>({...c,key:String(i),index:i})):[],c=>{
        const li=document.createElement('li');li.className='board-nav-column';
        const row=document.createElement('div');row.className='sidebar-page';
        const expand=control('',()=>toggle(b.id,c.index),'board-nav-disclosure board-nav-target');
        const name=control('',()=>toggle(b.id,c.index),'sidebar-page-link board-nav-target');
        const pages=document.createElement('ul');pages.id='board-tree-'+b.id+'-'+c.index;
        row.append(expand,name);li.append(row,pages);return li;
      },(col,c)=>{
        const [row,pages]=col.children,[arrow,name]=row.children,open=!p.closed.includes(c.index),active=document.activeElement;
        label(name,c.name);disclosure(arrow,c.name,open,pages);name.setAttribute('aria-expanded',String(open));name.setAttribute('aria-controls',pages.id);
        pages.setAttribute('aria-label',c.name+' pages');if(!open&&pages.contains(active))arrow.focus();
        reconcile(pages,!open?[]:c.pages.length?c.pages.map(id=>({key:id})): [{key:'empty'}],page=>{
          const li=document.createElement('li');
          if(page.key==='empty'){li.className='board-nav-empty';li.textContent='Empty column';}
          else {li.className='sidebar-page board-nav-page';li.dataset.sidebarPage=page.key;li.append(control('',()=>navigate('/?note='+page.key),'sidebar-page-link board-nav-target'));}
          return li;
        },(li,page)=>{if(page.key==='empty')return;const link=li.firstElementChild;label(link,names.get(page.key)||'Loading page…');link.removeAttribute('aria-current');if(selected().note===page.key)link.setAttribute('aria-current','page');},arrow);
      },link);
    },document.getElementById('home-link'));
    for(const button of host.querySelectorAll('.board-nav-target'))button.disabled=disabled();
  }
  host.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const target=event.target.closest('.board-nav-target');if(!target)return;
    const items=[...host.querySelectorAll('.board-nav-target')].filter(b=>!b.disabled&&b.getClientRects().length),index=items.indexOf(target);
    let next;
    if(event.key==='ArrowRight'){
      const arrow=target.closest('.sidebar-page')?.querySelector('.board-nav-disclosure:not([hidden])');
      if(arrow?.getAttribute('aria-expanded')==='false')arrow.click();
      else next=arrow?document.getElementById(arrow.getAttribute('aria-controls'))?.querySelector('.board-nav-target'):null;
    }else if(event.key==='ArrowLeft'){
      const arrow=target.closest('.sidebar-page')?.querySelector('.board-nav-disclosure:not([hidden])');
      if(arrow?.getAttribute('aria-expanded')==='true')arrow.click();
      else next=target.closest('ul')?.parentElement.querySelector(':scope > .sidebar-page .board-nav-disclosure');
    }else next=items[event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+(event.key==='ArrowDown'?1:-1)))];
    event.preventDefault();next?.focus();
  });
  window.addEventListener('storage',event=>{if(event.key!==null&&event.key!==prefix+key)return;sessions.delete(key);key='';render();changed();});
  return {enabled,setEnabled,visiblePageIds,render};
}
`;
