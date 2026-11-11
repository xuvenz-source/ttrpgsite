/**
 * B10-R18-15 — hysteresis for POINTER-ONLY grid intent.
 *
 * At a shared cell edge/corner a physical mouse may fluctuate by a fraction
 * of a pixel. Rounding each sample independently creates back-and-forth
 * gesture bends, and each bend can become another server-authorized RPC.
 *
 * This only stabilizes WHICH cell the player asks to reach. It never
 * decides collision, authorizes a step or moves a token.
 * Keyboard input deliberately continues to use exact integer cells.
 */
import {gridPoint} from './GesturePath.js';
export const POINTER_EDGE_HYSTERESIS_CELLS=0.10;
const validCell=p=>Number.isSafeInteger(p?.x)&&Number.isSafeInteger(p?.y);
export function pointerIntentCell(pointer,previous=null,{
 hysteresis=POINTER_EDGE_HYSTERESIS_CELLS
}={}){
 const next=gridPoint(pointer);
 if(!next||previous!==null&&!validCell(previous)||
  !Number.isFinite(hysteresis)||hysteresis<0||hysteresis>=0.49)
  return null;
 if(previous===null)return next;
 const result={...next};
 for(const axis of ['x','y']){
  const step=Math.sign(next[axis]-previous[axis]);
  // Only an adjacent-cell crossing can be boundary jitter. Never swallow
  // deliberate multi-tile jumps, diagonal turns or keyboard intent.
  if(Math.abs(next[axis]-previous[axis])!==1)continue;
  const edge=previous[axis]+step*0.5;
  if(Math.abs(pointer[axis]-edge)<hysteresis)
   result[axis]=previous[axis];
 }
 return result;
}
