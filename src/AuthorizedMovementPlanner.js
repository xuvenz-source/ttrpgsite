import {NAV_DIRECTIONS,NAV_MAX_NODES} from './AuthorizedNavigation.js';
import {MAX_MOTION_WAYPOINTS} from './MapMovementPath.js';

/**
 * Plan a bounded grid route using ONLY already-issued, currently valid server
 * navigation edges. Used for keyboard/side-panel movement where there is no
 * pointer trajectory. It must never inspect walls or infer hidden geometry.
 *
 * Returns offsets from the original canonical cell, or null if no authorized
 * route exists. Adjacent movements are checked directly (no BFS allocation).
 * Every returned leg is a single granted edge, so the server's swept path
 * validator can independently validate exactly the same route.
 */
export function planAuthorizedGridRoute({
 origin,destination,canStep,maxSteps=MAX_MOTION_WAYPOINTS
}={}){
 if(typeof canStep!=='function'||![origin?.x,origin?.y,
    destination?.x,destination?.y].every(Number.isSafeInteger)||
    !Number.isSafeInteger(maxSteps)||maxSteps<1||
    maxSteps>MAX_MOTION_WAYPOINTS)return null;
 const dx=destination.x-origin.x,dy=destination.y-origin.y;
 if(dx===0&&dy===0)return [];
 if(Math.abs(dx)>128||Math.abs(dy)>128)return null;
 if(Math.max(Math.abs(dx),Math.abs(dy))===1)
  return canStep(origin,destination)?[{dx,dy}]:null;
 const key=(x,y)=>x+':'+y;
 const originKey=key(origin.x,origin.y),targetKey=key(destination.x,destination.y);
 const queue=[{x:origin.x,y:origin.y,depth:0,key:originKey}];
 const visited=new Map([[originKey,null]]);
 let cursor=0,found=false;
 while(cursor<queue.length&&queue.length<=NAV_MAX_NODES){
  const current=queue[cursor++];
  if(current.depth>=maxSteps)continue;
  // Prefer the destination direction without ever inventing a permitted edge.
  const directions=[...NAV_DIRECTIONS].sort((a,b)=>
   Math.max(Math.abs(destination.x-(current.x+a[0])),
    Math.abs(destination.y-(current.y+a[1])))-
   Math.max(Math.abs(destination.x-(current.x+b[0])),
    Math.abs(destination.y-(current.y+b[1]))));
  for(const [sx,sy] of directions){
   const x=current.x+sx,y=current.y+sy,ident=key(x,y);
   if(visited.has(ident))continue;
   const next={x,y};
   if(!canStep({x:current.x,y:current.y},next))continue;
   visited.set(ident,current.key);
   if(ident===targetKey){found=true;break}
   if(queue.length>=NAV_MAX_NODES)continue;
   queue.push({...next,depth:current.depth+1,key:ident});
  }
  if(found)break;
 }
 if(!found)return null;
 const path=[];
 for(let at=targetKey;at!==originKey;at=visited.get(at)){
  if(typeof at!=='string'||path.length>=maxSteps)return null;
  const [x,y]=at.split(':').map(Number);
  path.push({dx:x-origin.x,dy:y-origin.y});
 }
 return path.reverse();
}
