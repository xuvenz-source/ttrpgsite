/** Ordered, bounded path transport for DM/private-observer movement.
 * Unlike latest-only endpoints, overwriting a pending corner would turn a
 * truthful swept path into a direct line through a wall.
 *
 * This queue does not authorize coordinates. The server independently checks
 * actor, canonical origin, published geometry and viewer sight.
 */
export const MAX_PATH_PREVIEW_CELLS=48;
export const MAX_QUEUED_PATH_CELLS=192;
const valid=p=>Number.isSafeInteger(p?.x)&&Number.isSafeInteger(p?.y)&&
 p.x>=0&&p.y>=0&&p.x<=10000&&p.y<=10000;
const same=(a,b)=>a?.x===b?.x&&a?.y===b?.y;
export function expandSweptPreviewLeg(from,to,max=MAX_QUEUED_PATH_CELLS){
 if(!valid(from)||!valid(to))return null;
 const dx=to.x-from.x,dy=to.y-from.y,
  distance=Math.max(Math.abs(dx),Math.abs(dy));
 if(distance>max)return null;
 const path=[{x:from.x,y:from.y}];let previous=path[0];
 for(let i=1;i<=distance;i++){
  const point={x:from.x+Math.round(dx*i/distance),
   y:from.y+Math.round(dy*i/distance)};
  if(same(point,previous))continue;
  if(Math.max(Math.abs(point.x-previous.x),
    Math.abs(point.y-previous.y))!==1)return null;
  path.push(point);previous=point;
 }
 return path;
}
export function createBufferedObserverPathQueue({
 send,onResult=()=>{},onError=()=>{},clock=Date.now,setTimer=setTimeout,
 clearTimer=clearTimeout,spacingMs=100
}){
 const entries=new Map();let disposed=false;
 function resolve(entry){
  for(const done of entry.waiters.splice(0))done();
 }
 function retire(key,entry){
  if(entries.get(key)!==entry)return;
  entries.delete(key);
  if(entry.timer!==null){clearTimer(entry.timer);entry.timer=null}
  resolve(entry);
 }
 function pump(key,entry){
  if(disposed||entry.cancelled||entry.busy||entry.timer!==null)return;
  if(entry.points.length<2){if(entry.cancelled)retire(key,entry);return}
  const elapsed=clock()-entry.lastSettledAt;
  if(entry.lastSettledAt&&elapsed<Math.max(90,spacingMs)){
   entry.timer=setTimer(()=>{entry.timer=null;pump(key,entry)},
    Math.max(90,spacingMs)-elapsed);
   return;
  }
  const batch=entry.points.slice(0,MAX_PATH_PREVIEW_CELLS+1);
  const packet={...entry.packet,params:{
   ...entry.packet.params,p_path:batch
  }};
  entry.busy=true;
  Promise.resolve().then(()=>send(packet)).then(result=>{
   if(disposed||entry.cancelled)return;
   if(result?.error||result?.data!==true){
    entry.points=[];onError(packet,result?.error||Error('Observer path denied'));
   }else{
    // Keep the last acknowledged cell as the next chunk's first cell.
    entry.points.splice(0,batch.length-1);
    onResult(packet,result);
   }
  },error=>{
   if(disposed||entry.cancelled)return;
   entry.points=[];onError(packet,error);
  }).finally(()=>{
   entry.busy=false;entry.lastSettledAt=clock();
   if(disposed||entry.cancelled){retire(key,entry);return}
   if(entry.points.length<2){resolve(entry);return}
   entry.timer=setTimer(()=>{
    entry.timer=null;pump(key,entry);
   },Math.max(90,spacingMs));
  });
 }
 return {
  enqueue(key,packet,from,to){
   if(disposed||!key||!packet?.params||!valid(from)||!valid(to))return false;
   const segment=expandSweptPreviewLeg(from,to);
   if(!segment||segment.length<2)return false;
   let entry=entries.get(key);
   if(!entry){
    entry={points:[],packet,busy:false,timer:null,cancelled:false,
     lastSettledAt:0,waiters:[]};
    entries.set(key,entry);
   }
   const previous=entry.points.at(-1);
   // Do not append a segment with missing intermediate corners. Never
   // synthesize a straight leap from the previous preview endpoint.
   if(previous&&!same(previous,segment[0]))return false;
   if(entry.points.length+segment.length-(previous?1:0)>
      MAX_QUEUED_PATH_CELLS+1)return false;
   entry.points.push(...segment.slice(previous?1:0));
   entry.packet=packet;
   pump(key,entry);return true;
  },
  drain(key){
   const entry=entries.get(key);
   if(!entry||(!entry.busy&&entry.points.length<2))return Promise.resolve();
   return new Promise(resolve=>entry.waiters.push(resolve));
  },
  cancel(key){
   const entry=entries.get(key);
   if(!entry)return Promise.resolve();
   entry.cancelled=true;entry.points=[];
   if(!entry.busy){retire(key,entry);return Promise.resolve()}
   return new Promise(resolve=>entry.waiters.push(resolve));
  },
  dispose(){
   disposed=true;
   for(const [key,entry] of entries){
    entry.cancelled=true;entry.points=[];
    if(!entry.busy)retire(key,entry);
   }
  },
  get inFlightCount(){return [...entries.values()].filter(x=>x.busy).length}
 };
}
