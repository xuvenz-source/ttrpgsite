/**
 * R18-135 DORMANT client V3 observer bridge.
 *
 * Reuses the existing V2 observer's bounded cursor, concealed roster,
 * sequence-gap and signed-sight logic WITHOUT copying movement code.
 * The underlying Supabase channel is ALWAYS recipient-epoch V3.
 * The old V2 topic is accepted only as a local V2 transport call signature
 * and NEVER passed to Supabase. This module does NOT authorize a user or
 * disconnect a different already-joined legacy browser.
 *
 * NOT imported by src/. NO live app, SQL, migration or network deployment.
 */
import {validWorldObserverSnapshot} from
 '../../src/engine/v2/RealtimeTransport.js';

export const R135_LIVE_ENABLED=false;
export const R135_OBSERVER_EVENTS=Object.freeze([
 'world-motion-v2','world-vision-v2'
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad=code=>Object.assign(new Error('V3 observer requires fresh signed access.'),{code});
const fn=x=>typeof x==='function';
const same=(a,b)=>!!a&&!!b&&
 a.campaignId===b.campaignId&&a.mapId===b.mapId&&
 a.viewerId===b.viewerId;
const safe=(cb,arg)=>{try{cb(arg)}catch{}};
const expectedV2=(map,viewer)=>'forge-world-v2:'+map+':'+viewer;
const scenePrefix='forge-world-scene-v3:';
const observerPrefix='forge-world-observer-v3:';
function signedTopic(value,map,viewer){
 if(typeof value!=='string'||value.split(':').length!==4||
    !value.startsWith(scenePrefix))return null;
 const [prefix,m,v,epoch]=value.split(':');
 if(prefix!=='forge-world-scene-v3'||!UUID.test(m)||!UUID.test(v)||
  !UUID.test(epoch)||/^00000000-0000-0000-0000-000000000000$/i.test(epoch)||
  m.toLowerCase()!==map.toLowerCase()||
  v.toLowerCase()!==viewer.toLowerCase())return null;
 return observerPrefix+m+':'+v+':'+epoch;
}
export function createObserverV3ChannelBridge({
 db,campaignId,mapId,viewerId,getContext,createLegacyTransport,
 fetchAuthorizedSight,onMask,onObserverReady=()=>{},
 onPath=()=>{},onHide=()=>{},onVisionDirty=()=>{},
 onRevoke=()=>{},onFault=()=>{},onState=()=>{},
 activationEvidence=()=>null
}={}){
 if(!UUID.test(campaignId||'')||!UUID.test(mapId||'')||
  !UUID.test(viewerId||'')||!fn(db?.auth?.getUser)||
  !fn(db?.rpc)||!fn(db?.channel)||!fn(db?.removeChannel)||
  !fn(getContext)||!fn(createLegacyTransport)||
  !fn(fetchAuthorizedSight)||!fn(onMask)||!fn(onObserverReady)||
  !fn(onPath)||!fn(onHide)||!fn(onVisionDirty)||
  !fn(onRevoke)||!fn(onFault)||!fn(onState)||
  !fn(activationEvidence))throw bad('invalid_configuration');

 const context=Object.freeze({campaignId,mapId,viewerId});
 let phase='closed',version=0,disposed=false,terminal=false;
 let session=null,everBound=new WeakSet(),unsubscribeFailures=0;
 let signedSight=false,backendLegacySubscriptions=0;
 let lastFailure=null,beginWork=null;
 const current=()=>{try{return same(context,getContext())}catch{return false}};
 const ok=n=>!disposed&&!terminal&&n===version&&current();
 const emit=code=>safe(onFault,Object.freeze({code}));
 const state=()=>Object.freeze({
  phase,hasActiveSession:!!session,observerAuthorized:signedSight&&
   phase==='observer-signed'&&current()&&!disposed&&!terminal,
  disposed,terminal,hasSignedObserverTopic:!!session?.topic,
  backendLegacySubscriptions,unsubscribeFailures,
  signedSceneRequired:true,liveSocketRevocationProven:false,
  allOldSendersFencedProven:false,productionReleaseAuthorized:false
 });
 function mask(reason){
  ++version;phase='locked';signedSight=false;
  let good=false;
  try{good=onMask(Object.freeze({reason}))===true}catch{}
  safe(onRevoke,Object.freeze({reason}));
  if(!good){terminal=true;lastFailure='mask_unconfirmed';emit(lastFailure)}
  safe(onState,state());
  return good;
 }
 async function retire(){
  const prior=session;session=null;
  if(!prior)return true;
  try{await prior.transport.dispose();}
  catch{terminal=true;lastFailure='transport_dispose_failed';
   emit(lastFailure);return false}
  if(prior.channel&&!prior.removed){
   try{
    const result=await db.removeChannel(prior.channel);
    if(result!=='ok')throw bad('channel_remove_not_confirmed');
    prior.removed=true;
   }catch{terminal=true;unsubscribeFailures++;
    lastFailure='channel_remove_not_confirmed';emit(lastFailure);
    return false}
  }
  return true;
 }
 function activationReady(){
  let v;
  try{v=activationEvidence()}catch{return false}
  // A client-provided indication is only a rollout tripwire, NEVER the
  // server's security authorization. The private join + signed RPC and
  // later signed sight remain independently mandatory.
  return v?.clientProtocol==='v3'&&v?.serverProtocol==='v3'&&
   v?.serverMode==='serving-v3'&&
   v?.oldV2PublisherFenced===true&&v?.oldV2ApiDenied===true&&
   v?.sceneSignedAndMasked===true;
 }
 function bind(n,observerTopic){
  if(!ok(n))throw bad('stale_scope');
  const holder={channel:null,removed:false,topic:observerTopic,transport:null};
  const expected=expectedV2(mapId,viewerId);
  const shim=Object.freeze({
   realtime:Object.freeze({
    setAuth:async()=>{if(!ok(n))throw bad('stale_scope');
     if(fn(db.realtime?.setAuth))await db.realtime.setAuth()}
   }),
   channel:(requested,config)=>{
    if(!ok(n)||requested!==expected||holder.channel||
     config?.config?.private!==true)throw bad('old_or_unexpected_channel');
    const actual=db.channel(observerTopic,config);
    if(!actual||!fn(actual.on)||!fn(actual.subscribe)||
     everBound.has(actual))throw bad('invalid_or_reused_channel');
    everBound.add(actual);holder.channel=actual;
    let joined=false;
    const wrapped={
     on(kind,descriptor,callback){
      if(kind!=='broadcast'||!R135_OBSERVER_EVENTS.includes(descriptor?.event)||
       !fn(callback)||!ok(n))throw bad('unexpected_event');
      actual.on(kind,descriptor,payload=>{
       if(!ok(n)||session!==holder)return;
       // Packet validation and concealment stay with original V2 engine.
       callback(payload);
      });
      return wrapped;
     },
     subscribe(callback){
      if(!fn(callback)||!ok(n))throw bad('invalid_subscription');
      actual.subscribe(status=>{
       if(!ok(n)||session!==holder)return;
       if(status==='SUBSCRIBED'){
        if(joined){
         // A SECOND SUBSCRIBED can follow socket reconnection. Do not
         // reuse stale R125 epochs or let existing V2 cursor reauthorize.
         mask('observer-reconnected');
         void retire().then(done=>{
          if(done&&!terminal&&!disposed)void enter();
         });
         return;
        }
        joined=true;
        callback(status);
        return;
       }
       if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
        mask('observer-channel-failed');
        void retire();
        return;
       }
       callback(status);
      });
      return wrapped;
     }
    };
    return Object.freeze(wrapped);
   },
   removeChannel:async channel=>{
    if(channel!==holder.channel)return 'error';
    try{
     const result=await db.removeChannel(channel);
     if(result!=='ok'){
      terminal=true;unsubscribeFailures++;
      lastFailure='channel_remove_not_confirmed';emit(lastFailure);
      return result;
     }
     holder.removed=true;
     return result;
    }catch{
     terminal=true;unsubscribeFailures++;
     lastFailure='channel_remove_not_confirmed';emit(lastFailure);
     return 'error';
    }
   }
  });
  const transport=createLegacyTransport({
   db:shim,mapId,viewerId,
   onResync:async reason=>{
    if(!ok(n)||session!==holder)throw bad('stale_resync');
    const snapshot=await fetchAuthorizedSight(reason);
    if(!ok(n)||session!==holder)throw bad('stale_resync');
    if(!validWorldObserverSnapshot(snapshot,mapId,viewerId)||
     !['dm','viewer'].includes(snapshot.scope))
     throw bad('invalid_authorized_sight');
    return snapshot;
   },
   onPath:(item,meta)=>{if(ok(n)&&session===holder&&signedSight)
    onPath(item,meta)},
   onHide:(item,meta)=>{if(ok(n)&&session===holder&&signedSight)
    onHide(item,meta)},
   onVisionDirty:payload=>{if(ok(n)&&session===holder)
    onVisionDirty(payload)},
   onRevoke:reason=>{signedSight=false;
    safe(onRevoke,Object.freeze({reason}))},
   onState:update=>{
    if(!ok(n)||session!==holder)return;
    if(update?.reason==='authorized'&&update.locked===false){
     signedSight=true;phase='observer-signed';
     safe(onObserverReady,Object.freeze({
      mapId,viewerId,cursor:update.cursor
     }));
    }else if(update?.locked===true){
     signedSight=false;
    }
    safe(onState,state());
   },
   onError:()=>emit('legacy_observer_resync_failed')
  });
  if(!transport||!fn(transport.start)||!fn(transport.dispose)||
    !fn(transport.acceptSignedSight))throw bad('invalid_legacy_transport');
  holder.transport=transport;
  return holder;
 }
 async function enter(){
  if(disposed||terminal)throw bad('disposed_or_terminal');
  if(beginWork)return false;
  const masked=mask('entry');
  const n=version;
  if(!masked)return false;
  const work=(async()=>{
   if(!(await retire())||!ok(n)||!activationReady()){
    if(!activationReady())emit('server_cutover_not_verified');
    return false;
   }
   try{
    const identity=await db.auth.getUser();
    if(!ok(n))return false;
    if(identity?.error||identity?.data?.user?.id!==viewerId)
     throw bad('signed_identity_mismatch');
    const authorized=await db.rpc('get_authorized_scene_channel_v3',
     {p_map:mapId});
    if(!ok(n))return false;
    const observerTopic=!authorized?.error?
      signedTopic(authorized?.data,mapId,viewerId):null;
    if(!observerTopic)throw bad('not_authorized_for_v3_topic');
    const holder=bind(n,observerTopic);
    session=holder;phase='joining';safe(onState,state());
    const launched=await holder.transport.start();
    if(!ok(n))return false;
    if(launched!==true)throw bad('observer_join_failed');
    return true; // Does NOT mean sight authorized or unmask allowed.
   }catch(e){
    if(ok(n)){lastFailure=e?.code||'observer_join_failed';
     emit(lastFailure);mask('join-denied');}
    await retire();return false;
   }
  })().finally(()=>{if(beginWork===work)beginWork=null});
  beginWork=work;return work;
 }
 async function lock(reason='server-denied'){
  if(disposed)return true;
  const critical=['server-denied','maintenance-fence','account-changed',
   'map-reassigned','identity-revoked'].includes(reason);
  mask(reason);
  if(critical)terminal=true;
  return retire();
 }
 async function dispose(){
  if(disposed)return true;
  mask('disposed');disposed=true;phase='disposed';
  return retire();
 }
 return Object.freeze({
  enter,reenter:enter,lock,dispose,state,
  acceptSignedSight:snapshot=>!!session&&!terminal&&signedSight&&
    current()&&session.transport.acceptSignedSight(snapshot),
  whenSettled:()=>session?.transport.whenSettled?.()||Promise.resolve(false),
  get topic(){return state().observerAuthorized?session.topic:''}
 });
}
