/**
 * World Engine V2 — recipient observer interpolation, driven by the single
 * future WorldRenderer frame scheduler (Phase 8). NO independent RAF/timer.
 *
 * This stores cosmetic positions only for a roster already authorized by
 * the server. Every interpolated point follows a server-approved adjacent
 * segment; do not interpolate directly across a bent route or unknown gap.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=p=>p.kind+':'+p.id;
const validPoint=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&
 p.x>=0&&p.y>=0&&p.x<=10000&&p.y<=10000;
const same=(a,b)=>a?.x===b?.x&&a?.y===b?.y;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const authorizedPiece=p=>p&&['token','tool'].includes(p.kind)&&
 typeof p.id==='string'&&UUID.test(p.id)&&validPoint(p)&&
 Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y);
const approvedPath=p=>p&&p.action==='path'&&['token','tool'].includes(p.kind)&&
 typeof p.id==='string'&&UUID.test(p.id)&&
 Array.isArray(p.path)&&p.path.length>=2&&p.path.length<=25&&
 p.path.every(x=>validPoint(x)&&Number.isSafeInteger(x.x)&&
 Number.isSafeInteger(x.y))&&p.path.every((x,i)=>i===0||
 Math.max(Math.abs(x.x-p.path[i-1].x),Math.abs(x.y-p.path[i-1].y))===1);
const maxQueue=96;
export function createObserverPathBuffer({maxPieces=500,catchupMs=150}={}){
 if(!Number.isSafeInteger(maxPieces)||maxPieces<1||maxPieces>500||
  !Number.isFinite(catchupMs)||catchupMs<20||catchupMs>1000)
  throw Error('Invalid V2 observer buffer bounds');
 const pieces=new Map();let disposed=false;
 function remaining(entry){
  let length=0,previous=entry.position;
  for(const waypoint of entry.pending){
   length+=distance(previous,waypoint);previous=waypoint;
  }
  return length;
 }
 return {
  /**
   * The caller supplies a NEW server-authorized roster after reconnect/fog
   * refresh. Clear every previous pending path/visibility marker first.
   */
  authorizePieces(rows){
   if(disposed||!Array.isArray(rows)||rows.length>maxPieces||
    !rows.every(authorizedPiece)||
    new Set(rows.map(key)).size!==rows.length)return false;
   pieces.clear();
   for(const item of rows){
    pieces.set(key(item),{
     kind:item.kind,id:item.id,position:{x:item.x,y:item.y},
     pending:[],hidden:false,lastNow:null
    });
   }
   return true;
  },
  applyPath(item){
   if(disposed||!approvedPath(item))return false;
   const entry=pieces.get(key(item));
   if(!entry||entry.hidden)return false;
   const expected=entry.pending.at(-1)||entry.position;
   if(!same(item.path[0],expected)||entry.pending.length+item.path.length-1>maxQueue)
    return false; // Require a genuine server snapshot, not a guessed diagonal.
   entry.pending.push(...item.path.slice(1).map(p=>({x:p.x,y:p.y})));
   return true;
  },
  applyHide(item){
   if(disposed||!item||!['token','tool'].includes(item.kind)||
    !UUID.test(String(item.id||''))||item.action!=='hide'||
    Object.hasOwn(item,'path'))return false;
   const entry=pieces.get(key(item));
   if(!entry)return false;
   entry.hidden=true;entry.pending.length=0;
   return true;
  },
  /**
   * Return only changed cosmetic positions. The renderer owns the single
   * requestAnimationFrame loop and calls tick(now) at its chosen frequency.
   */
  tick(now){
   if(disposed||!Number.isFinite(now))return [];
   const changed=[];
   for(const entry of pieces.values()){
    if(entry.hidden){entry.lastNow=now;continue}
    if(entry.lastNow===null){entry.lastNow=now;continue}
    const elapsed=Math.max(0,Math.min(120,now-entry.lastNow));
    entry.lastNow=now;
    if(!elapsed||!entry.pending.length)continue;
    const distanceLeft=remaining(entry);
    if(distanceLeft<=1e-9){entry.pending.length=0;continue}
    const speed=Math.max(1/28,distanceLeft/catchupMs);
    let advance=elapsed*speed,modified=false;
    while(advance>1e-9&&entry.pending.length){
     const to=entry.pending[0],length=distance(entry.position,to);
     if(length<1e-9){entry.pending.shift();continue}
     if(advance>=length-1e-9){
      entry.position={...to};entry.pending.shift();advance-=length;
     }else{
      const fraction=advance/length;
      entry.position={
       x:entry.position.x+(to.x-entry.position.x)*fraction,
       y:entry.position.y+(to.y-entry.position.y)*fraction
      };advance=0;
     }
     modified=true;
    }
    if(modified)changed.push({
     kind:entry.kind,id:entry.id,x:entry.position.x,y:entry.position.y
    });
   }
   return changed;
  },
  getPosition(kind,id){
   const e=pieces.get(kind+':'+id);
   return !e||e.hidden?null:{...e.position};
  },
  get pendingCount(){
   let count=0;for(const e of pieces.values())count+=e.pending.length;
   return count;
  },
  hideAll(){
   for(const entry of pieces.values()){
    entry.hidden=true;entry.pending.length=0;
   }
  },
  dispose(){disposed=true;pieces.clear()}
 };
}
