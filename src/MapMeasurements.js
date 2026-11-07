export const FEET_PER_CELL=5;
export const MEASUREMENT_TOOLS=['line','circle','square','cone'];
export const MEASUREMENT_PHASES=['preview','pin','remove','clear'];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mouse coordinates snap to a grid CELL CENTRE, never free-floating pixels.
 * Clamp to the actual map so the last partial cell cannot extend past its edge.
 * The calculation is independent of the map zoom level.
 */
export function pointOnBattlemap(clientX,clientY,rect,width,height,gridSize,zoom){
 if(!rect||!(width>0)||!(height>0)||!(gridSize>0)||!(zoom>0)||
  !Number.isFinite(clientX)||!Number.isFinite(clientY))return null;
 const snap=(coord,max)=>Math.max(0,Math.min(max,
  Math.floor(Math.max(0,coord))*1+.5));
 const maxX=width/gridSize,maxY=height/gridSize;
 return {
  x:snap((clientX-rect.left)/(gridSize*zoom),maxX),
  y:snap((clientY-rect.top)/(gridSize*zoom),maxY)
 };
}

/** A bend is added while the primary button remains down and the user
 * right-clicks. Consecutive duplicate turns do nothing. Paths have a bounded
 * number of bends so malformed/untrusted remote drawings cannot grow forever.
 */
export const MAX_LINE_TURNS=64;
/** A secondary mouse press bends an actively left-dragged line, regardless
 * of the browser's unreliable e.buttons mask under pointer capture. */
export function shouldBendLineOnRightPress(drag,button){
 return button===2&&drag?.sourceButton===0&&!drag.pinned&&
  drag.measure?.tool==='line';
}
export function addLineTurn(measure,point){
 if(measure?.tool!=='line'||!finite(point?.x)||!finite(point?.y))return measure;
 const via=Array.isArray(measure.via)?measure.via:[];
 if(via.length>=MAX_LINE_TURNS)return measure;
 const previous=via[via.length-1]||measure.start;
 if(!finite(previous?.x)||!finite(previous?.y)||
  (previous.x===point.x&&previous.y===point.y))return measure;
 return {...measure,via:[...via,{x:point.x,y:point.y}],
  end:{x:point.x,y:point.y}};
}
/** All displayed distances and radii are whole grid cells (multiples of 5ft).
 * Snapped endpoints may be diagonal; round to the nearest 5ft increment.
 */
export function measurementGeometry(measurement){
 if(!measurement||!MEASUREMENT_TOOLS.includes(measurement.tool))return null;
 const {start,end,tool}=measurement;
 if(!finite(start?.x)||!finite(start?.y)||!finite(end?.x)||!finite(end?.y))return null;
 const dx=end.x-start.x,dy=end.y-start.y;
 const distance=Math.hypot(dx,dy);
 const via=tool==='line'&&Array.isArray(measurement.via)?measurement.via:[];
 if(via.length>MAX_LINE_TURNS||via.some(p=>!finite(p?.x)||!finite(p?.y)))return null;
 const path=[start,...via,end];
 // Round each completed leg to the nearest 5ft, not the straight-line
 // displacement between the start and the final endpoint.
 const routeCells=tool==='line'?path.slice(1).reduce((sum,p,i)=>
  sum+Math.round(Math.hypot(p.x-path[i].x,p.y-path[i].y)),0):0;
 const rawRadius=tool==='square'?Math.max(Math.abs(dx),Math.abs(dy)):distance;
 const radius=tool==='line'?routeCells:Math.max(0,Math.round(rawRadius));
 const feet=radius*FEET_PER_CELL;
 const origin={x:start.x,y:start.y};
 const label=tool==='line'?feet+' ft':
  tool==='cone'?feet+' ft cone':feet+' ft radius';
 // Cone spans the direction between cell centres; its width at the far end
 // matches that length (53.13 degree total angle).
 const halfPerp={x:-(dy/2),y:dx/2};
 const corners=tool==='cone'&&distance>0?[
  origin,{x:end.x+halfPerp.x,y:end.y+halfPerp.y},
  {x:end.x-halfPerp.x,y:end.y-halfPerp.y}
 ]:[];
 return {
  tool,origin,end,path,via,length:tool==='line'?path.slice(1).reduce((sum,p,i)=>
   sum+Math.hypot(p.x-path[i].x,p.y-path[i].y),0):distance,
  radius,feet,label,corners,
  square:{x:start.x-radius,y:start.y-radius,width:radius*2,height:radius*2},
  labelPoint:tool==='square'?{x:start.x+radius,y:start.y-radius}:end
 };
}

/** The sender owns its IDs and actor; events are sent only on the private map
 * Realtime channel. A pin has no timer; remove and clear are immediate.
 */
export function liveMeasurementPayload(measure,id,actor,mapId,phase,seq){
 const event={actor,mapId,phase,seq};
 if(phase==='clear')return event;
 event.id=id;
 if(phase==='remove')return event;
 return {...event,tool:measure.tool,
  start:{x:measure.start.x,y:measure.start.y},
  end:{x:measure.end.x,y:measure.end.y},
  ...(measure.tool==='line'&&Array.isArray(measure.via)&&measure.via.length?
   {via:measure.via.map(p=>({x:p.x,y:p.y}))}:{})};
}
export function validMeasurement(payload,mapId,maxX=1000,maxY=1000){
 if(!payload||payload.mapId!==mapId||
    !uuid.test(String(payload.actor||''))||
    !MEASUREMENT_PHASES.includes(payload.phase)||
    !Number.isSafeInteger(payload.seq)||payload.seq<=0)return false;
 if(payload.phase==='clear')return true;
 if(!uuid.test(String(payload.id||'')))return false;
 if(payload.phase==='remove')return true;
 if(!MEASUREMENT_TOOLS.includes(payload.tool)||
    !payload.start||!payload.end)return false;
 const via=payload.via;
 if(via!==undefined&&(payload.tool!=='line'||!Array.isArray(via)||
  via.length>MAX_LINE_TURNS))return false;
 for(const point of [payload.start,...(via||[]),payload.end]){
  if(!finite(point.x)||!finite(point.y)||point.x<0||point.y<0||
     point.x>maxX||point.y>maxY)return false;
 }
 return true;
}

/** The revision registers prevent late previews resurrecting cleared drawings.
 * Mutable maps belong to the current map/channel, never to all campaigns.
 */
export function acceptMeasurementEvent(payload,latestById,lastClearByActor){
 const clearSeq=lastClearByActor.get(payload.actor)||0;
 if(payload.seq<=clearSeq)return false;
 if(payload.phase==='clear'){
  lastClearByActor.set(payload.actor,payload.seq);
  return true;
 }
 const key=payload.actor+':'+payload.id;
 const lastSeq=latestById.get(key)||0;
 if(payload.seq<=lastSeq)return false;
 latestById.set(key,payload.seq);
 return true;
}
export function applyMeasurementEventToVisible(current,payload){
 if(payload.phase==='clear')
  return Object.fromEntries(Object.entries(current).filter(([,m])=>
   m.actor!==payload.actor));
 const next={...current};
 if(payload.phase==='remove')delete next[payload.id];
 else next[payload.id]={...payload};
 return next;
}
