/**
 * World Engine V2 — static handout pins follow the same viewer-effective
 * fog mask as tokens. A revealed campaign handout is not automatically
 * clickable through an unexplored wall.
 *
 * Data access/RLS for the pin body remains independently server-checked.
 */
export function visibleWorldPins(pins,frame){
 if(!Array.isArray(pins)||!frame||!Number.isSafeInteger(frame.width)||
  !Number.isSafeInteger(frame.height)||frame.width<1||frame.height<1||
  typeof frame.enabled!=='boolean'||!Array.isArray(frame.visible))
  return [];
 if(!frame.enabled)return pins;
 const allowed=new Set(frame.visible);
 const width=frame.width,height=frame.height;
 return pins.filter(pin=>{
  if(!pin||!Number.isFinite(Number(pin.x))||
   !Number.isFinite(Number(pin.y)))return false;
  const x=Math.floor(Number(pin.x)),y=Math.floor(Number(pin.y));
  return x>=0&&y>=0&&x<width&&y<height&&allowed.has(y*width+x);
 });
}
