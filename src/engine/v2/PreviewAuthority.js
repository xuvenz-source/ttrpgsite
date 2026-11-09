/**
 * DM player preview is a purely client-local movement session. It may use
 * ONLY DM-authenticated compiled collision geometry, then requests a separate
 * non-mutating player-effective server sight calculation for each approved cell.
 * It never writes a token or joins another player's realtime channel.
 */
import {expandGestureRoute} from './GesturePath.js';
import {collisionAllowsStep} from './CollisionSolver.js';
const key=p=>p.kind+':'+p.id;
const integer=p=>Number.isSafeInteger(p?.x)&&Number.isSafeInteger(p?.y);
export function createPreviewAuthority({getScene,getPieces,getPosition}={}){
 if([getScene,getPieces,getPosition].some(fn=>typeof fn!=='function'))
  throw Error('Virtual preview requires compiled DM scene and authorized token');
 let active=null,sequence=0,disposed=false;
 const valid=()=>!disposed&&getScene()?.scope==='dm';
 return {
  async begin(req){
   if(!valid()||active||req?.mode!=='preview'||
    req.selection?.length!==1||req.selection[0]?.kind!=='token'||
    !integer(req.origin))throw Error('Preview origin unavailable');
   const pieces=getPieces(req.selection);
   if(!Array.isArray(pieces)||pieces.length!==1||
    key(pieces[0])!==key(req.selection[0]))throw Error('Preview actor denied');
   const pos=getPosition()||req.origin;
   if(!integer(pos)||pos.x!==req.origin.x||pos.y!==req.origin.y)
    throw Error('Stale preview origin');
   const id='v2-preview-'+(++sequence);
   active={id,mapId:req.mapId,selection:req.selection,origin:{...pos},seq:0};
   return {version:2,sessionId:id};
  },
  async advance(req){
   const s=active,scene=getScene();
   if(!valid()||!s||req?.sessionId!==s.id||
    req.mapId!==s.mapId||req.seq!==s.seq+1||
    !integer(req.from)||!Array.isArray(req.targets))
    throw Error('Preview session revoked');
   const requested=expandGestureRoute(req.from,req.targets);
   if(!requested)throw Error('Invalid preview route');
   const rows=getPieces(s.selection);
   if(rows?.length!==1||key(rows[0])!==key(s.selection[0]))
    throw Error('Preview actor revoked');
   const part={...rows[0],x:s.origin.x,y:s.origin.y};
   const accepted=[];
   let previous=req.from,blocked=false;
   for(const point of requested){
    if(!collisionAllowsStep({
     scene,pieces:[part],anchor:s.origin,from:previous,to:point
    })){blocked=true;break}
    accepted.push(point);previous=point;
   }
   s.seq=req.seq;
   return {version:2,sessionId:s.id,seq:req.seq,
    blocked,accepted,revision:scene.revision};
  },
  async commit(){throw Error('Virtual preview cannot commit world positions')},
  async cancel({sessionId}={}){
   if(active?.id===sessionId)active=null;
   return true;
  },
  dispose(){active=null;disposed=true}
 };
}
