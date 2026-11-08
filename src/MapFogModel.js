// Only server-authorized, sanitized visibility frames may be rendered to
// players. These helpers DO NOT calculate permission, line of sight, or access.
export const FOG_UNEXPLORED=0;
export const FOG_EXPLORED=1;
export const FOG_VISIBLE=2;
export const MAX_FOG_AXIS=256;
export const MAX_FOG_CELLS=MAX_FOG_AXIS*MAX_FOG_AXIS;

const validInt=n=>Number.isSafeInteger(n);
function parseIndices(items,total){
 if(!Array.isArray(items)||items.length>total)return null;
 const values=new Set();
 for(const cell of items){
  if(!validInt(cell)||cell<0||cell>=total)return null;
  values.add(cell);
 }
 return [...values].sort((a,b)=>a-b);
}
/** Reject raw environment data and oversized/malformed frames.
 * This is defense-in-depth; the backend must authorize before responding.
 */
export function normalizeAuthorizedFogFrame(raw,mapId){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    raw.mapId!==mapId||typeof mapId!=='string'||!mapId||
    !validInt(raw.width)||!validInt(raw.height)||
    raw.width<1||raw.height<1||
    raw.width>MAX_FOG_AXIS||raw.height>MAX_FOG_AXIS||
    !validInt(raw.revision)||raw.revision<0||
    typeof raw.enabled!=='boolean'||typeof raw.partyShared!=='boolean'||
    ['prepared','live','objects','environment','tokens','names','imagePaths']
     .some(key=>Object.hasOwn(raw,key)))return null;
 const total=raw.width*raw.height;
 const visible=parseIndices(raw.visible,total);
 const explored=parseIndices(raw.explored,total);
 if(!visible||!explored)return null;
 const exploredSet=new Set(explored);
 if(visible.some(cell=>!exploredSet.has(cell)))return null;
 return {mapId,width:raw.width,height:raw.height,
  revision:raw.revision,enabled:raw.enabled,partyShared:raw.partyShared,
  visible,explored};
}
/** A revision revokes the old visible cells immediately. Retain only cells
 * already explored (dimmed) while fetching the next authorized frame, so a
 * moving player's entire map does not flash to unexplored black.
 * This never grants sight or maps previously unseen cells.
 */
export function fogFrameDuringRefresh(frame,mapId){
 const safe=normalizeAuthorizedFogFrame(frame,mapId);
 if(!safe)return null;
 // Repeated ticks while an RPC is pending must not construct a fresh
 // equivalent frame and trigger every token/image component to rerender.
 if(frame.enabled===true&&frame.visible.length===0&&
   Array.isArray(frame.displayVisibleDuringRefresh))return frame;
 // Sight permission is revoked immediately. Only previously visible cells
 // already in explored memory may stay bright *visually* during the RPC.
 const explored=new Set(safe.explored);
 const previous=Array.isArray(frame?.displayVisibleDuringRefresh)?
  frame.displayVisibleDuringRefresh:safe.visible;
 const displayVisibleDuringRefresh=safe.enabled?
  previous.filter(index=>explored.has(index)):[];
 return {...safe,enabled:true,visible:[],displayVisibleDuringRefresh};
}
/** Additional presentation guard: when a revision invalidates authorized
 * sight, stale RLS token snapshots must not remain visible through dim fog.
 * Server RLS remains the actual authorization boundary.
 */
const visibleCellsCache=new WeakMap();
export function tokenObservedByFogFrame(token,frame,userId){
 if(!token||!frame||typeof frame.enabled!=='boolean')return false;
 if(!frame.enabled)return true;
 if(token.owner_id===userId&&userId)return true;
 const x=Number(token.x),y=Number(token.y);
 const w=Number(token.span_x??1),h=Number(token.span_y??1);
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0||w>12||h>12)return false;
 let visible=visibleCellsCache.get(frame);
 if(!visible){visible=new Set(frame.visible||[]);visibleCellsCache.set(frame,visible)}
 for(let cy=Math.max(0,Math.floor(y));cy<Math.min(frame.height,Math.ceil(y+h));cy++)
  for(let cx=Math.max(0,Math.floor(x));cx<Math.min(frame.width,Math.ceil(x+w));cx++)
   if(visible.has(cy*frame.width+cx))return true;
 return false;
}
export function fogCellState(frame,x,y){
 if(!frame)return FOG_UNEXPLORED;
 if(!validInt(x)||!validInt(y)||x<0||y<0||
    x>=frame.width||y>=frame.height)return FOG_UNEXPLORED;
 if(!frame.enabled)return FOG_VISIBLE;
 const index=y*frame.width+x;
 if(frame.visible.includes(index))return FOG_VISIBLE;
 return frame.explored.includes(index)?FOG_EXPLORED:FOG_UNEXPLORED;
}
export function fogMasks(frame){
 if(!frame)return null;
 const visible=new Set(frame.visible),explored=new Set(frame.explored);
 const mask=[];
 for(let i=0;i<frame.width*frame.height;i++){
  mask.push(!frame.enabled||visible.has(i)?FOG_VISIBLE:
   explored.has(i)?FOG_EXPLORED:FOG_UNEXPLORED);
 }
 return mask;
}
