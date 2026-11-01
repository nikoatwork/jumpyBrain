export interface LabelBounds { left:number; right:number; top:number; bottom:number; }
export interface PeerLabel { element:HTMLElement; bounds:LabelBounds; }
interface LabelBox { left:number; top:number; width:number; height:number; bounds:LabelBounds; }
interface PlacedBox { left:number; top:number; width:number; height:number; }
const overlaps = (a:PlacedBox,b:PlacedBox) => a.left < b.left+b.width+3 && a.left+a.width+3 > b.left && a.top < b.top+b.height+3 && a.top+a.height+3 > b.top;

/** Bounded label placement; caret/selection marks themselves are never moved. */
export function layoutPeerLabels(labels:readonly LabelBox[]): Array<PlacedBox|null> {
  const occupied:PlacedBox[]=[];
  return labels.slice(0,64).map(label=>{
    const {bounds}=label;
    if (![label.left,label.top,label.width,label.height,bounds.left,bounds.right,bounds.top,bounds.bottom].every(Number.isFinite) || label.width<=0 || label.height<=0 || bounds.right-bounds.left<label.width || bounds.bottom-bounds.top<label.height) return null;
    const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
    const seen=new Set<string>();
    // Prefer the original position, then nearby rows/columns inside the same
    // scroll viewport. Eight co-located peers stay separately readable.
    for(let distance=0;distance<64;distance++)for(const sign of distance?[1,-1]:[1])for(const column of [0,1,-1,2,-2]){
      const left=clamp(label.left+column*(label.width+4),bounds.left,bounds.right-label.width);
      const top=clamp(label.top+sign*distance*(label.height+4),bounds.top,bounds.bottom-label.height),key=left+":"+top;
      if(seen.has(key))continue;seen.add(key);
      const candidate={left,top,width:label.width,height:label.height};
      if(!occupied.some(other=>overlaps(candidate,other))){occupied.push(candidate);return candidate;}
    }
    return null;
  });
}

export function placePeerLabels(labels:readonly PeerLabel[]) {
  const placed=layoutPeerLabels(labels.map(({element,bounds})=>{const rect=element.getBoundingClientRect();return {left:rect.left,top:rect.top,width:rect.width,height:rect.height,bounds};}));
  let lastVisible=-1,hidden=0;const hiddenNames:string[]=[];
  for(let index=0;index<labels.length;index++){
    const label=labels[index]!.element,box=placed[index];
    if(!box){label.hidden=true;hidden++;hiddenNames.push(label.textContent??"");continue;}
    label.style.left=box.left+"px";label.style.top=box.top+"px";lastVisible=index;
  }
  // A viewport can be physically too small for every name. Keep the visible
  // stack nonoverlapping and disclose the omitted count rather than cover text
  // with coincident labels. The participant list retains the individual names.
  if(hidden&&lastVisible>=0){const label=labels[lastVisible]!.element;label.title=[label.textContent??"",...hiddenNames].join("\n");label.textContent=`+${hidden+1} participants`;label.style.width=placed[lastVisible]!.width+"px";label.dataset.collaborationOverflow=String(hidden+1);}
}
