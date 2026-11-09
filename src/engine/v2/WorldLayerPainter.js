/**
 * World Engine V2 — persistent canvas painters, not independent render loops.
 *
 * Terrain <img>, static environment canvas and fog canvas are mounted ONCE
 * by the Phase 9 adapter. These painters never construct/remove DOM nodes,
 * never fetch map files, and never calculate player visibility.
 *
 * Fog grants are only the server-issued Phase 7 trinary mask. Cosmetic edge
 * gradients are confined INSIDE cells already marked visible; they NEVER
 * clear or reveal a concealed neighbouring cell.
 */
import {diffWorldFogMasks} from './VisibilityFrame.js';
import {occludedLightFan} from './LightOcclusion.js';

const DARK='#040914';
const EXPLORED='rgba(4,9,20,0.74)';
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const safeDim=(value,fallback=1)=>finite(value)&&value>=1&&value<=1000000?
 value:fallback;
function resize(canvas,width,height){
 const changed=canvas.width!==width||canvas.height!==height;
 if(changed){canvas.width=width;canvas.height=height}
 return changed;
}
function place(canvas,width,height){
 if(!canvas?.style)return;
 const a=Math.max(1,width)+'px',b=Math.max(1,height)+'px';
 if(canvas.style.width!==a)canvas.style.width=a;
 if(canvas.style.height!==b)canvas.style.height=b;
 canvas.style.position='absolute';
 canvas.style.left='0';
 canvas.style.top='0';
 canvas.style.pointerEvents='none';
}
const safeCtx=canvas=>typeof canvas?.getContext==='function'?
 canvas.getContext('2d',{alpha:true}):null;
const pointInside=(mask,w,h,x,y)=>x>=0&&x<w&&y>=0&&y<h&&
 mask[y*w+x]===2;
function drawFogCell(ctx,mask,w,h,x,y,cellPixels,feather){
 const state=mask[y*w+x],px=x*cellPixels,py=y*cellPixels;
 ctx.clearRect(px,py,cellPixels,cellPixels);
 if(state===0||state===1){
  ctx.fillStyle=state===0?DARK:EXPLORED;
  ctx.fillRect(px,py,cellPixels,cellPixels);
  return;
 }
 if(!feather||typeof ctx.createLinearGradient!=='function')return;
 const edge=Math.max(1,Math.floor(cellPixels*0.4));
 // Never shade or clear any pixel outside this already-authorized cell.
 const borders=[
  {neighbor:[x-1,y],area:[px,py,edge,cellPixels],line:[px,py,px+edge,py]},
  {neighbor:[x+1,y],area:[px+cellPixels-edge,py,edge,cellPixels],
   line:[px+cellPixels,py,px+cellPixels-edge,py]},
  {neighbor:[x,y-1],area:[px,py,cellPixels,edge],line:[px,py,px,py+edge]},
  {neighbor:[x,y+1],area:[px,py+cellPixels-edge,cellPixels,edge],
   line:[px,py+cellPixels,px,py+cellPixels-edge]}
 ];
 for(const border of borders){
  const [nx,ny]=border.neighbor;
  if(pointInside(mask,w,h,nx,ny))continue;
  const neighbor=nx>=0&&ny>=0&&nx<w&&ny<h?mask[ny*w+nx]:0;
  const gradient=ctx.createLinearGradient(...border.line);
  gradient.addColorStop(0,neighbor===1?EXPLORED:DARK);
  gradient.addColorStop(1,'rgba(4,9,20,0)');
  ctx.fillStyle=gradient;ctx.fillRect(...border.area);
 }
}
/** Keep last-rendered mask in the owning WorldRenderer, never in React state.
 * Return the exact number of cell repaints for performance diagnostics.
 */
export function paintWorldFogLayer({
 canvas,frame,mask,previousMask=null,forceFull=false,
 pixelsPerCell=8,feather=true,widthPx,heightPx
}={}){
 if(!canvas||!integer(pixelsPerCell,2,16)||
  !finite(widthPx)||!finite(heightPx)||widthPx<=0||heightPx<=0)
  return {ok:false,cells:0,full:false};
 place(canvas,widthPx,heightPx);
 const ctx=safeCtx(canvas);
 if(!ctx)return {ok:false,cells:0,full:false};
 // No authorized sight: deliberately opaque; do NOT keep last bright mask.
 if(!frame){
  const resized=resize(canvas,1,1);
  ctx.clearRect(0,0,1,1);ctx.fillStyle=DARK;ctx.fillRect(0,0,1,1);
  if(canvas.style)canvas.style.backgroundColor=DARK;
  return {ok:true,cells:0,full:true,resized};
 }
 if(!integer(frame.width,1,10000)||!integer(frame.height,1,10000)||
  typeof frame.enabled!=='boolean')
  return paintWorldFogLayer({canvas,frame:null,mask:null,widthPx,heightPx});
 // Large maps with fog DISABLED are intentionally maskless. Never allocate
 // massive transparent bitmaps solely to encode "all visible".
 if(!frame.enabled){
  const resized=resize(canvas,1,1);
  ctx.clearRect(0,0,1,1);
  if(canvas.style)canvas.style.backgroundColor='transparent';
  return {ok:true,cells:0,full:true,resized};
 }
 const {width,height}=frame;
 if(width>128||height>128||!mask||mask.length!==width*height)
  return paintWorldFogLayer({canvas,frame:null,mask:null,widthPx,heightPx});
 const w=width*pixelsPerCell,h=height*pixelsPerCell;
 const resized=resize(canvas,w,h);
 // The canvas must remain transparent *behind* currently visible cells.
 // Hidden cells themselves are explicitly filled opaque below. Leaving
 // the fallback CSS background dark here would black out authorized sight.
 if(canvas.style)canvas.style.backgroundColor='transparent';
 const full=forceFull||resized||!previousMask||
  previousMask.length!==mask.length;
 const dirty=full?{full:true,rects:[{x:0,y:0,width,height}]}:
  diffWorldFogMasks(previousMask,mask,width,height);
 if(!full&&!dirty.rects.length)
  return {ok:true,cells:0,full:false,resized};
 const indices=new Set();
 for(const rect of dirty.rects){
  if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger))
   return paintWorldFogLayer({canvas,frame:null,mask:null,widthPx,heightPx});
  // Feather edge changes when a neighbour's visibility changes. Redraw
  // those visible cells as well, but NEVER expand authorization.
  for(let y=Math.max(0,rect.y-1);y<Math.min(height,rect.y+rect.height+1);y++)
   for(let x=Math.max(0,rect.x-1);x<Math.min(width,rect.x+rect.width+1);x++)
    indices.add(y*width+x);
 }
 for(const idx of indices){
  const x=idx%width,y=Math.floor(idx/width);
  drawFogCell(ctx,mask,width,height,x,y,pixelsPerCell,feather);
 }
 return {ok:true,cells:indices.size,full,resized};
}

/**
 * DM-authorized static environment guide layer, compiled/repainted ONLY
 * on Phase 6 scene publication or DM scene switch. Ordinary players get an
 * empty canvas; concealed wall/light coordinates never reach this function.
 *
 * Canvas is capped at 2048² native pixels to protect browser memory on
 * very large maps; CSS presentation scales it to the map dimensions.
 */
export function paintWorldStaticLayer({
 canvas,scene,dirty=null,forceFull=false
}={}){
 if(!canvas||!scene?.dimensions||!finite(scene.dimensions.width)||
  !finite(scene.dimensions.height)||!finite(scene.dimensions.gridSize)||
  scene.dimensions.gridSize<=0)return {ok:false,objects:0,full:false};
 const d=scene.dimensions;
 const mapW=Math.floor(d.width/d.gridSize);
 const mapH=Math.floor(d.height/d.gridSize);
 if(mapW<1||mapH<1||mapW>10000||mapH>10000)
  return {ok:false,objects:0,full:false};
 const pixelW=Math.min(2048,Math.max(1,mapW*4));
 const pixelH=Math.min(2048,Math.max(1,mapH*4));
 place(canvas,safeDim(d.width),safeDim(d.height));
 const resized=resize(canvas,pixelW,pixelH);
 const ctx=safeCtx(canvas);
 if(!ctx)return {ok:false,objects:0,full:false};
 const objects=scene.scope==='dm'&&scene.published?
  scene.environment?.objects??[]:[];
 if(!Array.isArray(objects)||objects.length>120)return {ok:false,objects:0,full:false};
 const whole=forceFull||resized||dirty?.full===true||
  !Array.isArray(dirty?.regions);
 const regions=whole?[{left:0,top:0,right:mapW,bottom:mapH}]:
  dirty.regions.filter(r=>r&&[r.left,r.right,r.top,r.bottom].every(finite));
 if(!regions.length)return {ok:true,objects:0,full:false,resized};
 // In native resolution, paint geometry in grid-cell coordinates.
 const sx=pixelW/mapW,sy=pixelH/mapH;
 ctx.save();
 ctx.setTransform(sx,0,0,sy,0,0);
 let painted=0;
 for(const rect of regions){
  const left=Math.max(0,Math.min(mapW,rect.left));
  const top=Math.max(0,Math.min(mapH,rect.top));
  const right=Math.max(left,Math.min(mapW,rect.right));
  const bottom=Math.max(top,Math.min(mapH,rect.bottom));
  ctx.save();ctx.beginPath();
  ctx.rect(left,top,right-left,bottom-top);ctx.clip();
  ctx.clearRect(left,top,right-left,bottom-top);
  for(const object of objects){
   if(object.type==='light'){
    if(object.enabled===false)continue;
    const radius=Math.max(0,Math.min(200,
     (Number(object.bright||0)+Number(object.dim||0))/5));
    if(!radius||!finite(object.x)||!finite(object.y)||
     object.x+radius<left||object.x-radius>right||
     object.y+radius<top||object.y-radius>bottom)continue;
    if(typeof ctx.createRadialGradient==='function'){
     // DM lighting is decorative only. Never paint an unoccluded
     // radius through the environment's light-blocking geometry.
     const fan=occludedLightFan(objects,{x:object.x,y:object.y},radius);
     if(fan&&fan.length){
      ctx.save();ctx.beginPath();ctx.moveTo(object.x,object.y);
      for(const point of fan)ctx.lineTo(point.x,point.y);
      ctx.closePath?.();ctx.clip();
      const gradient=ctx.createRadialGradient(
       object.x,object.y,0,object.x,object.y,radius);
      gradient.addColorStop(0,'rgba(255,217,125,0.2)');
      gradient.addColorStop(1,'rgba(255,217,125,0)');
      ctx.fillStyle=gradient;ctx.beginPath();
      ctx.arc(object.x,object.y,radius,0,Math.PI*2);
      ctx.fill();ctx.restore();painted++;
     }
    }
    continue;
   }
   if(!['wall','door','window'].includes(object.type)||
    !Array.isArray(object.points)||object.points.length<2)continue;
   ctx.beginPath();
   for(let i=0;i<object.points.length;i++){
    const p=object.points[i];
    if(!finite(p.x)||!finite(p.y))continue;
    if(i===0)ctx.moveTo(p.x,p.y);
    else ctx.lineTo(p.x,p.y);
   }
   ctx.lineWidth=0.07;
   ctx.strokeStyle=object.type==='door'?
    (object.state==='open'?'rgba(86,212,149,0.55)':'rgba(245,171,94,0.8)'):
    object.type==='window'?'rgba(103,199,232,0.7)':
    'rgba(255,255,255,0.65)';
   ctx.stroke();painted++;
  }
  ctx.restore();
 }
 ctx.restore();
 return {ok:true,objects:painted,full:whole,resized};
}
