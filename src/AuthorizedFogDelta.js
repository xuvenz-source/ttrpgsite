import {normalizeAuthorizedFogFrame} from './MapFogModel.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validSeq=n=>Number.isSafeInteger(n)&&n>=0;
function parseCells(values,total){
 if(!Array.isArray(values)||values.length>total)return null;
 const set=new Set();
 for(const value of values){
  if(!Number.isSafeInteger(value)||value<0||value>=total||set.has(value))return null;
  set.add(value);
 }
 return set;
}
function applyCells(initial,added,removed,total){
 const add=parseCells(added,total),remove=parseCells(removed,total);
 if(!add||!remove)return null;
 if([...add].some(v=>remove.has(v)))return null;
 const next=new Set(initial);
 for(const value of remove){
  if(!next.has(value))return null;
  next.delete(value);
 }
 for(const value of add){
  if(next.has(value))return null;
  next.add(value);
 }
 return [...next].sort((a,b)=>a-b);
}
/** Accept only a server-authorized protocol envelope.
 * A client is NOT allowed to infer/recalculate sight from movement or walls.
 * Invalid or skipped revisions require a full current server snapshot.
 */
// Only these fields are presentation data. Reject any unexpected privileged
// geometry and exclude envelope-only metadata from the fog frame normalizer.
function normalizeEnvelopeFrame(raw,mapId,visible,explored){
 if(['prepared','live','objects','environment','tokens','names','imagePaths']
    .some(key=>Object.hasOwn(raw,key)))return null;
 return normalizeAuthorizedFogFrame({
  mapId:raw.mapId,width:raw.width,height:raw.height,
  revision:raw.revision,enabled:raw.enabled,partyShared:raw.partyShared,
  protocolVersion:raw.protocolVersion,deltaProtocolVersion:raw.deltaProtocolVersion,
  epoch:raw.epoch,sequence:raw.sequence,collisionEnabled:raw.collisionEnabled,
  visible,explored
 },mapId);
}
export function applyAuthorizedFogEnvelope(previous,raw,mapId){
 if(!raw||raw.mapId!==mapId||raw.protocolVersion!==2||
    raw.deltaProtocolVersion!==1||!UUID.test(String(raw.epoch||''))||
    !validSeq(raw.sequence)||!validSeq(raw.revision))return null;
 if(raw.mode==='snapshot'){
  const safe=normalizeEnvelopeFrame(raw,mapId,raw.visible,raw.explored);
  return safe?.epoch===raw.epoch&&safe?.sequence===raw.sequence?safe:null;
 }
 if(!previous||previous.mapId!==mapId||
    previous.deltaProtocolVersion!==1||
    previous.epoch!==raw.epoch||!validSeq(previous.sequence))return null;
 if(raw.mode==='noop'){
  return previous.revision===raw.revision&&
   previous.sequence===raw.sequence?previous:null;
 }
 if(raw.mode!=='delta'||raw.baseRevision!==previous.revision||
    raw.baseSequence!==previous.sequence||
    raw.sequence!==previous.sequence+1||
    raw.revision<previous.revision||
    raw.width!==previous.width||raw.height!==previous.height||
    raw.enabled!==previous.enabled||raw.partyShared!==previous.partyShared)
  return null;
 const total=raw.width*raw.height;
 const visible=applyCells(previous.visible,raw.visibleAdd,raw.visibleRemove,total);
 const explored=applyCells(previous.explored,raw.exploredAdd,raw.exploredRemove,total);
 if(!visible||!explored)return null;
 return normalizeEnvelopeFrame(raw,mapId,visible,explored);
}
