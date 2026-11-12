/**
 * B10-R18-16 — OFFLINE RESEARCH MODEL ONLY.
 *
 * V2 published walls are zero-area line segments. "10% covered tile"
 * therefore has no literal area definition. This model evaluates an
 * inward clearance of <=0.10 grid CELL units on each footprint edge.
 *
 * Crucial: THIS MODULE IS NOT IMPORTED BY THE APP OR SERVER.
 * It must NEVER be used as a permission grant. A future production
 * variant requires authoritative PostgreSQL/direct-write/observer
 * parity plus real player security testing and separate SQL approval.
 */
import {
 validCollisionPoint,segmentCrossesSweptFootprint
} from '../../src/engine/v2/CollisionGeometry.js';

export const RESEARCH_WALL_CLEARANCE_CELLS=0.10;
const validSpan=n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=12;
const validMargin=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=0.10;
const shift=(p,dx,dy)=>({x:p.x+dx,y:p.y+dy});

/**
 * Evaluate both old strict collision and an experimental shrunken
 * footprint at one single server-sized movement step.
 * Returns NULL (not permit) on malformed geometry.
 *
 * Compare only; cannot convey any right to move.
 */
export function evaluateWallEdgeClearance({
 wallStart,wallEnd,from,to,spanX=1,spanY=1,
 clearanceCells=RESEARCH_WALL_CLEARANCE_CELLS
}={}){
 if(![wallStart,wallEnd,from,to].every(validCollisionPoint)||
  !validSpan(spanX)||!validSpan(spanY)||
  !validMargin(clearanceCells))return null;
 const insetX=Math.min(clearanceCells,spanX/4);
 const insetY=Math.min(clearanceCells,spanY/4);
 const baselineBlocked=segmentCrossesSweptFootprint(
  wallStart,wallEnd,from,to,spanX,spanY);
 // Inset the complete swept footprint, never just the destination.
 // A wall crossing the token interior remains collidable.
 const innerFrom=shift(from,insetX,insetY),innerTo=shift(to,insetX,insetY);
 const candidateBlocked=segmentCrossesSweptFootprint(
  wallStart,wallEnd,innerFrom,innerTo,
  spanX-2*insetX,spanY-2*insetY);
 return Object.freeze({
  baselineBlocked,candidateBlocked,
  changed:baselineBlocked&&!candidateBlocked,
  clearanceCells,insetX,insetY,
  // NOT an authorization decision or a recommendation to bypass a wall.
  researchOnly:true
 });
}
