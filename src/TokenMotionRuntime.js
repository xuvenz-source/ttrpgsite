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
 cancelFrame=handle=>cancelAnimationFrame(handle),
 setTimer=(callback,delay)=>setTimeout(callback,delay),
 clearTimer=handle=>clearTimeout(handle)
}={}){
 const mounted=new Map(),previews=new Map(),dirty=new Set();
 const settleTimers=new Map();
 let scheduled=null,disposed=false;
 function cancelSettle(id){
  const timer=settleTimers.get(id);
  if(timer!==undefined)clearTimer(timer);
  settleTimers.delete(id);
 }
 function finishSettling(id,x,y,attempts=0){
  if(disposed)return;
  const current=previews.get(id);
  if(!current?.settling||current.x!==x||current.y!==y)return;
  const nodes=mounted.get(id);
  const mount=nodes?.get('sprite')||nodes?.values().next().value;
  // React can render after the network acknowledgement. Never remove a
  // transform while its underlying left/top still targets the old cell.
  if(mount&&(mount.x!==x||mount.y!==y)&&attempts<5){
   settleTimers.set(id,setTimer(()=>finishSettling(id,x,y,attempts+1),60));
   return;
  }
  settleTimers.delete(id);
  // At this point canonical coordinates have either matched or the
  // reconciliation grace period elapsed. Rebase to the current canonical
  // position, which is already RLS-authorized, before removing the overlay.
  if(mount&&(mount.x!==x||mount.y!==y)){
   previews.set(id,{x:mount.x,y:mount.y,remote:true,settling:true});
   schedule(id);
   settleTimers.set(id,setTimer(()=>{
    settleTimers.delete(id);
    if(previews.get(id)?.settling){
     previews.delete(id);schedule(id);
    }
   },125));
   return;
  }
  previews.delete(id);schedule(id);
 }
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
    'translate 95ms linear':mount.baseTransition;
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
   cancelSettle(id);
   previews.set(id,{x,y,remote:false});schedule(id);
  },
  previewRemote(id,x,y){
   if(disposed||!id||!number(x)||!number(y))return;
   cancelSettle(id);
   previews.set(id,{x,y,remote:true});schedule(id);
  },
  // An authoritative final position may differ from the last throttled
  // preview packet. Ease to that final cell, then drop the overlay only
  // after its 95ms CSS interpolation and React position commit are complete.
  settleRemote(id,x,y){
   const preview=previews.get(id);
   if(!preview?.remote||!number(x)||!number(y))return false;
   cancelSettle(id);
   previews.set(id,{x,y,remote:true,settling:true});
   schedule(id);
   settleTimers.set(id,setTimer(()=>finishSettling(id,x,y),125));
   return true;
  },
  // Keep the local drop transform active until React has committed its new
  // optimistic left/top. Clearing on pointerup first paints the old position
  // for a frame, then jumps forward when the DB/client state settles.
  handoff(id){
   const preview=previews.get(id);
   if(!preview||preview.remote)return;
   previews.set(id,{...preview,handoff:true});
  },
  // A server position matching a private observer packet must not clear the
  // preview until the corresponding React left/top is committed. Otherwise
  // the sprite briefly paints its old canonical coordinates and rubber-bands.
  handoffRemote(id){
   const preview=previews.get(id);
   if(!preview?.remote)return false;
   cancelSettle(id);
   previews.set(id,{...preview,handoff:true,settling:false});
   return true;
  },
  reconcile(id,x,y){
   const preview=previews.get(id);
   if(!preview?.handoff||!number(x)||!number(y)||
    preview.x!==x||preview.y!==y)return false;
   previews.delete(id);
   schedule(id);
   return true;
  },
  clearPreview(id){
   cancelSettle(id);
   if(!previews.delete(id))return;
   schedule(id);
  },
  clear(){
   for(const id of settleTimers.keys())cancelSettle(id);
   previews.clear();
   if(scheduled!==null){cancelFrame(scheduled);scheduled=null}
   dirty.clear();
   for(const id of mounted.keys())paint(id);
  },
  dispose(){
   for(const id of settleTimers.keys())cancelSettle(id);
   if(scheduled!==null)cancelFrame(scheduled);
   scheduled=null;disposed=true;dirty.clear();previews.clear();mounted.clear();
  },
  getPreview(id){return previews.get(id)||null}
 };
}
