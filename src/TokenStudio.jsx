import React,{useEffect,useRef,useState} from 'react';

const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const blobFromCanvas=(canvas,quality=.9)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not export artwork')),'image/webp',quality));
function paint(ctx,img,{zoom,shiftX,shiftY,ring,back,shape,border}){
 const S=400,c=S/2,r=186;ctx.clearRect(0,0,S,S);
 ctx.fillStyle=back;ctx.fillRect(0,0,S,S);
 ctx.save();ctx.beginPath();
 if(shape==='square'){ctx.roundRect(18,18,S-36,S-36,22)}else{ctx.arc(c,c,r,0,2*Math.PI)}
 ctx.clip();ctx.fillStyle='#181923';ctx.fillRect(0,0,S,S);
 const fit=Math.max((S-28)/img.width,(S-28)/img.height)*zoom;
 const w=img.width*fit,h=img.height*fit;
 ctx.drawImage(img,(S-w)/2+shiftX*1.5,(S-h)/2+shiftY*1.5,w,h);
 ctx.restore();ctx.strokeStyle=border;ctx.lineWidth=16;ctx.beginPath();
 if(shape==='square')ctx.roundRect(15,15,370,370,24);else ctx.arc(c,c,r,0,2*Math.PI);
 ctx.stroke();if(ring==='double'){ctx.strokeStyle='#e9e9ed';ctx.lineWidth=4;ctx.beginPath();if(shape==='square')ctx.roundRect(33,33,334,334,15);else ctx.arc(c,c,r-16,0,Math.PI*2);ctx.stroke();}
}
export default function TokenStudio({db,campaignId,userId,mode='players',onSave,onClose}){
 const [file,setFile]=useState(null),[zoom,setZoom]=useState(1),[shiftX,setShiftX]=useState(0),[shiftY,setShiftY]=useState(0),
 [ring,setRing]=useState('double'),[back,setBack]=useState('#1b2030'),[border,setBorder]=useState('#c29b55'),
 [shape,setShape]=useState('circle'),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const bmp=useRef(null),cv=useRef(null);
 useEffect(()=>()=>{bmp.current?.close()},[]);
 useEffect(()=>{if(bmp.current&&cv.current)paint(cv.current.getContext('2d'),bmp.current,{zoom,shiftX,shiftY,ring,back,shape,border})},[file,zoom,shiftX,shiftY,ring,back,shape,border]);
 async function choose(e){const f=e.target.files?.[0];if(!f)return;try{
  if(f.size>10*1024*1024||!['image/webp','image/png','image/jpeg'].includes(f.type))throw Error('Use PNG, JPG or WebP under 10 MB');
  const image=await createImageBitmap(f);if(image.width>9000||image.height>9000)throw Error('Image dimensions are too large');
  bmp.current?.close();bmp.current=image;setFile(f);setZoom(1);setShiftX(0);setShiftY(0);setError('');
 }catch(err){setError(err.message)}}
 async function save(){if(!bmp.current||!file)return;setSaving(true);setError('');try{
  const image=bmp.current;const portraitCanvas=document.createElement('canvas'),max=1024;
  const factor=Math.min(1,max/Math.max(image.width,image.height));
  portraitCanvas.width=Math.max(1,Math.round(image.width*factor));portraitCanvas.height=Math.max(1,Math.round(image.height*factor));
  portraitCanvas.getContext('2d').drawImage(image,0,0,portraitCanvas.width,portraitCanvas.height);
  const portraitBlob=await blobFromCanvas(portraitCanvas,.86);
  const tokenBlob=await blobFromCanvas(cv.current,.93);
  const root=mode==='npcs'?campaignId+'/npcs/':campaignId+'/players/'+userId+'/';
  const stamp=crypto.randomUUID();
  const portraitPath=root+stamp+'-portrait.webp',tokenPath=root+stamp+'-token.webp';
  const storage=db.storage.from('tabletop-artwork');
  const first=await storage.upload(portraitPath,portraitBlob,{contentType:'image/webp',upsert:false});if(first.error)throw first.error;
  const second=await storage.upload(tokenPath,tokenBlob,{contentType:'image/webp',upsert:false});if(second.error)throw second.error;
  await onSave({portraitPath,tokenPath});
  onClose();
 }catch(err){setError(err.message||String(err))}finally{setSaving(false)}}
 return <div className="modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
 <section className="modal tokenstudio" role="dialog" aria-modal="true" aria-label="Create character token">
 <div className="heading"><h2>Portrait & token studio</h2><button className="secondary" onClick={onClose}>✕ Close</button></div>
 <p className="muted">Upload an image, crop it into a token, choose a border, then save both the portrait and token to this campaign.</p>
 <div className="studio-grid">
  <div className="studio-preview"><canvas ref={cv} width={400} height={400} aria-label="Token preview"/>{!file&&<div className="studio-empty">Choose an image to preview your token</div>}</div>
  <div className="studio-options">
   <label>Character artwork<input type="file" accept="image/png,image/jpeg,image/webp" onChange={choose}/></label>
   <label>Zoom — {zoom.toFixed(2)}×<input type="range" min="1" max="3" step=".05" value={zoom} onChange={e=>setZoom(+e.target.value)}/></label>
   <label>Horizontal crop <input type="range" min="-100" max="100" value={shiftX} onChange={e=>setShiftX(+e.target.value)}/></label>
   <label>Vertical crop <input type="range" min="-100" max="100" value={shiftY} onChange={e=>setShiftY(+e.target.value)}/></label>
   <label>Frame style<select value={ring} onChange={e=>setRing(e.target.value)}><option value="double">Double ring</option><option value="single">Single ring</option></select></label>
   <label>Shape<select value={shape} onChange={e=>setShape(e.target.value)}><option value="circle">Round</option><option value="square">Rounded square</option></select></label>
   <div className="tools"><label>Frame colour<input type="color" value={border} onChange={e=>setBorder(e.target.value)}/></label><label>Background<input type="color" value={back} onChange={e=>setBack(e.target.value)}/></label></div>
  </div>
 </div>
 {error&&<div className="error alert">{error}</div>}
 <div className="actions"><button className="secondary" onClick={onClose}>Cancel</button><button disabled={!file||saving} onClick={save}>{saving?'Uploading…':'Save portrait and token'}</button></div>
 </section></div>;
}