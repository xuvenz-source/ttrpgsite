import React,{useEffect,useRef,useState} from 'react';

const MAX_ART_MB=10;
const canvasBlob=(canvas,quality=.92)=>new Promise((resolve,reject)=>{
 canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not export artwork')),'image/webp',quality);
});
function framePath(ctx,shape,inset){
 ctx.beginPath();
 if(shape==='square')ctx.roundRect(inset,inset,400-2*inset,400-2*inset,Math.max(3,26-inset/3));
 else ctx.arc(200,200,200-inset,0,Math.PI*2);
}
function paint(ctx,img,overlay,{zoom,shiftX,shiftY,ring,back,shape,border,thickness,portraitRadius}){
 const size=400,outer=191,weight=Number(thickness);
 ctx.clearRect(0,0,size,size); // transparent outside the token; no rectangular background
 let clipInset;
 if(ring==='custom'&&overlay)clipInset=200-Number(portraitRadius);
 else clipInset=ring==='none'?8:Math.max(8,9+weight);
 ctx.save();
 framePath(ctx,shape,clipInset);
 ctx.clip();
 ctx.fillStyle=back;ctx.fillRect(0,0,size,size);
 const diameter=400-clipInset*2;
 const fit=Math.max(diameter/img.width,diameter/img.height)*zoom;
 const w=img.width*fit,h=img.height*fit;
 ctx.drawImage(img,(size-w)/2+shiftX*1.5,(size-h)/2+shiftY*1.5,w,h);
 ctx.restore();
 if(ring==='custom'&&overlay){
  ctx.drawImage(overlay,0,0,400,400);
 }else if(ring!=='none'&&weight>0){
  ctx.lineWidth=weight;ctx.strokeStyle=border;
  framePath(ctx,shape,9+weight/2);ctx.stroke();
  if(ring==='double'){
   ctx.lineWidth=Math.max(1,Math.min(5,weight*.22));
   ctx.strokeStyle='#edf1fa';
   framePath(ctx,shape,9+weight+6);ctx.stroke();
  }
 }
}
export default function TokenStudio({db,campaignId,userId,mode='players',onSave,onClose}){
 const [file,setFile]=useState(null),[zoom,setZoom]=useState(1),[shiftX,setShiftX]=useState(0),[shiftY,setShiftY]=useState(0),
  [ring,setRing]=useState('single'),[back,setBack]=useState('#1b2030'),[border,setBorder]=useState('#c29b55'),
  [thickness,setThickness]=useState(10),[shape,setShape]=useState('circle'),
  [frameFile,setFrameFile]=useState(''),[portraitRadius,setPortraitRadius]=useState(156),
  [saving,setSaving]=useState(false),[error,setError]=useState('');
 const bmp=useRef(null),overlay=useRef(null),cv=useRef(null);
 useEffect(()=>()=>{bmp.current?.close();overlay.current?.close()},[]);
 useEffect(()=>{
  if(bmp.current&&cv.current)paint(cv.current.getContext('2d'),bmp.current,overlay.current,
   {zoom,shiftX,shiftY,ring,back,shape,border,thickness,portraitRadius});
 },[file,zoom,shiftX,shiftY,ring,back,shape,border,thickness,frameFile,portraitRadius]);
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
    throw Error('Custom frames must be a transparent PNG or WebP below 5 MB');
   const image=await createImageBitmap(f);
   if(image.width>4096||image.height>4096){image.close();throw Error('Frame dimensions must be 4096px or less')}
   const sample=document.createElement('canvas');sample.width=1;sample.height=1;
   sample.getContext('2d').drawImage(image,0,0,1,1);
   const a=sample.getContext('2d').getImageData(0,0,1,1).data[3];
   // Most overlay art has transparent regions; if opaque, the preview still shows what will be exported.
   overlay.current?.close();overlay.current=image;setFrameFile(f.name);setRing('custom');setError('');
  }catch(err){setError(err.message||String(err))}
 }
 async function save(){
  if(!bmp.current||!file)return;
  setSaving(true);setError('');
  try{
   const portrait=document.createElement('canvas'),img=bmp.current,scale=Math.min(1,1024/Math.max(img.width,img.height));
   portrait.width=Math.max(1,Math.round(img.width*scale));portrait.height=Math.max(1,Math.round(img.height*scale));
   portrait.getContext('2d').drawImage(img,0,0,portrait.width,portrait.height);
   const portraitBlob=await canvasBlob(portrait,.86),tokenBlob=await canvasBlob(cv.current,.94);
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
 return <div className="modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="modal tokenstudio" role="dialog" aria-modal="true" aria-label="Create character token">
   <div className="heading"><h2>Portrait & token studio</h2><button className="secondary" onClick={onClose}>✕ Close</button></div>
   <p className="muted">The token image contains its own chosen frame. No extra border is added on the battlemap.</p>
   <div className="studio-grid">
    <div className="studio-preview">
     <canvas ref={cv} width={400} height={400} aria-label="Token preview"/>
     {!file&&<div className="studio-empty">Choose your character artwork to preview the token</div>}
    </div>
    <div className="studio-options">
     <label>Character artwork<input type="file" accept="image/png,image/jpeg,image/webp" onChange={choose}/></label>
     <label>Zoom — {zoom.toFixed(2)}×
      <input type="range" min="1" max="3" step=".05" value={zoom} onChange={e=>setZoom(+e.target.value)}/></label>
     <label>Horizontal crop<input type="range" min="-100" max="100" value={shiftX} onChange={e=>setShiftX(+e.target.value)}/></label>
     <label>Vertical crop<input type="range" min="-100" max="100" value={shiftY} onChange={e=>setShiftY(+e.target.value)}/></label>
     <label>Frame style<select value={ring} onChange={e=>setRing(e.target.value)}>
      <option value="none">No ring</option><option value="single">Single ring</option>
      <option value="double">Double ring</option>
      {overlay.current&&<option value="custom">Uploaded decorative frame</option>}
     </select></label>
     {ring==='custom'?<>
      <p className="muted small">{frameFile} — the original PNG/WebP is composited on top of your character portrait.</p>
      <label>Portrait area (custom frame) — {portraitRadius}px
       <input type="range" min="115" max="190" step="1" value={portraitRadius} onChange={e=>setPortraitRadius(Number(e.target.value))}/></label>
     </>:<>
      {ring!=='none'&&<label>Ring thickness — {thickness}px
       <input type="range" min="1" max="42" step="1" value={thickness} onChange={e=>setThickness(Number(e.target.value))}/></label>}
      <label>Token shape<select value={shape} onChange={e=>setShape(e.target.value)}>
       <option value="circle">Circle</option><option value="square">Rounded square</option>
      </select></label>
      {ring!=='none'&&<div className="tools"><label>Ring colour<input type="color" value={border} onChange={e=>setBorder(e.target.value)}/></label></div>}
     </>}
     <label>Upload a decorative frame (transparent PNG/WebP)<input type="file" accept="image/png,image/webp" onChange={selectFrame}/></label>
     <label>Background colour<input type="color" value={back} onChange={e=>setBack(e.target.value)}/></label>
    </div>
   </div>
   {error&&<div className="error alert">{error}</div>}
   <div className="actions"><button className="secondary" onClick={onClose}>Cancel</button>
    <button disabled={!file||saving} onClick={save}>{saving?'Uploading…':'Save portrait and token'}</button></div>
  </section>
 </div>;
}