import React,{useEffect,useRef,useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';

const SIZE=400;
const MAX_ART_MB=10;
const MAX_ZOOM=6;
const PAN_FACTOR=1.5;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const canvasBlob=(canvas,quality=.92)=>new Promise((resolve,reject)=>{
 canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not export artwork')),'image/webp',quality);
});

function framePath(ctx,shape,inset){
 ctx.beginPath();
 if(shape==='square')ctx.roundRect(inset,inset,SIZE-2*inset,SIZE-2*inset,Math.max(3,26-inset/3));
 else ctx.arc(SIZE/2,SIZE/2,SIZE/2-inset,0,Math.PI*2);
}

/**
 * Find the transparent opening containing the middle of a decorative frame.
 * A flood-fill cannot cross the opaque frame, so the resulting mask follows
 * irregular horns, blades, and other frame contours instead of imposing a circle.
 */
function detectFrameOpening(frame){
 const canvas=document.createElement('canvas');canvas.width=SIZE;canvas.height=SIZE;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(frame,0,0,SIZE,SIZE);
 const rgba=ctx.getImageData(0,0,SIZE,SIZE).data,threshold=120,total=SIZE*SIZE;
 const transparent=(index)=>rgba[index*4+3]<threshold;
 const middle=(SIZE/2|0)*SIZE+(SIZE/2|0);
 let start=transparent(middle)?middle:-1;
 if(start<0){
  let best=Infinity;
  for(let y=120;y<280;y+=2)for(let x=120;x<280;x+=2){
   const i=y*SIZE+x,dist=(x-200)**2+(y-200)**2;
   if(transparent(i)&&dist<best){best=dist;start=i}
  }
 }
 if(start<0)throw Error('The custom frame must have a transparent opening near its centre.');

 const seen=new Uint8Array(total),queue=new Int32Array(total);
 let first=0,last=0;
 seen[start]=1;queue[last++]=start;
 let left=SIZE,top=SIZE,right=0,bottom=0,touchesEdge=false;
 while(first<last){
  const index=queue[first++],x=index%SIZE,y=Math.floor(index/SIZE);
  if(x===0||y===0||x===SIZE-1||y===SIZE-1)touchesEdge=true;
  left=Math.min(left,x);right=Math.max(right,x);
  top=Math.min(top,y);bottom=Math.max(bottom,y);
  const neighbors=[];
  if(x>0)neighbors.push(index-1);
  if(x<SIZE-1)neighbors.push(index+1);
  if(y>0)neighbors.push(index-SIZE);
  if(y<SIZE-1)neighbors.push(index+SIZE);
  for(const next of neighbors)if(!seen[next]&&transparent(next)){
   seen[next]=1;queue[last++]=next;
  }
 }
 if(touchesEdge||last<2500){
  throw Error('The centre of this frame must be a closed transparent opening. This artwork appears open to the outside.');
 }

 const mask=document.createElement('canvas');mask.width=SIZE;mask.height=SIZE;
 const maskCtx=mask.getContext('2d'),pixels=maskCtx.createImageData(SIZE,SIZE);
 for(let i=0;i<total;i++)if(seen[i]){
  const at=i*4;pixels.data[at]=255;pixels.data[at+1]=255;pixels.data[at+2]=255;pixels.data[at+3]=255;
 }
 // Feather the partially transparent antialiasing pixels immediately next
 // to the interior, while keeping all exterior transparency fully excluded.
 for(let y=Math.max(1,top-2);y<Math.min(SIZE-1,bottom+3);y++){
  for(let x=Math.max(1,left-2);x<Math.min(SIZE-1,right+3);x++){
   const i=y*SIZE+x;
   if(seen[i])continue;
   if(seen[i-1]||seen[i+1]||seen[i-SIZE]||seen[i+SIZE]){
    const amount=rgba[i*4+3];
    if(amount>0&&amount<255){
     const at=i*4;pixels.data[at]=255;pixels.data[at+1]=255;pixels.data[at+2]=255;
     pixels.data[at+3]=Math.round((255-amount)*.7);
    }
   }
  }
 }
 maskCtx.putImageData(pixels,0,0);
 return {canvas:mask,bounds:{x:left,y:top,w:right-left+1,h:bottom-top+1}};
}

/**
 * Allow the image to slide all the way across (and even out of) the opening.
 * Fixed +/-180 offsets prevented off-centre faces from reaching the middle at
 * higher zoom. Bounds now grow with the rendered image on both axes.
 */
function imagePanLimits(img,zoom,ring,thickness,opening){
 if(!img)return {x:180,y:180};
 const weight=Number(thickness);
 const inset=ring==='none'?8:Math.max(8,9+weight);
 const bounds=ring==='custom'&&opening
  ?opening.bounds:{w:SIZE-2*inset,h:SIZE-2*inset};
 const fit=Math.max(bounds.w/img.width,bounds.h/img.height)*zoom;
 return {
  x:Math.max(180,Math.ceil((img.width*fit+bounds.w)/(2*PAN_FACTOR))),
  y:Math.max(180,Math.ceil((img.height*fit+bounds.h)/(2*PAN_FACTOR)))
 };
}

function paint(ctx,img,frame,opening,{zoom,shiftX,shiftY,ring,back,shape,border,thickness}){
 ctx.clearRect(0,0,SIZE,SIZE);
 const custom=ring==='custom'&&frame&&opening;
 const weight=Number(thickness);
 const inset=ring==='none'?8:Math.max(8,9+weight);
 const bounds=custom?opening.bounds:{x:inset,y:inset,w:SIZE-2*inset,h:SIZE-2*inset};
 const fit=Math.max(bounds.w/img.width,bounds.h/img.height)*zoom;
 const w=img.width*fit,h=img.height*fit;
 const cx=bounds.x+bounds.w/2,cy=bounds.y+bounds.h/2;

 if(custom){
  const offscreen=document.createElement('canvas');offscreen.width=SIZE;offscreen.height=SIZE;
  const layer=offscreen.getContext('2d');
  if(back!=='transparent'){
   layer.fillStyle=back;layer.fillRect(0,0,SIZE,SIZE);
  }
  layer.drawImage(img,cx-w/2+shiftX*PAN_FACTOR,cy-h/2+shiftY*PAN_FACTOR,w,h);
  layer.globalCompositeOperation='destination-in';
  layer.drawImage(opening.canvas,0,0);
  layer.globalCompositeOperation='source-over';
  ctx.drawImage(offscreen,0,0);
  ctx.drawImage(frame,0,0,SIZE,SIZE);
  return;
 }

 ctx.save();
 framePath(ctx,shape,inset);ctx.clip();
 if(back!=='transparent'){
  ctx.fillStyle=back;ctx.fillRect(0,0,SIZE,SIZE);
 }
 ctx.drawImage(img,cx-w/2+shiftX*PAN_FACTOR,cy-h/2+shiftY*PAN_FACTOR,w,h);
 ctx.restore();
 if(ring!=='none'&&weight>0){
  ctx.lineWidth=weight;ctx.strokeStyle=border;
  framePath(ctx,shape,9+weight/2);ctx.stroke();
  if(ring==='double'){
   ctx.lineWidth=Math.max(1,Math.min(5,weight*.22));
   ctx.strokeStyle='#edf1fa';framePath(ctx,shape,9+weight+6);ctx.stroke();
  }
 }
}

export default function TokenStudio({db,campaignId,userId,mode='players',onSave,onSaveBlobs,onClose}){
 const[file,setFile]=useState(null),[zoom,setZoom]=useState(1),[shiftX,setShiftX]=useState(0),[shiftY,setShiftY]=useState(0),
  [ring,setRing]=useState('single'),[back,setBack]=useState('#1b2030'),
  [transparentBack,setTransparentBack]=useState(false),[border,setBorder]=useState('#c29b55'),
  [thickness,setThickness]=useState(10),[shape,setShape]=useState('circle'),
  [frameFile,setFrameFile]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),
  [dragging,setDragging]=useState(false);
 const bmp=useRef(null),overlay=useRef(null),opening=useRef(null),cv=useRef(null),drag=useRef(null);
 const limits=imagePanLimits(bmp.current,zoom,ring,thickness,opening.current);
 useEffect(()=>()=>{bmp.current?.close();overlay.current?.close()},[]);
 useEffect(()=>{
  if(bmp.current&&cv.current){
   paint(cv.current.getContext('2d'),bmp.current,overlay.current,opening.current,
    {zoom,shiftX,shiftY,ring,back:transparentBack?'transparent':back,shape,border,thickness});
  }
 },[file,zoom,shiftX,shiftY,ring,back,transparentBack,shape,border,thickness,frameFile]);
 // A native non-passive wheel listener prevents browser/page zoom only while
 // the pointer is over the token preview. The image zooms toward that pointer.
 useEffect(()=>{
  const canvas=cv.current;
  if(!canvas)return;
  function wheel(e){
   if(!bmp.current||!e.deltaY)return;
   e.preventDefault();
   e.stopPropagation();
   const factor=e.deltaY<0?1.12:1/1.12;
   const nextZoom=clamp(zoom*factor,1,MAX_ZOOM);
   if(nextZoom===zoom)return;
   const ratio=nextZoom/zoom;
   const rect=canvas.getBoundingClientRect();
   const cursorX=(e.clientX-rect.left)*SIZE/rect.width;
   const cursorY=(e.clientY-rect.top)*SIZE/rect.height;
   const bounds=ring==='custom'&&opening.current?opening.current.bounds:null;
   const centerX=bounds?bounds.x+bounds.w/2:SIZE/2;
   const centerY=bounds?bounds.y+bounds.h/2:SIZE/2;
   const nextLimits=imagePanLimits(bmp.current,nextZoom,ring,thickness,opening.current);
   setShiftX(clamp(shiftX*ratio+(cursorX-centerX)*(1-ratio)/PAN_FACTOR,-nextLimits.x,nextLimits.x));
   setShiftY(clamp(shiftY*ratio+(cursorY-centerY)*(1-ratio)/PAN_FACTOR,-nextLimits.y,nextLimits.y));
   setZoom(nextZoom);
  }
  canvas.addEventListener('wheel',wheel,{passive:false});
  return()=>canvas.removeEventListener('wheel',wheel);
 },[zoom,shiftX,shiftY,ring,thickness,file,frameFile]);
 async function choose(e){
  const f=e.target.files?.[0];if(!f)return;
  try{
   if(f.size>MAX_ART_MB*1024*1024||!['image/webp','image/png','image/jpeg'].includes(f.type))
    throw Error('Use PNG, JPG or WebP under 10 MB');
   const image=await createImageBitmap(f);
   if(image.width>9000||image.height>9000){image.close();throw Error('Image dimensions are too large')}
   bmp.current?.close();bmp.current=image;setFile(f);setZoom(1);setShiftX(0);setShiftY(0);setError('');
  }catch(err){setError(err.message||String(err))}
 }
 async function selectFrame(e){
  const f=e.target.files?.[0];if(!f)return;
  try{
   if(f.size>5*1024*1024||!['image/png','image/webp'].includes(f.type))
    throw Error('Custom frames must be transparent PNG or WebP images below 5 MB');
   const image=await createImageBitmap(f);
   if(image.width>4096||image.height>4096){image.close();throw Error('Frame dimensions must be 4096px or less')}
   let detected;
   try{detected=detectFrameOpening(image)}
   catch(err){image.close();throw err}
   overlay.current?.close();overlay.current=image;opening.current=detected;
   setFrameFile(f.name);setRing('custom');setShiftX(0);setShiftY(0);setError('');
  }catch(err){setError(err.message||String(err))}
 }
 function beginDrag(e){
  if(!bmp.current||e.button!==0)return;
  e.preventDefault();cv.current.setPointerCapture(e.pointerId);
  drag.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,shiftX,shiftY};
  setDragging(true);
 }
 function moveDrag(e){
  const d=drag.current;
  if(!d||d.id!==e.pointerId)return;
  e.preventDefault();
  const pixels=SIZE/Math.max(1,cv.current.getBoundingClientRect().width);
  const max=imagePanLimits(bmp.current,zoom,ring,thickness,opening.current);
  setShiftX(clamp(d.shiftX+(e.clientX-d.startX)*pixels/PAN_FACTOR,-max.x,max.x));
  setShiftY(clamp(d.shiftY+(e.clientY-d.startY)*pixels/PAN_FACTOR,-max.y,max.y));
 }
 function endDrag(e){
  if(!drag.current||drag.current.id!==e.pointerId)return;
  drag.current=null;setDragging(false);
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 }
 async function save(){
  if(!bmp.current||!file)return;
  setSaving(true);setError('');
  try{
   const portrait=document.createElement('canvas'),img=bmp.current,scale=Math.min(1,1024/Math.max(img.width,img.height));
   portrait.width=Math.max(1,Math.round(img.width*scale));portrait.height=Math.max(1,Math.round(img.height*scale));
   portrait.getContext('2d').drawImage(img,0,0,portrait.width,portrait.height);
   const portraitBlob=await canvasBlob(portrait,.86),tokenBlob=await canvasBlob(cv.current,.94);
   if(onSaveBlobs){
    await onSaveBlobs({portraitBlob,tokenBlob});
    onClose();
    return;
   }
   const root=mode==='npcs'?campaignId+'/npcs/':campaignId+'/players/'+userId+'/';
   const id=crypto.randomUUID(),portraitPath=root+id+'-portrait.webp',tokenPath=root+id+'-token.webp';
   const storage=db.storage.from('tabletop-artwork');
   const first=await storage.upload(portraitPath,portraitBlob,{contentType:'image/webp',upsert:false});
   if(first.error)throw first.error;
   const second=await storage.upload(tokenPath,tokenBlob,{contentType:'image/webp',upsert:false});
   if(second.error)throw second.error;
   await onSave({portraitPath,tokenPath});
   onClose();
  }catch(err){setError(err?.message||String(err))}finally{setSaving(false)}
 }
 return <FloatingWindow kind="studio" onClose={onClose}>
  <section className="modal tokenstudio" role="dialog" aria-label="Create character token">
   <div className="heading"><h2>Portrait & token studio</h2><button className="secondary" onClick={onClose}>✕ Close</button></div>
   <p className="muted">Drag the portrait freely to centre the face, even at high zoom. Scroll over the preview to zoom toward the cursor. Transparent backgrounds are preserved in saved tokens.</p>
   <div className="studio-grid">
    <div className="studio-preview">
     <canvas ref={cv} width={SIZE} height={SIZE} aria-label="Drag the image to position it in the token frame"
      className={dragging?'dragging':''} onPointerDown={beginDrag} onPointerMove={moveDrag}
      onPointerUp={endDrag} onPointerCancel={endDrag}/>
     {!file&&<div className="studio-empty">Choose your character artwork to preview the token</div>}
    </div>
    <div className="studio-options">
     <label>Character artwork<input type="file" accept="image/png,image/jpeg,image/webp" onChange={choose}/></label>
     <label>Zoom — {zoom.toFixed(2)}× (or scroll over the preview)
      <input type="range" min="1" max={MAX_ZOOM} step=".05" value={zoom} onChange={e=>setZoom(+e.target.value)}/></label>
     <div className="tools"><button className="secondary" type="button" onClick={()=>{setShiftX(0);setShiftY(0)}}>Centre portrait</button>
      <span className="muted small">Click and drag the image to move it</span></div>
     <details className="studio-fine-adjust"><summary>Fine position adjustments</summary>
      <label>Horizontal<input type="range" min={-limits.x} max={limits.x} step="1"
       value={clamp(shiftX,-limits.x,limits.x)} onChange={e=>setShiftX(Number(e.target.value))}/></label>
      <label>Vertical<input type="range" min={-limits.y} max={limits.y} step="1"
       value={clamp(shiftY,-limits.y,limits.y)} onChange={e=>setShiftY(Number(e.target.value))}/></label>
     </details>
     <label>Frame style<select value={ring} onChange={e=>setRing(e.target.value)}>
      <option value="none">No ring</option><option value="single">Single ring</option>
      <option value="double">Double ring</option>
      {overlay.current&&<option value="custom">Uploaded decorative frame</option>}
     </select></label>
     {ring==='custom'?<p className="muted small">Using {frameFile}. The portrait is clipped to the exact transparent centre of your uploaded frame.</p>:<>
      {ring!=='none'&&<label>Ring thickness — {thickness}px
       <input type="range" min="1" max="42" step="1" value={thickness} onChange={e=>setThickness(Number(e.target.value))}/></label>}
      <label>Token shape<select value={shape} onChange={e=>setShape(e.target.value)}>
       <option value="circle">Circle</option><option value="square">Rounded square</option>
      </select></label>
      {ring!=='none'&&<div className="tools"><label>Ring colour<input type="color" value={border} onChange={e=>setBorder(e.target.value)}/></label></div>}
     </>}
     <label>Upload a decorative frame (transparent PNG/WebP)<input type="file" accept="image/png,image/webp" onChange={selectFrame}/></label>
     <label>Background fill
      <select value={transparentBack?'transparent':'solid'}
       onChange={e=>setTransparentBack(e.target.value==='transparent')}>
       <option value="solid">Solid colour</option>
       <option value="transparent">Transparent — no background</option>
      </select>
     </label>
     {!transparentBack&&<label>Background colour
      <input type="color" value={back} onChange={e=>setBack(e.target.value)}/>
     </label>}
     {transparentBack&&<p className="muted small">The checkerboard shows transparent areas. Saved WebP tokens keep their transparency; uploaded frame artwork itself remains unchanged.</p>}
    </div>
   </div>
   {error&&<div className="error alert">{error}</div>}
   <div className="actions"><button className="secondary" onClick={onClose}>Cancel</button>
    <button disabled={!file||saving} onClick={save}>{saving?'Uploading…':onSaveBlobs?'Save to my library & equip':'Save portrait and token'}</button></div>
  </section>
 </FloatingWindow>;
}