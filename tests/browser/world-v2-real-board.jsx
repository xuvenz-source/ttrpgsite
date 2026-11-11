import React from 'react';
import {createRoot} from 'react-dom/client';
import WorldV2Board from '/src/engine/v2/WorldV2Board.jsx';
import '/src/style.css';
import {expandGestureRoute} from '/src/engine/v2/GesturePath.js';

const MAP='10000000-0000-4000-8000-000000000001';
const PLAYER='30000000-0000-4000-8000-000000000001';
const DM='30000000-0000-4000-8000-000000000002';
const TOKEN='40000000-0000-4000-8000-000000000001';
const mode=new URLSearchParams(location.search).get('mode')||'player';
const keyboardMode=mode==='r15-covered'||mode==='r15-fallback';
const isDM=!['player','stale','r15-covered','r15-fallback'].includes(mode),
 preview=mode==='preview';
const user=isDM?DM:PLAYER;
let position={x:2,y:2},priorPosition={x:2,y:2},staleUntil=0;
let nextSession=0,cursor=5,visionEpoch=6;
let commitStarted=0,postCommitSightCalls=0,firstCommitSightStarted=0;
let resumeFirstCommit=()=>{},resumeFirstSight=()=>{},stepFn=null;
const firstCommitGate=new Promise(resolve=>{resumeFirstCommit=resolve});
const firstSightGate=new Promise(resolve=>{resumeFirstSight=resolve});
function registerStep(next){stepFn=next}
const rpc=[],errors=[],channelTopics=[],channelEvents=[];
const pointerEvents=[];
document.addEventListener('pointerdown',event=>{
 pointerEvents.push({target:event.target?.tagName,
  className:String(event.target?.className||'').slice(0,80),
  kind:event.target?.closest?.('[data-world-kind]')?.dataset.worldKind,
  inViewport:Boolean(event.target?.closest?.('.mapscroll')),
  phase:event.eventPhase});
},true);

const objects=[{id:'light-1',type:'light',x:7,y:7,
 bright:2,dim:3,intensity:100,color:'#ffce7a',effect:'steady',enabled:true}];
const editor={enabled:mode==='unlocked'||preview,layer:'light',
 lockLight:true,lockTokens:mode!=='unlocked',tool:'select',
 previewing:preview,previewTokenId:preview?TOKEN:''};
const cells=Array.from({length:100},(_,i)=>i);
const token={id:TOKEN,map_id:MAP,owner_id:PLAYER,character_id:null,
 name:'Player token',visible:true,x:2,y:2,span_x:1,span_y:1,
 image_path:null,status_effects:[]};
const scene=()=>({version:2,mapId:MAP,scope:isDM?'dm':'viewer',
 published:true,revision:7,sceneGeneration:2,rulesRevision:5,
 fogEnabled:!isDM,collisionEnabled:false,ambient:40,
 effects:{weather:'none',intensity:0},
 dimensions:{width:600,height:600,gridSize:60},
 environment:isDM?{version:1,objects:[]}:null});
const sight=()=>({version:2,mapId:MAP,viewerId:preview?PLAYER:user,
 scope:isDM&&!preview?'dm':'viewer',cursor,visionEpoch,
 environmentRevision:7,permissionGeneration:4,sceneGeneration:2,
 enabled:!isDM||preview,width:10,height:10,partyShared:false,
 visible:!isDM||preview?cells:[],explored:!isDM||preview?cells:[],
 visiblePieces:[{kind:'token',id:TOKEN,
  x:mode==='stale'&&performance.now()<staleUntil?priorPosition.x:position.x,
  y:mode==='stale'&&performance.now()<staleUntil?priorPosition.y:position.y}],
 predictionGrants:[],lightCells:[],dmMovingLights:[]});
const db={
 realtime:{async setAuth(){}},
 async rpc(name,args){
  rpc.push(name);
  if(name==='get_world_scene_v2')return {data:scene(),error:null};
  if(name==='get_world_visibility_v2'||name==='preview_world_visibility_v2'||
   name==='preview_world_visibility_at_v2'){
   if(keyboardMode&&name==='get_world_visibility_v2'&&position.x>2){
    postCommitSightCalls++;
    if(postCommitSightCalls===1){
     firstCommitSightStarted++;
     await firstSightGate;
     const frame=sight();
     if(mode==='r15-fallback'){
      frame.visiblePieces[0]={...frame.visiblePieces[0],
       x:priorPosition.x,y:priorPosition.y};
     }
     return {data:frame,error:null};
    }
   }
   return {data:sight(),error:null};
  }
  if(name==='begin_world_motion_v2'){
   // Reproduce the live server's strict canonical-origin rule in stale mode.
   if(mode==='stale'&&(args.p_origin?.x!==position.x||
    args.p_origin?.y!==position.y))return {data:null,error:null};
   return {data:{version:2,sessionId:'50000000-0000-4000-8000-'+
    String(++nextSession).padStart(12,'0')},error:null};
  }
  if(name==='advance_world_motion_v2'){
   const accepted=expandGestureRoute(args.p_from,args.p_targets);
   if(!accepted)throw Error('bad fixture targets');
   return {data:{version:2,sessionId:args.p_session,
    seq:args.p_seq,blocked:false,accepted,revision:7},error:null};
  }
  if(name==='commit_world_motion_v2'){
   commitStarted++;
   if(keyboardMode&&commitStarted===1)await firstCommitGate;
   priorPosition={...position};position={...args.p_endpoint};
   if(mode==='stale')staleUntil=performance.now()+1100;
   cursor++;visionEpoch++;
   return {data:{version:2,sessionId:args.p_session,seq:args.p_seq,
    endpoint:{...position}},error:null};
  }
  if(name==='cancel_world_motion_v2')return {data:true,error:null};
  errors.push('unexpected RPC '+name);
  return {data:null,error:{message:'unexpected RPC'}};
 },
 channel(topic,config){
  channelTopics.push(topic);
  const handlers=new Map(),callbacks=[];
  return {
   on(type,filters,fn){handlers.set(filters.event,fn);return this},
   subscribe(fn){callbacks.push(fn);
    queueMicrotask(()=>fn('SUBSCRIBED'));return this},
   send(){throw Error('client cannot publish private motion')},
   emit(event,data){handlers.get(event)?.({payload:data})},
   unsubscribe(){callbacks.forEach(fn=>fn('CLOSED'))}
  };
 },
 async removeChannel(){}
};
const root=createRoot(document.getElementById('root'));
let committed=0;
root.render(<WorldV2Board db={db} map={{
 id:MAP,width:600,height:600,grid_size:60,name:'V2 browser test'
 }} tokens={[token]} user={user} isDM={isDM}
 active={true} environment={{version:1,objects}}
 environmentEditor={editor} scale={1} setScale={()=>{}}
 selectedId={keyboardMode?TOKEN:null} setSelectedId={()=>{}}
 registerV2Step={keyboardMode?registerStep:undefined}
 onMovementCommitted={()=>{committed++}}
 onV2Error={error=>errors.push(error?.message||String(error))}
 />);
window.__v2Integrated={
 mode,
 ready(){
  const sprite=document.querySelector('[data-world-kind="token"]');
  return Boolean(sprite&&sprite.style.visibility==='visible'&&
   document.querySelector('.world-v2-token-content')&&
   rpc.includes(preview?'preview_world_visibility_v2':'get_world_visibility_v2')&&
   (!keyboardMode||typeof stepFn==='function'));
 },
 bounds(){
  const sprite=document.querySelector('[data-world-kind="token"]');
  if(!sprite)return null;
  const rect=sprite.getBoundingClientRect();
  return {x:rect.left+rect.width*.42,y:rect.top+rect.height*.52,
   width:rect.width,height:rect.height};
 },
 step(dx,dy,options){return stepFn?.(dx,dy,options)??false},
 resumeCommit(){resumeFirstCommit()},
 resumeSight(){resumeFirstSight()},
 snapshot(){
  const sprite=document.querySelector('[data-world-kind="token"]');
  const elem=sprite?.getBoundingClientRect();
  return {mode,rpc:[...rpc],errors:[...errors],
   commitStarted,postCommitSightCalls,firstCommitSightStarted,
   stepReady:typeof stepFn==='function',
   committed,channelTopics:[...channelTopics],pointerEvents:[...pointerEvents],
   trace:window.__worldV2Trace?.snapshot(),
   position:{...position},spriteVisible:sprite?.style.visibility,
   spriteTransform:sprite?.style.translate,
   spriteCount:document.querySelectorAll('[data-world-kind="token"]').length,
   canvasCount:document.querySelectorAll('.world-v2-fog').length,
   message:document.querySelector('[role="alert"]')?.textContent,
   status:document.querySelector('[role="status"]')?.textContent,
   actualTarget:elem?document.elementFromPoint(
    elem.left+elem.width*.42,elem.top+elem.height*.52)?.outerHTML?.slice(0,240):''
  };
 }
};
