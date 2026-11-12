import {worldV2Trace} from './WorldTrace.js';
import {appendGestureBend,expandGestureRoute,gridPoint,takeGestureBatch} from './GesturePath.js';
import {pointerIntentCell} from './PointerIntentCell.js';

/** V2 gesture orchestration. This is deliberately isolated from live RPCs.
 * Authority adapter MUST be backed by server validation in later phases.
 */
const terminal=new Set(['Committed','Cancelled','Rejected','Revoked']);
const validPoint=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
const validSelection=selection=>Array.isArray(selection)&&selection.length>0&&selection.length<=48&&
 selection.every(p=>['token','tool'].includes(p?.kind)&&typeof p.id==='string'&&p.id.length>0)&&
 new Set(selection.map(p=>p.kind+':'+p.id)).size===selection.length;
const validSession=r=>r?.version===2&&typeof r.sessionId==='string'&&r.sessionId.length>0;
const validAck=(reply,sessionId,seq,from,targets)=>{
 if(!reply||reply.version!==2||reply.sessionId!==sessionId||reply.seq!==seq||
  typeof reply.blocked!=='boolean'||!Array.isArray(reply.accepted)||
  Object.keys(reply).some(k=>!['version','sessionId','seq','blocked','accepted','revision'].includes(k))||
  (reply.revision!==undefined&&(!Number.isSafeInteger(reply.revision)||reply.revision<0)))
  return false;
 const expected=expandGestureRoute(from,targets);
 if(!expected||reply.accepted.length>expected.length)return false;
 if(!reply.blocked&&reply.accepted.length!==expected.length)return false;
 for(let i=0;i<reply.accepted.length;i++){
  const point=reply.accepted[i],wanted=expected[i];
  if(!Number.isSafeInteger(point?.x)||!Number.isSafeInteger(point?.y)||
   Object.keys(point).some(k=>!['x','y'].includes(k))||
   point.x!==wanted.x||point.y!==wanted.y)return false;
 }
 return true;
};
/**
 * Validate the ENTIRE new R18-28 terminal wire reply before using even a
 * single accepted position. Only the original route's exact 8-connected
 * server-approved prefix is permitted; an endpoint is never client-invented.
 */
export function validAtomicFinalizationAck(reply,sessionId,seq,from,targets,previousMotion=false){
 if(!reply||reply.version!==2||reply.sessionId!==sessionId||
  reply.seq!==seq||reply.commitSeq!==seq+1||
  reply.finalized!==true||typeof reply.blocked!=='boolean'||
  (reply.noMotion!==undefined&&reply.noMotion!==true)||
  !Array.isArray(reply.accepted)||
  Object.keys(reply).some(k=>![
   'version','sessionId','seq','commitSeq','finalized',
   'blocked','accepted','endpoint','noMotion'
  ].includes(k)))return false;
 const expected=expandGestureRoute(from,targets);
 if(!expected||reply.accepted.length>expected.length||
  (!reply.blocked&&reply.accepted.length!==expected.length))return false;
 // Two source-authorized blocked-only terminal states are deliberately distinct.
 if(!reply.accepted.length){
  if(!reply.blocked||!Object.keys(reply.endpoint||{}).every(
    key=>['x','y'].includes(key))||
    Object.keys(reply.endpoint||{}).length!==2||
    !Number.isSafeInteger(reply.endpoint?.x)||
    !Number.isSafeInteger(reply.endpoint?.y)||
    reply.endpoint.x!==from.x||reply.endpoint.y!==from.y)
   return false;
  // No-motion receipts require no prior approved steps. Otherwise the
  // existing canonical Commit must have persisted all prior steps.
  return previousMotion?
   reply.noMotion===undefined:
   reply.noMotion===true;
 }
 if(reply.noMotion!==undefined)return false;
 for(let i=0;i<reply.accepted.length;i++){
  const p=reply.accepted[i],want=expected[i];
  if(!p||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||
   Object.keys(p).some(k=>!['x','y'].includes(k))||
   p.x!==want.x||p.y!==want.y)return false;
 }
 const endpoint=reply.endpoint,last=reply.accepted.at(-1);
 return !!endpoint&&Number.isSafeInteger(endpoint.x)&&
  Number.isSafeInteger(endpoint.y)&&
  Object.keys(endpoint).length===2&&
  Object.keys(endpoint).every(k=>['x','y'].includes(k))&&
  endpoint.x===last.x&&endpoint.y===last.y;
}
const noop=()=>{};
/** Only fixed, non-private rejection classes are exposed to in-memory trace. */
export function classifyWorldMovementRejection(reason){
 if(['invalid-path','invalid-authority-ack','invalid-commit',
     'invalid-final-ack',
     'begin-failed','invalid-session','path-limit','authority-error']
     .includes(reason))return reason;
 if(reason==='World movement server unavailable')return 'rpc-unavailable';
 if(reason==='Invalid world movement response')return 'invalid-server-reply';
 if(['Invalid V2 begin request','Invalid V2 movement batch',
     'Invalid V2 commit'].includes(reason))return 'client-contract';
 if(reason==='V2 movement cancelled')return 'session-cancelled';
 return 'other';
}
const predictionReached=(origin,predicted,approved)=>{
 const dx=predicted.x-origin.x,dy=predicted.y-origin.y;
 const d=dx*dx+dy*dy;
 return d<=1e-9||(approved.x-origin.x)*dx+
  (approved.y-origin.y)*dy>=d-1e-7;
};
export function createMovementController({authority,onEvent=noop,canPredict=()=>false,
 trace=worldV2Trace,enableAtomicFinalize=false}={}){
 if(!authority||!['begin','advance','commit','cancel'].every(key=>typeof authority[key]==='function')||
  typeof onEvent!=='function'||typeof canPredict!=='function'||
  typeof trace?.event!=='function')
  throw Error('V2 movement requires a complete authority interface');
 if(typeof enableAtomicFinalize!=='boolean'||
   (enableAtomicFinalize&&typeof authority.finalize!=='function'))
  throw Error('Invalid V2 atomic finalize feature gate');
 let active=null,disposed=false,state='Idle',generation=0;
 const emit=(gesture,type,extra={})=>{
  if(type!=='sampled'&&type!=='presented')
   trace.event('movement.'+type,gesture.mode);
  onEvent({type,state,gestureId:gesture.generation,mapId:gesture.mapId,
   selection:gesture.selection,pointer:{...gesture.pointer},
   approved:{...gesture.approved},presented:{...gesture.presented},...extra});
 };
 const finish=(g,result)=>{
  if(active===g)active=null;
  // Measure the entire client lockout after pointer/key release, including
  // remaining authorized advances, terminal commit, and cancellation.
  g.releaseTimer?.(result.status==='committed'?'ok':'error');
  g.releaseTimer=null;
  state=result.status==='committed'?'Committed':
   result.status==='revoked'?'Revoked':
   result.status==='cancelled'?'Cancelled':'Rejected';
  emit(g,result.status,{
   reason:result.reason||null,
   ...(result.noMotion?{noMotion:true}:{})
  });
  if(g.resolveFinish){g.resolveFinish(result);g.resolveFinish=null}
 };
 const cancelSession=g=>{
  if(!g.sessionId)return;
  // Never allow a stale cleanup to mutate a later gesture locally.
  void Promise.resolve().then(()=>authority.cancel({
   mapId:g.mapId,sessionId:g.sessionId,gestureId:g.generation
  })).catch(noop);
 };
 const reject=(g,reason)=>{
  if(active!==g)return;
  trace.event('movement.reject-phase',g.phase);
  trace.event('movement.reject-reason',classifyWorldMovementRejection(reason));
  finish(g,{status:'rejected',reason});
  cancelSession(g);
 };
 async function drain(g){
  if(g.draining||active!==g||!g.sessionId)return;
  g.draining=true;
  try{
   while(active===g){
    if(g.pending.length){
     const snapshot=g.pending.slice();
     const batch=takeGestureBatch(g.approved,snapshot);
     if(!batch||!batch.targets.length){g.phase='path';reject(g,'invalid-path');break}
     // Hand the already-chosen waypoints to the in-flight RPC BEFORE
     // awaiting it. A pointer move arriving during the network wait must
     // add a fresh future waypoint, not overwrite the head of this batch
     // and then have that new intent discarded by the eventual ACK.
     g.pending.splice(0,batch.consumed);
     g.inFlightTarget={...batch.targets.at(-1)};
     const before={...g.approved},seq=++g.seq;
     // Only a CLOSING, COMPLETELY FITTING, real-player last batch can
     // replace the final Advance+Commit with the optional atomic RPC.
     // A long gesture still uses exactly the existing bounded Advance
     // path until its final batch. Preview never touches server Commit.
     const finalizing=enableAtomicFinalize&&g.closing&&
      g.mode!=='preview'&&batch.remaining.length===0;
     g.phase=finalizing?'finalize':'advance';
     const request={
      version:2,mapId:g.mapId,sessionId:g.sessionId,gestureId:g.generation,
      seq,from:before,targets:batch.targets,selection:g.selection,
      environmentRevision:g.environmentRevision,permissionGeneration:g.permissionGeneration
     };
     // A potentially committed but lost final reply must NOT be retried
     // through legacy Advance or Commit. The authority adapter may replay
     // ONLY the identical finalization request once.
     let response;
     try{
      response=await (finalizing?
       authority.finalize(request):authority.advance(request));
     }finally{
      // While the server was busy, new input was based on this
      // in-flight endpoint rather than the stale approved position.
      g.inFlightTarget=null;
     }
     if(active!==g)break;
     if(!(finalizing?
      validAtomicFinalizationAck(response,g.sessionId,seq,before,batch.targets,g.hadMotion):
      validAck(response,g.sessionId,seq,before,batch.targets))){
      reject(g,finalizing?'invalid-final-ack':'invalid-authority-ack');break;
     }
     if(response.accepted.length){
      g.approved={...response.accepted.at(-1)};
      g.hadMotion=true;
     }
     // A denied crossing invalidates the entire unapproved route.
     // Remember ONLY the explicitly denied, server-ACKed target while
     // the approved origin remains unchanged. Repeated pointer events on
     // that exact target must not create an endless collision RPC loop.
     if(response.blocked)g.pending.length=0;
     if(response.blocked||!g.predicted||
       predictionReached(g.origin,g.presented,g.approved)){
       g.presented={...g.approved};g.predicted=false;
      }
      state=g.closing?'Finishing':'Moving';
      // The denied waypoint is derived solely from the validated ACK
      // prefix and this client's requested route. It is local input feedback,
      // never an authorization to reveal a hidden wall or move a sprite.
      const route=response.blocked?expandGestureRoute(before,batch.targets):null;
      const blockedAt=route&&response.accepted.length<route.length?
       {...route[response.accepted.length]}:null;
      g.blockedRetry=response.blocked&&blockedAt&&
       ['drag','touch','preview'].includes(g.mode)?{
        from:{...g.approved},to:{...batch.targets.at(-1)}
       }:null;
      emit(g,response.blocked?'blocked':'approved',{
       seq,blocked:response.blocked,from:before,
       accepted:response.accepted.map(p=>({...p})),blockedAt
      });
      if(finalizing){
       // Commit already happened server-side; NEVER send a second Commit.
       // Event callbacks may have revoked the gesture, so check identity
       // again before accepting the final canonical endpoint.
       if(active===g){
        g.seq=seq+1;
        finish(g,{status:'committed',endpoint:{...g.approved},
         noMotion:response.noMotion===true});
       }
       break;
      }
     continue;
    }
    if(!g.closing)break;
    if(!g.hadMotion||g.mode==='preview'){
     cancelSession(g);
     finish(g,{status:'committed',preview:g.mode==='preview',noMotion:!g.hadMotion});
     break;
    }
    const seq=++g.seq;
    g.phase='commit';
    const reply=await authority.commit({
     version:2,mapId:g.mapId,sessionId:g.sessionId,gestureId:g.generation,
     seq,endpoint:{...g.approved},selection:g.selection,
     environmentRevision:g.environmentRevision,permissionGeneration:g.permissionGeneration
    });
    if(active!==g)break;
    if(!validSession(reply)||reply.sessionId!==g.sessionId||reply.seq!==seq||
     !Number.isSafeInteger(reply.endpoint?.x)||!Number.isSafeInteger(reply.endpoint?.y)||
     reply.endpoint.x!==g.approved.x||reply.endpoint.y!==g.approved.y){
     reject(g,'invalid-commit');break;
    }
    finish(g,{status:'committed',endpoint:{...g.approved}});
    break;
   }
  }catch(error){
   if(active===g)reject(g,error?.message||'authority-error');
  }finally{
   g.draining=false;
   if(active===g&&g.sessionId&&(g.pending.length||g.closing))
    void drain(g);
  }
 }
 return {
  get state(){return state},
  get active(){return !!active},
  beginGesture({mapId,selection,origin,pointer,mode='drag',
   environmentRevision=0,permissionGeneration=0,collisionOverride=false}={}){
   if(disposed||active||typeof mapId!=='string'||!mapId||
    !validSelection(selection)||!['drag','touch','keyboard','preview'].includes(mode)||
    !validPoint(origin)||!Number.isSafeInteger(origin.x)||!Number.isSafeInteger(origin.y)||
    !validPoint(pointer)||!Number.isSafeInteger(environmentRevision)||environmentRevision<0||
    !Number.isSafeInteger(permissionGeneration)||permissionGeneration<0||
    typeof collisionOverride!=='boolean')return false;
   const g={generation:++generation,mapId,
    selection:selection.map(p=>({kind:p.kind,id:p.id})),origin:{...origin},
    pointer:{...pointer},approved:{...origin},presented:{...origin},
    pending:[],inFlightTarget:null,seq:0,mode,phase:'begin',sessionId:null,closing:false,
    intentCell:{...origin},blockedRetry:null,releaseTimer:null,
    predicted:false,
    draining:false,hadMotion:false,resolveFinish:null,finishPromise:null,
    environmentRevision,permissionGeneration};
   active=g;state='Grabbed';
   emit(g,'grabbed'); // immediate, before any asynchronous permission operation
   void Promise.resolve().then(()=>authority.begin({
    version:2,mapId,gestureId:g.generation,selection:g.selection,mode,
    origin:g.origin,environmentRevision,permissionGeneration,
    collisionOverride
   })).then(reply=>{
    if(!validSession(reply))throw Error('invalid-session');
    g.sessionId=reply.sessionId;
    if(active!==g){cancelSession(g);return}
    void drain(g);
   }).catch(error=>{
    if(active===g)reject(g,error?.message||'begin-failed');
   });
   return true;
  },
  updateGesture(pointer){
   const g=active;
   if(disposed||!g||g.closing||!validPoint(pointer))return false;
   // Hysteresis is only for pointer input. A near-half-cell corner must
   // not fill the path queue with alternating jitter cells.
   const cell=['drag','touch','preview'].includes(g.mode)?
    pointerIntentCell(pointer,g.intentCell):gridPoint(pointer);
   if(!cell){
    g.phase='path';reject(g,'path-limit');return false;
   }
   g.pointer={...pointer};g.intentCell={...cell};
   if(g.pending.length===0&&g.blockedRetry&&
    g.blockedRetry.from.x===g.approved.x&&
    g.blockedRetry.from.y===g.approved.y&&
    g.blockedRetry.to.x===cell.x&&g.blockedRetry.to.y===cell.y){
    // Suppress ONLY the exact previously denied target at this
    // unchanged server-approved origin. Preserve any queued turns.
    return true;
   }
   g.blockedRetry=null;
   if(!appendGestureBend(g.pending,cell,g.inFlightTarget??g.approved)){
    g.phase='path';reject(g,'path-limit');return false;
   }
   if(g.pending.length){state='Moving';emit(g,'sampled',{intended:cell})}
   // A synchronous caller-supplied grant check must approve the *entire*
   // displacement. Default is false: no speculative hidden-wall travel.
   let approvedPrediction=false;
   try{approvedPrediction=canPredict({
    mapId:g.mapId,selection:g.selection,from:{...g.approved},
    to:cell,pointer:{...pointer},mode:g.mode,
    environmentRevision:g.environmentRevision,
    permissionGeneration:g.permissionGeneration
   })===true}catch{}
   if(approvedPrediction){
    g.presented={...pointer};g.predicted=true;
     emit(g,'presented',{predicted:true});
   }
   if(g.sessionId)void drain(g);
   return true;
  },
  endGesture(pointer){
   const g=active;
   if(!g)return Promise.resolve({status:'idle'});
   if(!g.closing&&pointer&&validPoint(pointer))this.updateGesture(pointer);
   if(active!==g)return Promise.resolve({status:'rejected'});
   if(g.finishPromise)return g.finishPromise;
   g.closing=true;state='Finishing';
   g.releaseTimer=trace.begin?.('movement.release-to-terminal')??null;
   emit(g,'released');
   g.finishPromise=new Promise(resolve=>{g.resolveFinish=resolve});
   if(g.sessionId)void drain(g);
   return g.finishPromise;
  },
  cancelGesture(reason='user'){
   const g=active;
   if(!g)return false;
   trace.event('movement.cancel-reason',reason);
   finish(g,{status:reason==='permission'?'revoked':'cancelled',reason});
   cancelSession(g);
   return true;
  },
  updateContext({mapId,environmentRevision,permissionGeneration}={}){
   const g=active;if(!g)return;
   if(mapId!==undefined&&mapId!==g.mapId) this.cancelGesture('map-change');
   else if(permissionGeneration!==undefined&&permissionGeneration!==g.permissionGeneration)
    this.cancelGesture('permission');
   else if(environmentRevision!==undefined&&environmentRevision!==g.environmentRevision)
    this.cancelGesture('scene-change');
  },
  dispose(){
   if(disposed)return;
   this.cancelGesture('dispose');disposed=true;state='Disposed';
  }
 };
}
