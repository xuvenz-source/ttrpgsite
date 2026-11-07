import {toolCanControl} from './CampaignTools.js';
/** Pure battlemap selection and multi-token movement maths.
 * Rendering uses pixels at the current zoom, persistence uses grid coordinates.
 */
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
export const canControlMapToken=(token,user,isDM,mapId)=>
 Boolean(token&&token.map_id===mapId&&(isDM||token.owner_id===user)&&
  (isDM||token.visible!==false));

export function selectionRectangle(a,b){
 const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
 return {x,y,width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)};
}
export function selectableTokenIds(tokens,rectangle,cell,user,isDM,mapId){
 if(!(cell>0)||!rectangle)return [];
 const r=rectangle;
 return (tokens||[]).filter(token=>{
  if(!canControlMapToken(token,user,isDM,mapId))return false;
  const x=finite(token.x)*cell,y=finite(token.y)*cell,
   width=Math.max(.25,finite(token.span_x??1,1))*cell,
   height=Math.max(.25,finite(token.span_y??1,1))*cell;
  return x<r.x+r.width&&x+width>r.x&&
   y<r.y+r.height&&y+height>r.y;
 }).map(token=>token.id);
}
/** Clamp the same delta for the entire group, preserving relative spacing.
 * This prevents individual members piling up against the board edge.
 */
export function boundedGroupOffset(tokens,desiredX,desiredY,mapWidth,mapHeight,gridSize){
 if(!tokens?.length)return {dx:0,dy:0};
 const grid=Math.max(1,finite(gridSize,70));
 const maxX=Math.max(0,Math.min(1000,Math.floor(finite(mapWidth)/grid)));
 const maxY=Math.max(0,Math.min(1000,Math.floor(finite(mapHeight)/grid)));
 const minDX=Math.max(...tokens.map(t=>-finite(t.x)));
 const minDY=Math.max(...tokens.map(t=>-finite(t.y)));
 const maxDX=Math.min(...tokens.map(t=>maxX-finite(t.x)-Math.max(.25,finite(t.span_x??1,1))));
 const maxDY=Math.min(...tokens.map(t=>maxY-finite(t.y)-Math.max(.25,finite(t.span_y??1,1))));
 const clamp=(v,min,max)=>Math.max(min,Math.min(Math.max(min,max),v));
 return {
  dx:clamp(Math.round(finite(desiredX)),minDX,maxDX)||0,
  dy:clamp(Math.round(finite(desiredY)),minDY,maxDY)||0
 };
}

/** Tool footprints participate in the same canvas marquee as character tokens.
 * Use issue IDs as a separate namespace: tool and token IDs must never collide.
 */
export function selectableToolIds(placements,issued,rectangle,cell,user,isDM,mapId){
 if(!(cell>0)||!rectangle)return [];
 const access=new Map((issued||[]).map(t=>[t.id,t]));
 return (placements||[]).filter(p=>{
  if(p.map_id!==mapId||!toolCanControl(access.get(p.issue_id),user,isDM))
   return false;
  const size=p.kind==='mount'?Math.max(1,finite(p.span,2)):1;
  const x=finite(p.x)*cell,y=finite(p.y)*cell;
  return x<rectangle.x+rectangle.width&&x+size*cell>rectangle.x&&
   y<rectangle.y+rectangle.height&&y+size*cell>rectangle.y;
 }).map(p=>p.issue_id);
}
/** All mixed drag members share one board-relative clamp and movement delta. */
export function selectedMapMembers(tokenIds,toolIds,tokens,placements,issued,user,isDM,mapId){
 const accessible=new Map((issued||[]).map(t=>[t.id,t]));
 const tokenSet=new Set(tokenIds||[]),toolSet=new Set(toolIds||[]);
 const tokenMembers=(tokens||[]).filter(t=>tokenSet.has(t.id)&&
  canControlMapToken(t,user,isDM,mapId)).map(t=>({...t,source:'token'}));
 const toolMembers=(placements||[]).filter(p=>toolSet.has(p.issue_id)&&
  p.map_id===mapId&&toolCanControl(accessible.get(p.issue_id),user,isDM))
  .map(p=>{
   const span=p.kind==='mount'?Math.max(1,finite(p.span,2)):1;
   return {id:p.issue_id,source:'tool',x:p.x,y:p.y,span_x:span,span_y:span};
  });
 return [...tokenMembers,...toolMembers];
}
