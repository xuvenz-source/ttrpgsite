import React,{useEffect,useMemo,useState} from 'react';

const MIN_IMAGE=64,MAX_IMAGE=10000,MIN_GRID=5,MAX_GRID=1024;
const clamp=(number,min,max)=>Math.max(min,Math.min(max,number));
function sourceSize(map){
 return {
  width:Math.max(1,Number(map?.source_width)||Number(map?.width)||1),
  height:Math.max(1,Number(map?.source_height)||Number(map?.height)||1)
 };
}
function validNumber(value,min,max){
 const n=Number(value);
 return Number.isInteger(n)&&n>=min&&n<=max;
}
export default function MapCalibration({map,onPreview,onSave}){
 const [width,setWidth]=useState(''),[height,setHeight]=useState(''),[grid,setGrid]=useState('');
 const [locked,setLocked]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[success,setSuccess]=useState('');
 const original=useMemo(()=>sourceSize(map),[map?.id,map?.source_width,map?.source_height,map?.width,map?.height]);
 const valid=validNumber(width,MIN_IMAGE,MAX_IMAGE)&&validNumber(height,MIN_IMAGE,MAX_IMAGE)
  &&validNumber(grid,MIN_GRID,MAX_GRID);
 const changed=!!map&&(Number(width)!==Number(map.width)||Number(height)!==Number(map.height)
  ||Number(grid)!==Number(map.grid_size));

 useEffect(()=>()=>onPreview(null),[map?.id]);
 useEffect(()=>{
  if(!map){setWidth('');setHeight('');setGrid('');onPreview(null);return}
  setWidth(String(map.width));setHeight(String(map.height));setGrid(String(map.grid_size));
  setLocked(Math.abs(Number(map.width)/Number(map.height)-sourceSize(map).width/sourceSize(map).height)<0.01);
  setError('');setSuccess('');onPreview(null);
 },[map?.id,map?.width,map?.height,map?.grid_size]);

 // Keep the preview local. Other campaign members only receive applied settings.
 useEffect(()=>{
  if(!map||!valid||!changed){onPreview(null);return}
  onPreview({mapId:map.id,width:Number(width),height:Number(height),grid_size:Number(grid)});
 },[map?.id,width,height,grid,valid,changed]);

 function updateWidth(next){
  setWidth(next);setError('');setSuccess('');
  if(locked&&validNumber(next,MIN_IMAGE,MAX_IMAGE)){
   setHeight(String(clamp(Math.round(Number(next)*original.height/original.width),MIN_IMAGE,MAX_IMAGE)));
  }
 }
 function updateHeight(next){
  setHeight(next);setError('');setSuccess('');
  if(locked&&validNumber(next,MIN_IMAGE,MAX_IMAGE)){
   setWidth(String(clamp(Math.round(Number(next)*original.width/original.height),MIN_IMAGE,MAX_IMAGE)));
  }
 }
 function updateGrid(next){setGrid(next);setError('');setSuccess('')}
 function scaleTo(percent){
  const w=clamp(Math.round(original.width*percent/100),MIN_IMAGE,MAX_IMAGE);
  const h=clamp(Math.round(original.height*percent/100),MIN_IMAGE,MAX_IMAGE);
  setWidth(String(w));setHeight(String(h));setLocked(true);setSuccess('');setError('');
 }
 function reset(){
  if(!map)return;
  setWidth(String(map.width));setHeight(String(map.height));setGrid(String(map.grid_size));
  setError('');setSuccess('');onPreview(null);
 }
 async function save(e){
  e.preventDefault();if(!map||!valid||!changed||saving)return;
  setSaving(true);setError('');setSuccess('');
  try{
   await onSave(map,{width:Number(width),height:Number(height),grid_size:Number(grid)});
   onPreview(null);
   setSuccess('Map calibration saved for everyone.');
  }catch(e){setError(e?.message||String(e))}
  finally{setSaving(false)}
 }
 if(!map)return <p className="muted small">Select a map to configure its grid and dimensions.</p>;
 const sourceRatio=original.width/original.height;
 return <form className="map-calibration" onSubmit={save}>
  <div className="calibration-info">
   <strong>{map.name}</strong>
   <span className="muted tiny">Stored image: {original.width} × {original.height} px</span>
  </div>
  <p className="muted tiny">Adjust the displayed image and the grid independently. Changes preview locally until saved.</p>
  <label>Grid cell size (pixels)
   <input type="number" min={MIN_GRID} max={MAX_GRID} step="1" value={grid}
    onChange={e=>updateGrid(e.target.value)} required/>
  </label>
  <div className="calibration-fields">
   <label>Map width (px)
    <input type="number" min={MIN_IMAGE} max={MAX_IMAGE} step="1" value={width}
     onChange={e=>updateWidth(e.target.value)} required/>
   </label>
   <label>Map height (px)
    <input type="number" min={MIN_IMAGE} max={MAX_IMAGE} step="1" value={height}
     onChange={e=>updateHeight(e.target.value)} required/>
   </label>
  </div>
  <label className="calibration-lock">
   <input type="checkbox" checked={locked} onChange={e=>{
    const yes=e.target.checked;setLocked(yes);
    if(yes&&validNumber(width,MIN_IMAGE,MAX_IMAGE))
     setHeight(String(clamp(Math.round(Number(width)/sourceRatio),MIN_IMAGE,MAX_IMAGE)));
   }}/>
   <span>Lock original image proportions</span>
  </label>
  <div className="calibration-presets">
   <span className="muted tiny">Image size:</span>
   {[50,100,150,200].map(p=><button key={p} type="button" className="secondary" onClick={()=>scaleTo(p)}>{p}%</button>)}
  </div>
  {valid&&<p className="muted tiny">Approx. {(Number(width)/Number(grid)).toFixed(1)} × {(Number(height)/Number(grid)).toFixed(1)} grid cells. Browser map zoom is separate.</p>}
  {!valid&&<p className="error small">Use an image size of {MIN_IMAGE}–{MAX_IMAGE} px and grid cells of {MIN_GRID}–{MAX_GRID} px.</p>}
  {error&&<p className="error small" role="alert">{error}</p>}
  {success&&<p className="good small">{success}</p>}
  <div className="calibration-actions">
   <button type="button" className="secondary" onClick={()=>scaleTo(100)}>Original size</button>
   <button type="button" className="secondary" onClick={reset} disabled={!changed}>Discard</button>
   <button type="submit" disabled={!valid||!changed||saving}>{saving?'Saving…':'Apply to map'}</button>
  </div>
 </form>;
}