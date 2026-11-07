import {checkTokenMovement} from './MapCollision.js';

/** Advisory grid trajectory, not permission to write a token. A high-speed
 * pointer jump is evaluated cell by cell, retaining the last legal footprint
 * instead of visually landing past a solid wall. The database must independently
 * enforce the entire committed trajectory.
 *
 * Call only with geometry the viewer is entitled to possess. In particular,
 * never distribute private DM wall data to players to run this function.
 */
export function traceLegalTokenDestination({token,destination,map,environment,maxSteps=512}){
 const start={x:Number(token?.x),y:Number(token?.y)};
 const target={x:Number(destination?.x),y:Number(destination?.y)};
 if(![start.x,start.y,target.x,target.y].every(Number.isSafeInteger)||
    !map||!environment)
  return {...start,complete:false,reason:'invalid'};
 const dx=target.x-start.x,dy=target.y-start.y;
 const steps=Math.max(Math.abs(dx),Math.abs(dy));
 if(steps>maxSteps)return {...start,complete:false,reason:'too-far'};
 let accepted=start;
 for(let n=1;n<=steps;n++){
  const candidate={x:Math.round(start.x+dx*n/steps),
   y:Math.round(start.y+dy*n/steps)};
  if(candidate.x===accepted.x&&candidate.y===accepted.y)continue;
  const result=checkTokenMovement({
   token:{...token,x:accepted.x,y:accepted.y},
   destination:candidate,map,environment
  });
  if(!result.allowed)return {...accepted,complete:false,reason:result.reason,
   blockerId:result.blockerId};
  accepted=candidate;
 }
 return {...accepted,complete:true,reason:'ok'};
}
