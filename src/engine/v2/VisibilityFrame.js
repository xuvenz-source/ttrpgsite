/**
 * World Engine V2 — viewer-authorized fog mask, no scene geometry.
 * The server chooses every current cell/roster ID. This code never derives
 * visibility, permission or object identity from wall/light data.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validInt=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const allowed=new Set(['version','mapId','viewerId','cursor',
 'environmentRevision','permissionGeneration','sceneGeneration',
 'visionEpoch','enabled','width','height','partyShared',
 'visible','explored','visiblePieces']);
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
export function normalizeWorldVisibilityFrame(raw,mapId,viewerId){
 if(!raw||typeof raw!=='object'||raw.version!==2||
  raw.mapId!==mapId||raw.viewerId!==viewerId||
  typeof mapId!=='string'||!UUID.test(mapId)||
  typeof viewerId!=='string'||!UUID.test(viewerId)||
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
  !piecesValid(raw.visiblePieces,raw.width,raw.height))return null;
 if(!raw.enabled&&(raw.visible.length||raw.explored.length))return null;
 const visible=Object.freeze([...raw.visible]);
 const explored=Object.freeze([...raw.explored]);
 const visiblePieces=Object.freeze(raw.visiblePieces.map(p=>
  Object.freeze({kind:p.kind,id:p.id,x:p.x,y:p.y})));
 return Object.freeze({
  version:2,mapId,viewerId,cursor:raw.cursor,
  environmentRevision:raw.environmentRevision,
  permissionGeneration:raw.permissionGeneration,
  sceneGeneration:raw.sceneGeneration,
  visionEpoch:raw.visionEpoch,enabled:raw.enabled,
  width:raw.width,height:raw.height,partyShared:raw.partyShared,
  visible,explored,visiblePieces
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
/** Bounded dirty rectangles; no canvas replacement for unchanged masks.
 * At most 128 row runs before falling back to the affected bounding box.
 */
export function diffWorldFogMasks(before,after,width,height){
 if(!after||!validInt(width,1,128)||!validInt(height,1,128)||
  after.length!==width*height)return {full:true,rects:[]};
 if(!before||before.length!==after.length)
  return {full:true,rects:[{x:0,y:0,width,height}]};
 const rects=[];let first=width*height,last=-1;let minX=width,maxX=-1;
 for(let y=0;y<height;y++){
  let start=-1;
  for(let x=0;x<=width;x++){
   const changed=x<width&&before[y*width+x]!==after[y*width+x];
   if(changed){
    const idx=y*width+x;
    first=Math.min(first,idx);last=Math.max(last,idx);
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    if(start<0)start=x;
   }else if(start>=0){
    rects.push({x:start,y,width:x-start,height:1});
    start=-1;
   }
  }
 }
 if(!rects.length)return {full:false,rects:[]};
 if(rects.length>128){
  return {full:false,rects:[{x:minX,y:Math.floor(first/width),
   width:maxX-minX+1,height:Math.floor(last/width)-Math.floor(first/width)+1}]};
 }
 return {full:false,rects};
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
