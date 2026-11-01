import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutPeerLabels,placePeerLabels} from '../dist/adapters/http-server/collaboration-labels.js';
const bounds={left:10,right:510,top:20,bottom:220};
const collides=(a,b)=>a.left<b.left+b.width&&a.left+a.width>b.left&&a.top<b.top+b.height&&a.top+a.height>b.top;
test('eight colocated human/agent labels remain separately readable inside their scroll viewport',()=>{
  const labels=Array.from({length:8},()=>({left:200,top:100,width:130,height:16,bounds}));
  const placed=layoutPeerLabels(labels);assert.equal(placed.filter(Boolean).length,8);
  for(let i=0;i<placed.length;i++){const a=placed[i];assert.ok(a.left>=bounds.left&&a.left+a.width<=bounds.right&&a.top>=bounds.top&&a.top+a.height<=bounds.bottom);for(let j=i+1;j<placed.length;j++)assert.equal(collides(a,placed[j]),false);}
  assert.deepEqual(labels[0],{left:200,top:100,width:130,height:16,bounds},'the source caret input is immutable');
});
test('crowded tiny viewports disclose overflow and never move or overlap cursor marks',()=>{
  const labels=Array.from({length:8},(_,i)=>({bounds:{left:0,right:100,top:0,bottom:16},element:{textContent:'Person '+i,hidden:false,dataset:{},style:{},getBoundingClientRect(){return{left:0,top:0,width:100,height:16};}}}));
  const original=labels.map(label=>label.element.getBoundingClientRect());placePeerLabels(labels);
  assert.equal(labels.filter(label=>!label.element.hidden).length,1);
  assert.equal(labels[0].element.textContent,'+8 participants');assert.equal(labels[0].element.dataset.collaborationOverflow,'8');
  assert.deepEqual(labels.map(label=>label.element.getBoundingClientRect()),original);
});
test('empty, invalid and completely clipped label geometry cannot create offscreen overlays',()=>{
  assert.deepEqual(layoutPeerLabels([]),[]);
  assert.deepEqual(layoutPeerLabels([{left:0,top:0,width:10,height:15,bounds:{left:0,right:5,top:0,bottom:5}},{left:NaN,top:0,width:1,height:1,bounds}]),[null,null]);
});
