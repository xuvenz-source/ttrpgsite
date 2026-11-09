/**
 * Imperative presentation layer for locally dragged map tokens.
 *
 * Canonical token positions remain in React/Supabase. Pointer motion updates
 * only transforms of the token and its monitor frame, without committing a
 * React render for every cell crossed. No permissions or saved coordinates are
 * decided here. In particular, this does not grant sight through fog.
 */
import {movementDiagnostics} from './MovementDiagnostics.js';
import {validVerifiedObserverPath,sameObserverCell,
 appendVerifiedObserverPoints} from './VerifiedObserverPath.js';

export function createTokenMotionRuntime({
 requestFrame=callback=>requestAnimationFrame(callback),
 clock=()=>performance.now(),
 cancelFrame=handle=>cancelAnimationFrame(handle),
 setTimer=(callback,delay)=>setTimeout(callback,delay),
 clearTimer=handle=>clearTimeout(handle),
 observerStepMs=24
}={}){
 const mounted=new Map(),previews=new Map(),dirty=new Set();
 const settleTimers=new Map(),requestedAt=new Map(),remoteRoutes=new Map();
 let scheduled=null,disposed=false;
 function stopRemoteRoute(id){
  const route=remoteRoutes.get(id);
  if(!route)return null;
  if(route.handle!==null)cancelFrame(route.handle);
  remoteRoutes.delete(id);
  return route;
 }
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
   // A timer never proves a newer canonical coordinate. Retain the accepted
   // visual destination until React binds the matching authoritative row,
   // or the caller explicitly revokes it after a failed authorized refresh.
   settleTimers.delete(id);
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
   mount.node.style.transition=preview?.route?'':preview?.remote?
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
   const now=clock();
   for(const changedId of dirty){
    const requested=requestedAt.get(changedId);
    if(requested){
     movementDiagnostics.record(requested.remote?
      'remote-motion-frame-latency':'local-motion-frame-latency',
      Math.max(0,now-requested.time));
     requestedAt.delete(changedId);
    }
    paint(changedId);
   }
   dirty.clear();
  });
 }
 function advanceRemoteRoute(id){
  const route=remoteRoutes.get(id);
  if(!route||disposed)return;
  route.handle=null;
  const now=clock();
  const a=route.points[route.index],b=route.points[route.index+1];
  if(!b){
   stopRemoteRoute(id);
   const finish=route.points.at(-1);
   previews.set(id,{x:finish.x,y:finish.y,remote:true});
   paint(id);
   if(route.handoffPending){
    const canonical=mounted.get(id)?.get('sprite')||
     mounted.get(id)?.values().next().value;
    if(canonical?.x===finish.x&&canonical?.y===finish.y){
     previews.delete(id);paint(id);
    }else previews.set(id,{x:finish.x,y:finish.y,
      remote:true,handoff:true});
   }else if(route.settleAt){
    const destination=route.settleAt;
    // A new token snapshot may already match the most recently played
    // waypoint; only then can its remote transform be released safely.
    if(destination.x===finish.x&&destination.y===finish.y){
     const mount=mounted.get(id)?.get('sprite')||
      mounted.get(id)?.values().next().value;
     if(mount?.x===finish.x&&mount?.y===finish.y){
      previews.delete(id);paint(id);
     }else previews.set(id,{x:finish.x,y:finish.y,
       remote:true,settling:true});
    }else{
     previews.set(id,{x:finish.x,y:finish.y,remote:true});
     schedule(id);
     // This is a canonical RLS coordinate, not a guessed straight route.
     // The caller may fetch an updated verified path if the last packet was
     // lost; do not interpolate to the new point through unknown geometry.
    }
   }
   return;
  }
  const duration=Math.max(1,observerStepMs);
  const fraction=Math.max(0,Math.min(1,(now-route.started)/duration));
  previews.set(id,{x:a.x+(b.x-a.x)*fraction,
   y:a.y+(b.y-a.y)*fraction,remote:true,route:true});
  requestedAt.set(id,{time:route.started,remote:true});
  paint(id);
  if(fraction>=1){
   route.index++;
   route.started=now;
  }
  route.handle=requestFrame(()=>advanceRemoteRoute(id));
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
   // A React commit may alter the base left/top. A late canonical rebind
   // finishes the handoff even after the short settle timer has expired.
   const preview=previews.get(id);
   if(preview?.settling&&preview.x===x&&preview.y===y&&
      (kind==='sprite'||!positions.has('sprite'))){
    cancelSettle(id);previews.delete(id);
   }
   paint(id);
  },
  preview(id,x,y){
   if(disposed||!id||!number(x)||!number(y))return;
   stopRemoteRoute(id);
   cancelSettle(id);
   previews.set(id,{x,y,remote:false});
   requestedAt.set(id,{time:clock(),remote:false});schedule(id);
  },
  previewRemote(id,x,y){
   if(disposed||!id||!number(x)||!number(y))return;
   stopRemoteRoute(id);
   cancelSettle(id);
   previews.set(id,{x,y,remote:true});
   requestedAt.set(id,{time:clock(),remote:true});schedule(id);
  },
  previewRemotePath(id,path){
   if(disposed||!id||!validVerifiedObserverPath(path))return false;
   const existing=remoteRoutes.get(id);
   if(existing){
    const appended=appendVerifiedObserverPoints(existing.points,path);
    if(!appended)return false;
    existing.points=appended;return true;
   }
   const nodes=mounted.get(id);
   const mountedCell=nodes?.get('sprite')||nodes?.values().next().value;
   const preview=previews.get(id);
   const current=preview?.remote?preview:mountedCell;
   // Missing packets are NOT permission to draw a straight line between
   // unrelated visible coordinates. Wait for canonical/RLS reconciliation.
   if(!sameObserverCell(current,path[0]))return false;
   cancelSettle(id);
   const route={points:[...path],index:0,started:clock(),handle:null,
    settleAt:null,handoffPending:false};
   remoteRoutes.set(id,route);
   movementDiagnostics.count('observerValidatedPathAccepted');
   route.handle=requestFrame(()=>advanceRemoteRoute(id));
   return true;
  },
  // An authoritative final position may differ from the last throttled
  // preview packet. Ease to that final cell, then drop the overlay only
  // after its 95ms CSS interpolation and React position commit are complete.
  settleRemote(id,x,y){
   const route=remoteRoutes.get(id);
   if(route&&number(x)&&number(y)){
    route.settleAt={x,y};
    return true;
   }
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
   const route=remoteRoutes.get(id);
   if(route){route.handoffPending=true;return true}
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
   stopRemoteRoute(id);
   cancelSettle(id);
   if(!previews.delete(id))return;
   schedule(id);
  },
  clear(){
   for(const id of remoteRoutes.keys())stopRemoteRoute(id);
   for(const id of settleTimers.keys())cancelSettle(id);
   previews.clear();requestedAt.clear();
   if(scheduled!==null){cancelFrame(scheduled);scheduled=null}
   dirty.clear();
   for(const id of mounted.keys())paint(id);
  },
  dispose(){
   for(const id of remoteRoutes.keys())stopRemoteRoute(id);
   for(const id of settleTimers.keys())cancelSettle(id);
   if(scheduled!==null)cancelFrame(scheduled);
   scheduled=null;disposed=true;dirty.clear();requestedAt.clear();previews.clear();mounted.clear();
  },
  getPreview(id){return previews.get(id)||null}
 };
}
