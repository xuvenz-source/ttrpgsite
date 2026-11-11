/**
 * Short-lived, server-ACKed canonical origin for the owner's next gesture.
 * The next Begin RPC still verifies actual token coordinates, account
 * ownership, collision and map/permission revisions. No viewer sight is
 * granted or changed by this local handoff.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validPoint=p=>Number.isSafeInteger(p?.x)&&Number.isSafeInteger(p?.y)&&
 p.x>=0&&p.y>=0&&p.x<=100000&&p.y<=100000;
const same=(a,b)=>a?.x===b?.x&&a?.y===b?.y;
const copy=p=>({x:p.x,y:p.y});
const selectionKey=selection=>{
 if(!Array.isArray(selection)||!selection.length||selection.length>48)return null;
 const keys=selection.map(p=>
  ['token','tool'].includes(p?.kind)&&UUID.test(p?.id??'')?
   p.kind+':'+p.id:null);
 return keys.every(Boolean)&&new Set(keys).size===keys.length?
  keys.join('|'):null;
};
const validContext=c=>UUID.test(c?.mapId??'')&&UUID.test(c?.viewerId??'')&&
 Number.isSafeInteger(c?.environmentRevision)&&c.environmentRevision>=0&&
 Number.isSafeInteger(c?.permissionGeneration)&&c.permissionGeneration>=0&&
 Number.isSafeInteger(c?.sceneGeneration)&&c.sceneGeneration>=0;
export function createCanonicalCommitHandoff({now=()=>Date.now(),maxAgeMs=3000}={}){
 if(typeof now!=='function'||!Number.isSafeInteger(maxAgeMs)||
  maxAgeMs<100||maxAgeMs>10000)throw Error('Invalid handoff configuration');
 let current=null;
 const matching=c=>current&&c.mapId===current.mapId&&
  c.viewerId===current.viewerId&&
  c.environmentRevision===current.environmentRevision&&
  c.permissionGeneration===current.permissionGeneration&&
  c.sceneGeneration===current.sceneGeneration;
 const fresh=()=>current&&now()<=current.expiresAt;
 return Object.freeze({
  remember(c){
   if(!validContext(c)||!selectionKey(c.selection)||
    !validPoint(c.signedOrigin)||!validPoint(c.endpoint)||
    same(c.endpoint,c.signedOrigin)){current=null;return false}
   current={mapId:c.mapId,viewerId:c.viewerId,
    environmentRevision:c.environmentRevision,
    permissionGeneration:c.permissionGeneration,
    sceneGeneration:c.sceneGeneration,
    selection:selectionKey(c.selection),
    first:{kind:c.selection[0].kind,id:c.selection[0].id},
    signedOrigin:copy(c.signedOrigin),endpoint:copy(c.endpoint),
    expiresAt:now()+maxAgeMs};
   return true;
  },
  resolve(c){
   if(!validContext(c)||!selectionKey(c.selection)||
    !validPoint(c.signedOrigin))return null;
   const signed=copy(c.signedOrigin);
   if(!current)return signed;
   if(!fresh()||!matching(c)||
    selectionKey(c.selection)!==current.selection){
    current=null;return signed;
   }
   if(same(signed,current.endpoint)){current=null;return signed}
   if(!same(signed,current.signedOrigin)){current=null;return signed}
   return copy(current.endpoint);
  },
  observe(frame){
   if(!current)return false;
   if(!fresh()||!matching(frame)){current=null;return false}
   const p=frame.visiblePieces?.find(piece=>
    piece?.kind===current.first.kind&&piece?.id===current.first.id);
   if(!validPoint(p)||same(p,current.endpoint)||
    !same(p,current.signedOrigin)){current=null;return false}
   return true;
  },
  clear(){current=null},
  get pending(){return !!fresh()}
 });
}
