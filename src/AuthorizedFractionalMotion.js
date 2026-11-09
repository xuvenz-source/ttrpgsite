/** Sub-cell sprite presentation inside a known, already permitted crossing.
 * This never changes canonical grid position or vision. Missing/stale edges
 * fail closed and return the already accepted integer location.
 */
export function authorizedFractionalOffset(accepted,raw,canCross){
 if(![accepted?.dx,accepted?.dy].every(Number.isSafeInteger)||
    ![raw?.dx,raw?.dy].every(Number.isFinite)||
    typeof canCross!=='function')return accepted;
 const x=Math.max(-.499,Math.min(.499,raw.dx-accepted.dx));
 const y=Math.max(-.499,Math.min(.499,raw.dy-accepted.dy));
 if(x===0&&y===0)return {dx:accepted.dx,dy:accepted.dy};
 const sx=Math.sign(x),sy=Math.sign(y);
 const next={dx:accepted.dx+sx,dy:accepted.dy+sy};
 if(canCross(accepted,next))return {
  dx:accepted.dx+x,dy:accepted.dy+y};
 // The user may be sliding against a blocked corner. Each axis is
 // independently permitted; never synthesize an unknown diagonal.
 if(sx&&canCross(accepted,{dx:accepted.dx+sx,dy:accepted.dy}))
  return {dx:accepted.dx+x,dy:accepted.dy};
 if(sy&&canCross(accepted,{dx:accepted.dx,dy:accepted.dy+sy}))
  return {dx:accepted.dx,dy:accepted.dy+y};
 return {dx:accepted.dx,dy:accepted.dy};
}
