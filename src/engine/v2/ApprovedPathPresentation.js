/**
 * Server-approved local route presentation. This is cosmetic only: every
 * waypoint must be an adjacent integer cell from an already validated ACK.
 * No extrapolation, hidden geometry, timer, RPC or second animation loop.
 */
const valid=p=>Number.isSafeInteger(p?.x)&&Number.isSafeInteger(p?.y)&&
 p.x>=0&&p.y>=0&&p.x<=10000&&p.y<=10000;
const copy=p=>({x:p.x,y:p.y});
const same=(a,b)=>a?.x===b?.x&&a?.y===b?.y;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const adjacent=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))===1;
export function createApprovedPathPresentation({catchupMs=105,maxQueue=96}={}){
 if(!Number.isFinite(catchupMs)||catchupMs<35||catchupMs>500||
  !Number.isSafeInteger(maxQueue)||maxQueue<24||maxQueue>192)
  throw Error('Invalid approved presentation bounds');
 let position=null,endpoint=null,lastNow=null;
 const queue=[];
 function reset(at){
  if(!Number.isFinite(at?.x)||!Number.isFinite(at?.y))return false;
  position=copy(at);endpoint=copy(at);queue.length=0;lastNow=null;return true;
 }
 function accept(from,cells){
  if(!valid(from)||!Array.isArray(cells)||cells.length>24||
   !position||!same(from,endpoint))return false;
  let at=from;
  for(const p of cells){if(!valid(p)||!adjacent(at,p))return false;at=p}
  if(!cells.length)return true;
  if(queue.length+cells.length>maxQueue){
   // Drop only cosmetic backlog at an already verified waypoint.
   position=copy(endpoint);queue.length=0;lastNow=null;
  }
  queue.push(...cells.map(copy));endpoint=copy(cells.at(-1));return true;
 }
 function tick(now){
  if(!queue.length||!Number.isFinite(now))return null;
  if(lastNow===null){lastNow=now;return null}
  const elapsed=Math.max(0,Math.min(80,now-lastNow));lastNow=now;
  if(!elapsed)return null;
  let left=0,previous=position;
  for(const p of queue){left+=dist(previous,p);previous=p}
  const speed=Math.max(1/75,left/catchupMs);
  // Bound physical screen travel per frame even after a network burst.
  let travel=Math.min(elapsed*speed,2.5),changed=false;
  while(travel>1e-9&&queue.length){
   const to=queue[0],d=dist(position,to);
   if(d<1e-9){queue.shift();continue}
   if(travel>=d-1e-9){position=copy(to);queue.shift();travel-=d}
   else{
    const k=travel/d;
    position={x:position.x+(to.x-position.x)*k,
     y:position.y+(to.y-position.y)*k};travel=0;
   }
   changed=true;
  }
  if(!queue.length)lastNow=null;
  return changed?copy(position):null;
 }
 return Object.freeze({reset,accept,tick,
  get pendingCount(){return queue.length},
  get position(){return position?copy(position):null},
  get endpoint(){return endpoint?copy(endpoint):null}
 });
}
