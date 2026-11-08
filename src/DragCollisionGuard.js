import {checkTokenMovement} from './MapCollision.js';

/** Local collision is only available where the DM already holds the published
 * environment. Players NEVER receive hidden wall geometry; their visuals
 * are gated by a trusted motion-session response instead.
 *
 * Trace from the last accepted group offset, not from the start to the pointer,
 * so sliding parallel to an obstruction remains possible. All members must
 * pass the identical swept segment before any may advance.
 */
export function traceSolidGroupOffset({pieces,map,environment,previous,desired}){
 if(!Array.isArray(pieces)||!pieces.length||!map||!environment||
  !previous||!desired)return previous||{dx:0,dy:0};
 const last={dx:previous.dx,dy:previous.dy};
 const deltaX=desired.dx-last.dx,deltaY=desired.dy-last.dy;
 if(!Number.isSafeInteger(deltaX)||!Number.isSafeInteger(deltaY))return last;
 const count=Math.max(Math.abs(deltaX),Math.abs(deltaY));
 if(count>512)return last;
 let accepted=last;
 for(let step=1;step<=count;step++){
  const candidate={dx:Math.round(last.dx+deltaX*step/count),
   dy:Math.round(last.dy+deltaY*step/count)};
  if(candidate.dx===accepted.dx&&candidate.dy===accepted.dy)continue;
  if(!pieces.every(piece=>checkTokenMovement({
   token:{...piece,x:Number(piece.x)+accepted.dx,
    y:Number(piece.y)+accepted.dy},
   destination:{x:Number(piece.x)+candidate.dx,
    y:Number(piece.y)+candidate.dy},map,environment
  }).allowed))break;
  accepted=candidate;
 }
 return accepted;
}

/** Authenticated server session samples are permission for a trajectory step,
 * not the final persisted write. Every group member must share the same
 * confirmed offsets, in order, before a group final commit is attempted. */
export function sharedApprovedPath(members,grants){
 if(!Array.isArray(members)||!members.length||!Array.isArray(grants)||
    members.length!==grants.length)return [];
 const paths=grants.map((g,i)=>{
  if(!Array.isArray(g)||!members[i])return [];
  return g.filter(p=>p&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y))
   .map(p=>({dx:p.x-Number(members[i].x),dy:p.y-Number(members[i].y)}))
   .filter(p=>Number.isSafeInteger(p.dx)&&Number.isSafeInteger(p.dy));
 });
 if(paths.some(p=>!p.length))return [];
 const approved=paths[0],common=[];
 const cursors=paths.map(()=>0);
 for(const point of approved){
  const proposed=paths.map((path,i)=>path.findIndex((p,j)=>j>=cursors[i]&&
   p.dx===point.dx&&p.dy===point.dy));
  if(proposed.some(index=>index<0))continue;
  for(let i=0;i<cursors.length;i++)cursors[i]=proposed[i]+1;
  common.push(point);
 }
 return common.filter((p,i)=>i===0?
  p.dx!==0||p.dy!==0:
  p.dx!==common[i-1].dx||p.dy!==common[i-1].dy);
}

/**
 * A player may predict only server-issued transitions. Unknown/expired edges
 * STOP movement; no browser copy of private wall or secret-door geometry.
 * Attempt movement parallel to an obstruction so wall sliding remains natural.
 * Return every accepted edge for authoritative curved-path persistence.
 */
export function traceAuthorizedGroupOffset({pieces,previous,desired,canStep}){
 const last={dx:Number(previous?.dx),dy:Number(previous?.dy)};
 if(!Array.isArray(pieces)||!pieces.length||typeof canStep!=='function'||
  ![last.dx,last.dy,desired?.dx,desired?.dy].every(Number.isSafeInteger))
  return {...(previous||{dx:0,dy:0}),path:[]};
 const dx=desired.dx-last.dx,dy=desired.dy-last.dy;
 const steps=Math.max(Math.abs(dx),Math.abs(dy));
 if(steps>512)return {...last,path:[]};
 let accepted=last;
 const path=[];
 function canMove(candidate){
  if(candidate.dx===accepted.dx&&candidate.dy===accepted.dy)return false;
  return pieces.every(piece=>{
   const originX=Number(piece.x),originY=Number(piece.y);
   if(!Number.isSafeInteger(originX)||!Number.isSafeInteger(originY)||
    !piece.id||!piece.kind)return false;
   return canStep(piece,{
    x:originX+accepted.dx,y:originY+accepted.dy
   },{
    x:originX+candidate.dx,y:originY+candidate.dy
   });
  });
 }
 function move(candidate){
  if(!canMove(candidate))return false;
  accepted=candidate;path.push(candidate);return true;
 }
 for(let step=1;step<=steps;step++){
  const target={dx:Math.round(last.dx+dx*step/steps),
   dy:Math.round(last.dy+dy*step/steps)};
  if(target.dx===accepted.dx&&target.dy===accepted.dy)continue;
  if(move(target))continue;
  // Never guess a diagonal through a blocked corner. Each fallback must
  // independently appear in the server's opaque, versioned edge graph.
  const xOnly={dx:target.dx,dy:accepted.dy};
  const yOnly={dx:accepted.dx,dy:target.dy};
  if(!move(xOnly))move(yOnly);
 }
 return {...accepted,path};
}
