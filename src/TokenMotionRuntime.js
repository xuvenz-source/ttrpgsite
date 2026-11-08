/**
 * Imperative presentation layer for locally dragged map tokens.
 *
 * Canonical token positions remain in React/Supabase. Pointer motion updates
 * only transforms of the token and its monitor frame, without committing a
 * React render for every cell crossed. No permissions or saved coordinates are
 * decided here. In particular, this does not grant sight through fog.
 */
export function createTokenMotionRuntime({
 requestFrame=callback=>requestAnimationFrame(callback),
 cancelFrame=handle=>cancelAnimationFrame(handle)
}={}){
 const mounted=new Map(),previews=new Map(),dirty=new Set();
 let scheduled=null,disposed=false;
 const number=value=>typeof value==='number'&&Number.isFinite(value);
 function paint(id){
  const positions=mounted.get(id);
  if(!positions)return;
  const preview=previews.get(id);
  for(const mount of positions.values()){
   if(!mount.node?.style)continue;
   const dx=preview?(preview.x-mount.x)*mount.cell:0;
   const dy=preview?(preview.y-mount.y)*mount.cell:0;
   // Remote samples interpolate between server-approved destinations;
   // local dragging remains immediate with no interpolation latency.
   mount.node.style.transition=preview?.remote?
    'translate 115ms linear':mount.baseTransition;
   // CSS translate is independent from other token CSS transform effects.
   mount.node.style.translate=number(dx)&&number(dy)&&
    (Math.abs(dx)>.01||Math.abs(dy)>.01)?
    dx+'px '+dy+'px':'';
  }
 }
 function schedule(id){
  if(disposed)return;
  dirty.add(id);
  if(scheduled!==null)return;
  scheduled=requestFrame(()=>{
   scheduled=null;
   for(const changedId of dirty)paint(changedId);
   dirty.clear();
  });
 }
 return {
  bind(id,kind,node,{x,y,cell}={}){
   if(disposed||!id||!kind)return;
   let positions=mounted.get(id);
   if(!positions){positions=new Map();mounted.set(id,positions)}
   if(!node){
    positions.delete(kind);
    if(!positions.size)mounted.delete(id);
    return;
   }
   if(![x,y,cell].every(number)||cell<=0)return;
   const existing=positions.get(kind);
   const baseTransition=existing?.node===node?
    existing.baseTransition:(node.style.transition||'');
   positions.set(kind,{node,x,y,cell,baseTransition});
   // A React commit may alter the base left/top; rebase before the next paint
   // rather than briefly showing a stale transform.
   paint(id);
  },
  preview(id,x,y){
   if(disposed||!id||!number(x)||!number(y))return;
   previews.set(id,{x,y,remote:false});schedule(id);
  },
  previewRemote(id,x,y){
   if(disposed||!id||!number(x)||!number(y))return;
   previews.set(id,{x,y,remote:true});schedule(id);
  },
  clearPreview(id){
   if(!previews.delete(id))return;
   schedule(id);
  },
  clear(){
   previews.clear();
   if(scheduled!==null){cancelFrame(scheduled);scheduled=null}
   dirty.clear();
   for(const id of mounted.keys())paint(id);
  },
  dispose(){
   if(scheduled!==null)cancelFrame(scheduled);
   scheduled=null;disposed=true;dirty.clear();previews.clear();mounted.clear();
  },
  getPreview(id){return previews.get(id)||null}
 };
}
