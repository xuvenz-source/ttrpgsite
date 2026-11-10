import {worldV2Trace} from './WorldTrace.js';
import {appendGestureBend,expandGestureRoute,gridPoint,takeGestureBatch} from './GesturePath.js';
import {certifiedMotionMatchesSight} from './CertifiedMotionPresentation.js';

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
const predictionReached=(origin,predicted,approved)=>{
 const dx=predicted.x-origin.x,dy=predicted.y-origin.y;
 const d=dx*dx+dy*dy;
 return d<=1e-9||(approved.x-origin.x)*dx+
  (approved.y-origin.y)*dy>=d-1e-7;
};
export function createMovementController({
 authority,onEvent=noop,canPredict=()=>false,
 // B06 is independent of B05 and stays OFF until explicitly enabled.
 certifiedMotion=false,certifyPresentation=()=>null,
 // B05 staged opt-in. The existing adapter stays the default until Gate B.
 coalesceMotion=false,coalesceWindowMs=16,authorityTimeoutMs=8000,
 setTimer=(callback,ms)=>setTimeout(callback,ms),
 clearTimer=timer=>clearTimeout(timer)
}={}){
 if(!authority||!['begin','advance','commit','cancel'].every(key=>typeof authority[key]==='function')||
  typeof onEvent!=='function'||typeof canPredict!=='function'||
  typeof certifiedMotion!=='boolean'||typeof certifyPresentation!=='function'||
  typeof coalesceMotion!=='boolean'||
  !Number.isSafeInteger(coalesceWindowMs)||coalesceWindowMs<0||coalesceWindowMs>32||
  !Number.isSafeInteger(authorityTimeoutMs)||
  authorityTimeoutMs<1000||authorityTimeoutMs>9000||
  typeof setTimer!=='function'||typeof clearTimer!=='function')
  throw Error('V2 movement requires a complete authority interface');
 let active=null,disposed=false,state='Idle',generation=0;
 const clearFlush=g=>{
  if(g.flushTimer!==null){clearTimer(g.flushTimer);g.flushTimer=null}
 };
 // A stalled or malicious server must never hold local input hostage
 // indefinitely. Cancellation is best effort; expiry remains server owned.
 // Late begin ACKs are retired, never promoted into a new gesture.
 const bounded=(task,onLate=noop)=>{
  if(!coalesceMotion)return Promise.resolve(task);
  return new Promise((resolve,reject)=>{
   let status='pending';
   const timer=setTimer(()=>{
    if(status!=='pending')return;
    status='timed-out';reject(Error('authority-timeout'));
   },authorityTimeoutMs);
   Promise.resolve(task).then(value=>{
    if(status==='timed-out'){
     try{onLate(value)}catch{}return;
    }
    if(status!=='pending')return;
    status='done';clearTimer(timer);resolve(value);
   },error=>{
    if(status!=='pending')return;
    status='done';clearTimer(timer);reject(error);
   });
  });
 };
 const emit=(gesture,type,extra={})=>{
  if(type!=='sampled'&&type!=='presented')
   worldV2Trace.event('movement.'+type,gesture.mode);
  onEvent({type,state,gestureId:gesture.generation,mapId:gesture.mapId,
   selection:gesture.selection,pointer:{...gesture.pointer},
   approved:{...gesture.approved},presented:{...gesture.presented},...extra});
 };
 const finish=(g,result)=>{
  clearFlush(g);
  if(active===g)active=null;
  state=result.status==='committed'?'Committed':
   result.status==='revoked'?'Revoked':
   result.status==='cancelled'?'Cancelled':'Rejected';
  emit(g,result.status,{reason:result.reason||null});
  if(g.resolveFinish){g.resolveFinish(result);g.resolveFinish=null}
 };
 const retireSession=(g,sessionId)=>{
  if(!sessionId)return;
  // The server remains responsible for rejecting stale/foreign session
  // changes. Late responses never authorize a local position.
  void Promise.resolve().then(()=>authority.cancel({
   mapId:g.mapId,sessionId,gestureId:g.generation
  })).catch(noop);
 };
 const cancelSession=g=>retireSession(g,g.sessionId);
 const scheduleDrain=g=>{
  if(active!==g||!g.sessionId||g.draining)return;
  if(!coalesceMotion||g.closing||g.mode==='preview'||coalesceWindowMs===0){
   clearFlush(g);void drain(g);return;
  }
  if(g.pending.length&&g.flushTimer===null){
   g.flushTimer=setTimer(()=>{
    g.flushTimer=null;
    if(active===g)void drain(g);
   },coalesceWindowMs);
  }
 };
 const reject=(g,reason)=>{
  if(active!==g)return;
  finish(g,{status:'rejected',reason});
  cancelSession(g);
 };
 async function drain(g){
  if(g.draining||active!==g||!g.sessionId)return;
  clearFlush(g);
  g.draining=true;
  try{
   while(active===g){
    if(g.pending.length){
     const snapshot=g.pending.slice();
     const batch=takeGestureBatch(g.approved,snapshot);
     if(!batch||!batch.targets.length){reject(g,'invalid-path');break}
     const before={...g.approved},seq=++g.seq;
     if(coalesceMotion){
      // Detach the exact request BEFORE yielding. Pointer samples arriving
      // while it is pending must never be silently spliced/deleted at ACK.
      g.pending=batch.remaining.map(p=>({...p}));
      g.queueFrom={...batch.targets.at(-1)};
     }
     const response=await bounded(authority.advance({
      version:2,mapId:g.mapId,sessionId:g.sessionId,gestureId:g.generation,
      seq,from:before,targets:batch.targets,selection:g.selection,
      environmentRevision:g.environmentRevision,permissionGeneration:g.permissionGeneration
     }));
     if(active!==g)break;
     if(!validAck(response,g.sessionId,seq,before,batch.targets)){
      reject(g,'invalid-authority-ack');break;
     }
     if(!coalesceMotion)g.pending.splice(0,batch.consumed);
     if(response.accepted.length){
      g.approved={...response.accepted.at(-1)};
      g.hadMotion=true;
     }
     // A denied crossing invalidates the entire unapproved route.
     if(response.blocked){
      g.pending.length=0;
      if(coalesceMotion)g.queueFrom={...g.approved};
     }
     // Never carry a one-cell snapshot grant across a newly approved
     // server waypoint. A new prediction requires a current signed sight.
     if(certifiedMotion){
      g.certificate=null;
      g.predicted=false;
      g.presented={...g.approved};
     }
     if(response.blocked||!g.predicted||
       predictionReached(g.origin,g.presented,g.approved)){
       g.presented={...g.approved};g.predicted=false;
      }
      state=g.closing?'Finishing':'Moving';
      emit(g,response.blocked?'blocked':'approved',{
       seq,blocked:response.blocked,from:before,
       accepted:response.accepted.map(p=>({...p}))
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
    const reply=await bounded(authority.commit({
     version:2,mapId:g.mapId,sessionId:g.sessionId,gestureId:g.generation,
     seq,endpoint:{...g.approved},selection:g.selection,
     environmentRevision:g.environmentRevision,permissionGeneration:g.permissionGeneration
    }));
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
    pending:[],queueFrom:{...origin},flushTimer:null,
    seq:0,mode,sessionId:null,closing:false,
     predicted:false,
    draining:false,hadMotion:false,resolveFinish:null,finishPromise:null,
    certificate:null,
    environmentRevision,permissionGeneration};
   active=g;state='Grabbed';
   emit(g,'grabbed'); // immediate, before any asynchronous permission operation
   void Promise.resolve().then(()=>bounded(authority.begin({
    version:2,mapId,gestureId:g.generation,selection:g.selection,mode,
    origin:g.origin,environmentRevision,permissionGeneration,
    collisionOverride
   }),late=>{
    if(validSession(late))retireSession(g,late.sessionId);
   })).then(reply=>{
    if(!validSession(reply))throw Error('invalid-session');
    g.sessionId=reply.sessionId;
    if(active!==g){cancelSession(g);return}
    scheduleDrain(g);
   }).catch(error=>{
    if(active===g)reject(g,error?.message||'begin-failed');
   });
   return true;
  },
  updateGesture(pointer){
   const g=active;
   if(disposed||!g||g.closing||!validPoint(pointer))return false;
   const cell=gridPoint(pointer);
   if(!cell||!appendGestureBend(g.pending,cell,
     coalesceMotion?g.queueFrom:g.approved)){
    reject(g,'path-limit');return false;
   }
   g.pointer={...pointer};
   if(g.pending.length){state='Moving';emit(g,'sampled',{intended:cell})}
   // B06 accepts only a current frame-bound one-cell certificate from the
   // trusted visibility adapter. Old clients keep the original predictor.
   const request={
    mapId:g.mapId,selection:g.selection,from:{...g.approved},
    to:cell,pointer:{...pointer},mode:g.mode,
    environmentRevision:g.environmentRevision,
    permissionGeneration:g.permissionGeneration
   };
   let certificate=null,approvedPrediction=false;
   if(certifiedMotion){
    try{certificate=certifyPresentation(request)}catch{}
    approvedPrediction=certificate?.scope==='viewer'&&
     certificate.mapId===g.mapId&&
     certificate.environmentRevision===g.environmentRevision&&
     certificate.permissionGeneration===g.permissionGeneration&&
     Number.isSafeInteger(certificate.cursor)&&certificate.cursor>=0&&
     Number.isSafeInteger(certificate.visionEpoch)&&certificate.visionEpoch>=0&&
     Number.isSafeInteger(certificate.sceneGeneration)&&certificate.sceneGeneration>=0&&
     certificate.from?.x===g.approved.x&&certificate.from?.y===g.approved.y&&
     certificate.position?.x===pointer.x&&certificate.position?.y===pointer.y;
   }else{
    try{approvedPrediction=canPredict(request)===true}catch{}
   }
   if(approvedPrediction){
    g.presented={...pointer};g.predicted=true;
    if(certifiedMotion)g.certificate=certificate;
    emit(g,'presented',{predicted:true,
     ...(certifiedMotion?{certificate}:{}),
     from:{...g.approved}});
   }else if(certifiedMotion&&g.certificate){
    // Pointer left the ONLY certified square; do not retain a stale
    // cosmetic position while later packets travel toward unknown walls.
    g.certificate=null;g.predicted=false;
    g.presented={...g.approved};
    emit(g,'presentation-reset');
   }
   if(g.sessionId)scheduleDrain(g);
   return true;
  },
  endGesture(pointer){
   const g=active;
   if(!g)return Promise.resolve({status:'idle'});
   if(!g.closing&&pointer&&validPoint(pointer))this.updateGesture(pointer);
   if(active!==g)return Promise.resolve({status:'rejected'});
   if(g.finishPromise)return g.finishPromise;
   g.closing=true;state='Finishing';emit(g,'released');
   g.finishPromise=new Promise(resolve=>{g.resolveFinish=resolve});
   if(g.sessionId)scheduleDrain(g);
   return g.finishPromise;
  },
  cancelGesture(reason='user'){
   const g=active;
   if(!g)return false;
   finish(g,{status:reason==='permission'?'revoked':'cancelled',reason});
   cancelSession(g);
   return true;
  },
  // A refreshed signed sight (including cursor/vision epoch changes) is
  // not interchangeable with the one that certified a speculative sprite.
  // Reconcile immediately, even with no additional pointermove event.
  syncCertifiedSight({frame,scene}={}){
   const g=active;
   if(!certifiedMotion||!g||!g.certificate)return false;
   if(certifiedMotionMatchesSight(g.certificate,frame,scene))
    return true;
   g.certificate=null;g.predicted=false;g.presented={...g.approved};
   emit(g,'presentation-reset');
   return false;
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
