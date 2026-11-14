import { media } from "./browser-design-system.js";
import { browserChevronIcon, browserIcons } from "./browser-icons.js";

// Companion-only presentation over canonical boards. Preferences never write to a brain.
// Rows are .list-row--edge primitives indented by --row-depth (board 0, column 1, page 2); leaf rows
// reserve the disclosure lane (the 32/40px icon-button width) so each level's label sits strictly further right.
export const boardsSidebarStyles = String.raw`
#sidebar-boards {--board-lane:var(--control-compact);margin-bottom:var(--space-3)}
#sidebar-boards:empty {margin:0}
#sidebar-boards .board-nav-item {min-width:0}
#sidebar-boards .board-nav-row {padding-block:0}
#sidebar-boards .board-nav-row > .list-row-target {align-self:stretch;display:block;min-height:var(--row-height);line-height:var(--row-height);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Without a tree disclosure the board title lines up with the page titles below. */
#sidebar-boards .board-nav-head:has(> .board-nav-disclosure[hidden]) {padding-left:calc(var(--row-inset) + var(--space-3))}
#sidebar-boards :is(.board-nav-page,.board-nav-empty) {padding-left:calc(var(--row-inset) + var(--row-depth) * var(--row-indent) + var(--board-lane) + var(--space-2))}
#sidebar-boards .board-nav-page[data-page-state] > .sidebar-page-link {font-style:italic;color:var(--ink-faint)}
@media ${media.narrow}, ${media.coarse} {#sidebar-boards {--board-lane:var(--control-touch)}}
@media ${media.narrow} {#sidebar-boards,#sidebar-boards ul{display:block;overflow:visible}}
`;

export const boardsSidebarScript = String.raw`
const boardTreeGlyphs={chevron:${JSON.stringify(browserChevronIcon)},check:${JSON.stringify(browserIcons.check)}};
function createBoardsSidebar({host,scope,boards,names,pageStates,selected,disabled,readOnly,navigate,settle,changed}) {
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
  const preference=id=>{sync();return prefs[id]||={enabled:false,open:true,closed:[]};};
  const enabled=id=>!!preference(id)?.enabled;
  function persist(){const ids=new Set(boards().map(b=>b.id));for(const id of Object.keys(prefs))if(!ids.has(id))delete prefs[id];try{localStorage.setItem(prefix+key,JSON.stringify(prefs));}catch{}render();changed();}
  function setEnabled(id,value){
    if(disabled()||!scope())return;
    preference(id).enabled=value;persist();
  }
  function toggle(id,index){
    if(disabled())return;
    const p=preference(id);if(!p)return;
    if(index===undefined)p.open=!p.open;
    else p.closed=p.closed.includes(index)?p.closed.filter(i=>i!==index):[...p.closed,index];
    persist();
  }
  function visiblePageIds(){return boards().filter(b=>!b.archived&&enabled(b.id)&&preference(b.id).open).flatMap(b=>b.columns.flatMap((c,i)=>preference(b.id).closed.includes(i)?[]:c.pages));}
  function control(label,run,classes){const b=document.createElement('button');b.type='button';b.className=classes;b.onclick=run;b.textContent=label;return b;}
  function disclosureButton(run){const b=control('',run,'icon-button disclosure-trigger board-nav-disclosure board-nav-target');b.innerHTML=boardTreeGlyphs.chevron;return b;}
  function treeRow(tag,depth,classes){const el=document.createElement(tag);el.className='board-nav-row list-row list-row--edge'+(classes?' '+classes:'');el.style.setProperty('--row-depth',String(depth));return el;}
  function label(el,text){el.textContent=text;el.title=text;el.setAttribute('aria-label',text);}
  function disclosure(el,text,open,group){JumpyBrainBrowser.setDisclosure(el,open,{label:text,controls:group});}
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
      const head=treeRow('div',0,'board-nav-head');
      const expand=disclosureButton(()=>toggle(b.id));
      const link=control('',()=>navigate('/?board='+b.id),'sidebar-page-link list-row-target board-nav-target');
      const park=control('',()=>settle(b.id),'icon-button board-nav-settle');park.innerHTML=boardTreeGlyphs.check;park.title='Settle board';
      const actions=document.createElement('span');actions.className='row-actions';actions.append(park);
      const group=document.createElement('ul');group.id='board-tree-'+b.id;
      head.append(expand,link,actions);li.append(head,group);return li;
    },(li,b)=>{
      const [head,group]=li.children,[expand,link,actions]=head.children,park=actions.firstElementChild,p=preference(b.id),on=!!p?.enabled,active=document.activeElement;
      label(link,b.name);link.title='Open board: '+b.name;link.setAttribute('aria-label',link.title);link.toggleAttribute('aria-current',false);if(selected().board===b.id)link.setAttribute('aria-current','page');
      park.setAttribute('aria-label','Settle '+b.name);park.disabled=disabled()||readOnly();
      expand.hidden=!on;disclosure(expand,b.name,on&&p.open,group);group.setAttribute('aria-label',b.name+' columns');
      if((expand.hidden&&active===expand)||(group.hidden&&group.contains(active)))link.focus();
      reconcile(group,on&&p.open?b.columns.map((c,i)=>({...c,key:String(i),index:i})):[],c=>{
        const li=document.createElement('li');li.className='board-nav-column';
        const head=treeRow('div',1);
        const expand=disclosureButton(()=>toggle(b.id,c.index));
        const name=control('',()=>toggle(b.id,c.index),'sidebar-page-link list-row-target board-nav-target');
        const pages=document.createElement('ul');pages.id='board-tree-'+b.id+'-'+c.index;
        head.append(expand,name);li.append(head,pages);return li;
      },(col,c)=>{
        const [head,pages]=col.children,[arrow,name]=head.children,open=!p.closed.includes(c.index),active=document.activeElement;
        label(name,c.name);disclosure(arrow,c.name,open,pages);name.title=arrow.title;name.setAttribute('aria-label',name.title);name.setAttribute('aria-expanded',String(open));name.setAttribute('aria-controls',pages.id);
        pages.setAttribute('aria-label',c.name+' pages');if(!open&&pages.contains(active))arrow.focus();
        reconcile(pages,!open?[]:c.pages.length?c.pages.map(id=>({key:id})): [{key:'empty'}],page=>{
          if(page.key==='empty'){const li=document.createElement('li');li.className='board-nav-empty list-status';li.style.setProperty('--row-depth','2');li.textContent='Empty column';return li;}
          const li=treeRow('li',2,'board-nav-page');li.dataset.sidebarPage=page.key;li.append(control('',()=>navigate('/?note='+page.key),'sidebar-page-link list-row-target board-nav-target'));
          return li;
        },(li,page)=>{
          if(page.key==='empty')return;
          const link=li.firstElementChild,status=pageStates.get(page.key)||(!names.has(page.key)?'loading':null);
          label(link,names.get(page.key)||'Loading page…');
          if(status){li.dataset.pageState=status;const detail=status==='missing'?'Board reference not found. Open to check again.':status==='unavailable'?'Could not load this board reference. Open to retry.':'Loading this board reference.';link.title=link.textContent+' · '+detail;link.setAttribute('aria-description',detail);}
          else {delete li.dataset.pageState;link.removeAttribute('aria-description');}
          link.removeAttribute('aria-current');if(selected().note===page.key)link.setAttribute('aria-current','page');
        },arrow);
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
      const arrow=target.closest('.board-nav-row')?.querySelector('.board-nav-disclosure:not([hidden])');
      if(arrow?.getAttribute('aria-expanded')==='false')arrow.click();
      else next=arrow?document.getElementById(arrow.getAttribute('aria-controls'))?.querySelector('.board-nav-target'):null;
    }else if(event.key==='ArrowLeft'){
      const arrow=target.closest('.board-nav-row')?.querySelector('.board-nav-disclosure:not([hidden])');
      if(arrow?.getAttribute('aria-expanded')==='true')arrow.click();
      else next=target.closest('ul')?.parentElement.querySelector(':scope > .board-nav-row .board-nav-disclosure');
    }else next=items[event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+(event.key==='ArrowDown'?1:-1)))];
    event.preventDefault();next?.focus();
  });
  window.addEventListener('storage',event=>{if(event.key!==null&&event.key!==prefix+key)return;sessions.delete(key);key='';render();changed();});
  return {enabled,setEnabled,visiblePageIds,render};
}
`;
