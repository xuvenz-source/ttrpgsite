import {FOG_UNEXPLORED,FOG_EXPLORED,FOG_VISIBLE} from './MapFogModel.js';

/** Prepare an opaque, presentation-only fog mask from a sanitized frame.
 * A pending RPC may preserve previously authorized artwork for continuity,
 * but those cosmetic cells NEVER become authoritative line of sight.
 */
export function fogPaintMask(frame,displayVisible=[]){
 if(!frame||!Number.isSafeInteger(frame.width)||!Number.isSafeInteger(frame.height)||
    frame.width<1||frame.height<1||frame.width*frame.height>65536)return null;
 const count=frame.width*frame.height;
 const result=new Uint8Array(count);
 if(frame.enabled===false){result.fill(FOG_VISIBLE);return result}
 for(const index of frame.explored||[])
  if(Number.isSafeInteger(index)&&index>=0&&index<count)result[index]=FOG_EXPLORED;
 for(const index of frame.visible||[])
  if(Number.isSafeInteger(index)&&index>=0&&index<count)result[index]=FOG_VISIBLE;
 const exploredSet=new Set(frame.explored||[]);
 for(const index of displayVisible||[])
  if(Number.isSafeInteger(index)&&index>=0&&index<count&&exploredSet.has(index))
   result[index]=FOG_VISIBLE;
 return result;
}

/** Return only changed raster cells; avoids clearing and repainting entire
 * map on every fog tick. Changes do not decide what the user is allowed to see.
 */
export function changedFogCells(previous,next){
 if(!(next instanceof Uint8Array))return [];
 if(!(previous instanceof Uint8Array)||previous.length!==next.length)
  return Array.from({length:next.length},(_,i)=>i);
 const changed=[];
 for(let index=0;index<next.length;index++)
  if(previous[index]!==next[index])changed.push(index);
 return changed;
}

export {FOG_UNEXPLORED,FOG_EXPLORED,FOG_VISIBLE};
