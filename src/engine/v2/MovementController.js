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
const noop=()=>{};
/** Only fixed, non-private rejection classes are exposed to in-memory trace. */
export function classifyWorldMovementRejection(reason){
 if(['invalid-path','invalid-authority-ack','invalid-commit',
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
 trace=worldV2Trace}={}){
 if(!authority||!['begin','advance','commit','cancel'].every(key=>typeof authority[key]==='function')||
  typeof onEvent!=='function'||typeof canPredict!=='function'||
  typeof trace?.event!=='function')
  throw Error('V2 movement requires a complete authority interface');
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
  // R18-35: expose only a locally computed, server-ACKed zero-motion
  // gesture state to the renderer and queued keyboard continuation.
  // No new RPC, authority path, preview operation or write permission.
  emit(g,result.status,{reason:result.reason||null,
   ...(result.noMotion===true?{noMotion:true}:{})});
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
     // R18-31: detach ONLY this already-validated batch before its RPC.
     // Pointer updates during the network wait are then retained as future
     // input, instead of being accidentally removed by a late Advance ACK.
     g.pending.splice(0,batch.consumed);
     g.inFlightTarget={...batch.targets.at(-1)};
     const before={...g.approved},seq=++g.seq;
     g.phase='advance';
     let response;
     try{
      response=await authority.advance({
       version:2,mapId:g.mapId,sessionId:g.sessionId,gestureId:g.generation,
       seq,from:before,targets:batch.targets,selection:g.selection,
       environmentRevision:g.environmentRevision,permissionGeneration:g.permissionGeneration
      });
     }finally{
      // Future input may start from the submitted target while awaiting.
      // Clear it even on a failed/cancelled request; rejection remains
      // governed solely by the existing authoritative ACK checks.
      g.inFlightTarget=null;
     }
     if(active!==g)break;
     if(!validAck(response,g.sessionId,seq,before,batch.targets)){
      reject(g,'invalid-authority-ack');break;
     }
     if(response.accepted.length){
      g.approved={...response.accepted.at(-1)};
      g.hadMotion=true;
     }
     // A denied crossing invalidates all route bends based on the
     // unapproved in-flight target. Only the NEWEST input received *during*
     // this RPC may independently describe a sideways turn. It is not
     // authorized by this response and must be rebased on its ACKed endpoint.
     const newestAfterFlight=response.blocked&&
      ['drag','touch','preview'].includes(g.mode)&&g.pending.length?
      {...g.pending.at(-1)}:null;
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
      // R18-40: only rebase a genuinely different first step. Straight
      // extensions crossing the same denied wall are discarded, preventing
      // collision-probing retry loops. The next Advance uses the standard
      // server authority and the last exactly validated approved endpoint.
      if(newestAfterFlight&&blockedAt){
       const rebased=expandGestureRoute(g.approved,[newestAfterFlight],
        {maxCells:512});
       const first=rebased?.[0];
       if(first&&(first.x!==blockedAt.x||first.y!==blockedAt.y)){
        if(!appendGestureBend(g.pending,newestAfterFlight,g.approved)){
         g.phase='path';reject(g,'path-limit');break;
        }
        g.blockedRetry=null;
       }
      }
      emit(g,response.blocked?'blocked':'approved',{
       seq,blocked:response.blocked,from:before,
       accepted:response.accepted.map(p=>({...p})),blockedAt
      });
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
 // R18-38: the same existing gesture pipeline is used for every raw
 // cell crossing. Suppress unpaintable intermediate sampled/presented
 // callbacks only when a browser event carries multiple coalesced samples.
 function updatePointer(pointer,publish=true){
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
   if(g.pending.length){
    state='Moving';
    if(publish)emit(g,'sampled',{intended:cell});
   }
   // A synchronous caller-supplied grant check must approve the *entire*
   // displacement. Default is false: no speculative hidden-wall travel.
   // Only aggregate counts and CPU durations are recorded in opt-in QA.
   if(!publish)trace.count?.('movement.prediction-skipped');
   if(publish){
   trace.count?.('movement.prediction-checked');
   const predictionDone=trace.enabled?
    trace.begin?.('movement.prediction-check'):null;
   let approvedPrediction=false;
   try{approvedPrediction=canPredict({
    mapId:g.mapId,selection:g.selection,from:{...g.approved},
    to:cell,pointer:{...pointer},mode:g.mode,
    environmentRevision:g.environmentRevision,
    permissionGeneration:g.permissionGeneration
   })===true}catch{}finally{predictionDone?.()}
   if(approvedPrediction){
    g.presented={...pointer};g.predicted=true;
     emit(g,'presented',{predicted:true});
   }
   }
   if(g.sessionId)void drain(g);
   return true;
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
  updateGesture(pointer){return updatePointer(pointer)},
  updateGestureSamples(samples){
   // Preserve every coalesced sample's ordered grid intent, including turns
   // and reversals. Only the final sub-frame sample may be painted after
   // this synchronous native pointer event, so only it needs the costly
   // local collision/prediction check. Existing authority RPCs, permissions,
   // blocked replies and canonical commits are unchanged.
   if(!Array.isArray(samples)||!samples.length)return false;
   for(let i=0;i<samples.length;i++)
    if(!updatePointer(samples[i],i===samples.length-1))return false;
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
