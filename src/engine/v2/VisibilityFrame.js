/**
 * World Engine V2 — viewer-authorized fog mask, no scene geometry.
 * The server chooses every current cell/roster ID. This code never derives
 * visibility, permission or object identity from wall/light data.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validInt=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const allowed=new Set(['version','mapId','viewerId','scope','cursor',
 'environmentRevision','permissionGeneration','sceneGeneration',
 'visionEpoch','enabled','width','height','partyShared',
 'visible','explored','visiblePieces','predictionGrants',
 'lightCells','dmMovingLights']);
const pieceKey=p=>p.kind+':'+p.id;
function orderedCells(cells,count){
 if(!Array.isArray(cells)||cells.length>count)return false;
 let last=-1;
 for(const cell of cells){
  if(!validInt(cell,0,count-1)||cell<=last)return false;
  last=cell;
 }
 return true;
}
function piecesValid(pieces,width,height){
 if(!Array.isArray(pieces)||pieces.length>500)return false;
 const seen=new Set();
 for(const p of pieces){
  if(!p||!['token','tool'].includes(p.kind)||
   typeof p.id!=='string'||!UUID.test(p.id)||
   !validInt(p.x,0,width-1)||!validInt(p.y,0,height-1)||
   Object.keys(p).some(k=>!['kind','id','x','y'].includes(k))||
   seen.has(pieceKey(p)))return false;
  seen.add(pieceKey(p));
 }
 return true;
}
function grantsValid(grants,pieces,width,height){
 if(grants===undefined)return true;
 if(!Array.isArray(grants)||grants.length>8)return false;
 const visible=new Map(pieces.map(p=>[pieceKey(p),p]));
 const seen=new Set();
 for(const grant of grants){
  if(!grant||!['token','tool'].includes(grant.kind)||
   !UUID.test(grant.id||'')||
   !validInt(grant.x,0,width-1)||!validInt(grant.y,0,height-1)||
   !Array.isArray(grant.quadrants)||grant.quadrants.length<1||
   grant.quadrants.length>4||
   Object.keys(grant).some(k=>![
    'kind','id','x','y','quadrants'].includes(k)))return false;
  const id=pieceKey(grant),actor=visible.get(id);
  if(seen.has(id)||!actor||
   actor.x!==grant.x||actor.y!==grant.y)return false;
  seen.add(id);
  const quads=new Set();
  for(const p of grant.quadrants){
   if(!Array.isArray(p)||p.length!==2||
    ![-1,1].includes(p[0])||![-1,1].includes(p[1]))return false;
   const q=p.join(':');
   if(quads.has(q))return false;
   quads.add(q);
  }
 }
 return true;
}
function cosmeticLightsValid(raw){
 const cells=raw.lightCells??[],lamps=raw.dmMovingLights??[];
 if(!Array.isArray(cells)||cells.length>768||!Array.isArray(lamps)||
  lamps.length>50||raw.scope==='viewer'&&lamps.length>0||
  raw.scope==='dm'&&cells.length>0)return false;
 const visible=new Set(raw.visible||[]);
 let previous=-1;
 for(const cell of cells){
  if(!Array.isArray(cell)||cell.length!==2||
   !validInt(cell[0],0,raw.width*raw.height-1)||
   !validInt(cell[1],1,3)||cell[0]<=previous||
   !visible.has(cell[0]))return false;
  previous=cell[0];
 }
 for(const source of lamps){
  if(!source||typeof source!=='object'||
   Object.keys(source).some(k=>!['x','y','reach'].includes(k))||
   !Number.isFinite(source.x)||!Number.isFinite(source.y)||
   !Number.isFinite(source.reach)||source.reach<0||
   source.reach>200||source.x<0||source.y<0||
   source.x>raw.width||source.y>raw.height)return false;
 }
 return true;
}
export function normalizeWorldVisibilityFrame(raw,mapId,viewerId){
 if(!raw||typeof raw!=='object'||raw.version!==2||
  raw.mapId!==mapId||raw.viewerId!==viewerId||
  typeof mapId!=='string'||!UUID.test(mapId)||
  typeof viewerId!=='string'||!UUID.test(viewerId)||
  !['dm','viewer'].includes(raw.scope)||
  Object.keys(raw).some(k=>!allowed.has(k))||
  !validInt(raw.cursor,0,Number.MAX_SAFE_INTEGER)||
  !validInt(raw.environmentRevision,0,Number.MAX_SAFE_INTEGER)||
  !validInt(raw.permissionGeneration,0,Number.MAX_SAFE_INTEGER)||
  !validInt(raw.sceneGeneration,0,Number.MAX_SAFE_INTEGER)||
  !validInt(raw.visionEpoch,0,Number.MAX_SAFE_INTEGER)||
  !validInt(raw.width,1,10000)||!validInt(raw.height,1,10000)||
  (raw.enabled&&(raw.width>128||raw.height>128))||
  typeof raw.enabled!=='boolean'||typeof raw.partyShared!=='boolean')
  return null;
 const count=raw.width*raw.height;
 if(!orderedCells(raw.visible,count)||!orderedCells(raw.explored,count)||
  !piecesValid(raw.visiblePieces,raw.width,raw.height)||
  !grantsValid(raw.predictionGrants,raw.visiblePieces,raw.width,raw.height)||
  !cosmeticLightsValid(raw))return null;
 if(!raw.enabled&&(raw.visible.length||raw.explored.length))return null;
 if(raw.scope==='dm'&&raw.enabled)return null;
 const visible=Object.freeze([...raw.visible]);
 const explored=Object.freeze([...raw.explored]);
 const visiblePieces=Object.freeze(raw.visiblePieces.map(p=>
  Object.freeze({kind:p.kind,id:p.id,x:p.x,y:p.y})));
 const predictionGrants=Object.freeze((raw.predictionGrants??[]).map(g=>
  Object.freeze({kind:g.kind,id:g.id,x:g.x,y:g.y,
   quadrants:Object.freeze(g.quadrants.map(q=>Object.freeze([...q])))})));
 const lightCells=Object.freeze((raw.lightCells??[]).map(row=>
  Object.freeze([...row])));
 const dmMovingLights=Object.freeze((raw.dmMovingLights??[]).map(light=>
  Object.freeze({x:light.x,y:light.y,reach:light.reach})));
 return Object.freeze({
  version:2,mapId,viewerId,scope:raw.scope,cursor:raw.cursor,
  environmentRevision:raw.environmentRevision,
  permissionGeneration:raw.permissionGeneration,
  sceneGeneration:raw.sceneGeneration,
  visionEpoch:raw.visionEpoch,enabled:raw.enabled,
  width:raw.width,height:raw.height,partyShared:raw.partyShared,
  visible,explored,visiblePieces,predictionGrants,
  lightCells,dmMovingLights
 });
}
/** 0 = fully concealed, 1 = explored but not visible, 2 = currently
 * visible. The renderer alone chooses alpha/color/feather treatment.
 */
export function makeWorldFogMask(frame){
 if(!frame||!validInt(frame.width,1,10000)||
  !validInt(frame.height,1,10000))return null;
 // On large maps with fog off, a null fog mask means no overlay.
 // Never allocate a 100-million-cell buffer just to fill it "visible".
 if(!frame.enabled&&(frame.width>128||frame.height>128))return null;
 const mask=new Uint8Array(frame.width*frame.height);
 if(!frame.enabled){mask.fill(2);return mask}
 for(const cell of frame.explored)mask[cell]=1;
 for(const cell of frame.visible)mask[cell]=2;
 return mask;
}
/** Dirty rectangles: fragmented large diffs are bounded into 8x8 tiles
 * rather than expanding to a large, unrelated bounding rectangle.
 */
export function diffWorldFogMasks(before,after,width,height){
 if(!after||!validInt(width,1,128)||!validInt(height,1,128)||
  after.length!==width*height)return {full:true,rects:[]};
 if(!before||before.length!==after.length)
  return {full:true,rects:[{x:0,y:0,width,height}]};
 const rects=[];
 for(let y=0;y<height;y++){
  let start=-1;
  for(let x=0;x<=width;x++){
   const changed=x<width&&before[y*width+x]!==after[y*width+x];
   if(changed){if(start<0)start=x}
   else if(start>=0){
    rects.push({x:start,y,width:x-start,height:1});
    start=-1;
   }
  }
 }
 if(rects.length<=128)return {full:false,rects};
 // A bounding box of highly fragmented differences can cover the entire
 // dungeon despite only a few cells changing. Paint bounded 8x8 tiles
 // instead: max 256 tiles for the 128x128 authorized fog limit.
 const across=Math.ceil(width/8),tiles=new Set();
 for(let i=0;i<after.length;i++){
  if(before[i]===after[i])continue;
  const x=i%width,y=Math.floor(i/width);
  tiles.add(Math.floor(y/8)*across+Math.floor(x/8));
 }
 return {full:false,rects:[...tiles].map(tile=>{
  const x=(tile%across)*8,y=Math.floor(tile/across)*8;
  return {x,y,width:Math.min(8,width-x),height:Math.min(8,height-y)};
 })};
}
/**
 * Presentation-only soft edge weights for the Phase 8 renderer.
 * This NEVER expands which cells are authorized as visible.
 */
export function fogEdgeWeight(mask,width,height,x,y){
 if(!mask||mask.length!==width*height||
  !validInt(x,0,width-1)||!validInt(y,0,height-1))return 0;
 if(mask[y*width+x]!==2)return 0;
 let covered=0;
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  const xx=x+dx,yy=y+dy;
  if(xx>=0&&xx<width&&yy>=0&&yy<height&&
   mask[yy*width+xx]===2)covered++;
 }
 return covered/9;
}
/** Cursor-only and roster-only updates may retain the same fog raster.
 * Identity is valid only under the SAME server-certified authority.
 */
export function sameWorldFogCells(before,after){
 if(!before||!after||before.mapId!==after.mapId||
  before.viewerId!==after.viewerId||before.scope!==after.scope||
  before.environmentRevision!==after.environmentRevision||
  before.sceneGeneration!==after.sceneGeneration||
  before.permissionGeneration!==after.permissionGeneration||
  before.partyShared!==after.partyShared||
  before.enabled!==after.enabled||
  before.width!==after.width||before.height!==after.height)
  return false;
 if(!after.enabled)return true;
 return before.visible.length===after.visible.length&&
  before.explored.length===after.explored.length&&
  before.visible.every((value,i)=>value===after.visible[i])&&
  before.explored.every((value,i)=>value===after.explored[i]);
}
export function diffWorldVisiblePieces(before=[],after=[]){
 const old=new Map(before.map(p=>[pieceKey(p),p]));
 const next=new Map(after.map(p=>[pieceKey(p),p]));
 const added=[],removed=[],moved=[],unchanged=[];
 for(const [key,piece] of next){
  const previous=old.get(key);
  if(!previous)added.push(piece);
  else if(previous.x!==piece.x||previous.y!==piece.y)
   moved.push(piece);
  else unchanged.push(previous);
 }
 for(const [key,piece] of old)if(!next.has(key))removed.push(piece);
 return {added,removed,moved,unchanged};
}
