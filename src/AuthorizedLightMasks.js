const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Sanitize server-authorized light cells. No map wall geometry may be carried.
 * Masks never grant new fog visibility; they only clip a visible cosmetic glow.
 */
export function normalizeAuthorizedLightMasks(raw,mapId){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.mapId!==mapId||
    !Number.isSafeInteger(raw.revision)||raw.revision<0||
    !Number.isSafeInteger(raw.width)||!Number.isSafeInteger(raw.height)||
    raw.width<1||raw.height<1||raw.width>128||raw.height>128||
    !Array.isArray(raw.masks)||raw.masks.length>16||
    ['prepared','live','objects','environment','tokens','sourceX','sourceY']
     .some(key=>Object.hasOwn(raw,key)))return null;
 const total=raw.width*raw.height,ids=new Set(),masks={};
 for(const source of raw.masks){
  if(!source||!UUID.test(String(source.id||''))||
    ids.has(source.id)||!Array.isArray(source.cells)||
    source.cells.length>total)return null;
  ids.add(source.id);
  const cells=new Set();
  for(const idx of source.cells){
   if(!Number.isSafeInteger(idx)||idx<0||idx>=total)return null;
   cells.add(idx);
  }
  masks[source.id]=[...cells].sort((a,b)=>a-b);
 }
 return {mapId,revision:raw.revision,width:raw.width,
  height:raw.height,masks};
}
/** Coalesce contiguous illuminated cells into SVG rectangles to avoid a
 * separate shadow DOM node per tile (up to 128 cells per map row).
 */
export function lightCellRuns(cells,width){
 if(!Array.isArray(cells)||!Number.isSafeInteger(width)||width<1)return [];
 const runs=[];let current=null;
 for(const index of cells){
  const x=index%width,y=Math.floor(index/width);
  if(current&&current.y===y&&current.x+current.width===x)current.width++;
  else{current={x,y,width:1};runs.push(current)}
 }
 return runs;
}
