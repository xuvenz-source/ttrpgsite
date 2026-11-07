import React,{useEffect,useRef} from 'react';
import {lightRadii} from './MapEnvironment.js';

const kinds={wall:'Wall',door:'Door',window:'Window',light:'Light'};
const pxPoint=object=>object.type==='light'?{x:object.x,y:object.y}:
 {x:((object.points?.[0]?.x||0)+(object.points?.[1]?.x||0))/2,
  y:((object.points?.[0]?.y||0)+(object.points?.[1]?.y||0))/2};
function Toggle({label,checked,onChange}){
 return <label className="map-quick-toggle"><span>{label}</span>
  <input type="checkbox" checked={!!checked} onChange={e=>onChange(e.target.checked)}/></label>;
}
function Numeric({label,value,onChange,min=0,max=500,step=1}){
 return <label className="map-quick-number"><span>{label}</span>
  <input type="number" min={min} max={max} step={step} value={value??''}
   onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))}/></label>;
}
export default function MapObjectQuickAdjust({object,map,scale,onPatch,onClose,template}){
 const popover=useRef(null);
 useEffect(()=>{
  function onEscape(e){if(e.key==='Escape'){e.stopPropagation();onClose()}}
  document.addEventListener('keydown',onEscape);
  return()=>document.removeEventListener('keydown',onEscape);
 },[onClose]);
 if(!object||!map)return null;
 const position=pxPoint(object),cell=map.grid_size*scale;
 const left=Math.max(6,Math.min(map.width*scale-258,position.x*cell+20));
 const top=Math.max(6,Math.min(map.height*scale-385,position.y*cell+22));
 const update=(patch,immediate=true)=>onPatch(object.id,patch,{immediate});
 const fields=(template?.tabs||[]).flatMap(tab=>(tab.fields||[])
  .filter(f=>['number','attribute'].includes(f.type))
  .map(f=>({id:f.id,label:tab.name+' / '+f.label})));
 return <div ref={popover} className="map-object-quick-adjust"
  style={{left:Math.max(4,left),top:Math.max(4,top)}}
  role="dialog" aria-label={(kinds[object.type]||'Environment')+' quick adjust'}
  onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
  onMouseDown={e=>e.stopPropagation()}>
  <div className="map-quick-header">
   <span className="map-quick-type-icon" aria-hidden="true">
    {object.type==='door'?'▤':object.type==='window'?'▦':object.type==='light'?'☀':'╱'}
   </span>
   <strong>{kinds[object.type]||'Environment'}</strong>
   <button className="map-quick-close secondary" aria-label="Close quick adjust"
    type="button" onClick={onClose}>×</button>
  </div>
  <div className="map-quick-body">
   {(object.type==='door'||object.type==='window')&&<>
    {object.type==='window'&&<Toggle label="Curtains" checked={object.curtains}
      onChange={curtains=>update({curtains})}/>}
    <Toggle label={'Locked '+kinds[object.type]} checked={object.locked}
     onChange={locked=>update({locked})}/>
    <Toggle label="Opened" checked={object.state==='open'}
     onChange={opened=>update({state:opened?'open':'closed'})}/>
   </>}
   {object.type==='light'&&<>
    <Toggle label="Emitting light" checked={object.enabled!==false}
     onChange={enabled=>update({enabled})}/>
    <Numeric label="Bright light (ft)" value={object.bright}
     onChange={bright=>update({bright:bright??0},false)}/>
    <Numeric label="Additional dim (ft)" value={object.dim}
     onChange={dim=>update({dim:dim??0},false)}/>
    <small className="muted tiny">Reach: {lightRadii(object).outer} ft</small>
    <label className="map-quick-color"><span>Colour</span>
     <input type="color" value={object.color||'#ffce7a'}
      onChange={e=>update({color:e.target.value},false)}/></label>
    <Numeric label="Intensity (%)" value={object.intensity??100}
     min={0} max={100} onChange={intensity=>update({intensity:intensity??0},false)}/>
    <Numeric label="Elevation (ft)" value={object.elevation??0}
     min={-500} onChange={elevation=>update({elevation:elevation??0},false)}/>
    <label className="map-quick-select"><span>Light effect</span>
     <select value={object.effect||'steady'} onChange={e=>update({effect:e.target.value})}>
      <option value="steady">Steady</option><option value="flicker">Flicker</option>
      <option value="pulse">Pulse</option>
     </select></label>
   </>}
   {object.type!=='light'&&<details className="map-quick-advanced">
    <summary>Advanced settings</summary>
    <div className="map-quick-advanced-fields">
     <Toggle label="Blocks movement" checked={object.blocksMovement!==false}
      onChange={blocksMovement=>update({blocksMovement})}/>
     <Toggle label="Blocks light" checked={object.blocksLight!==false}
      onChange={blocksLight=>update({blocksLight})}/>
     <label className="map-quick-select"><span>Vision</span>
      <select value={object.vision||'block'} onChange={e=>update({vision:e.target.value})}>
       <option value="block">Blocks both sides</option>
       <option value="pass">Passes both sides</option>
       <option value="one-way">One-way</option>
      </select></label>
     {object.vision==='one-way'&&<label className="map-quick-select"><span>Visible side</span>
      <select value={object.oneWay||'a-to-b'} onChange={e=>update({oneWay:e.target.value})}>
       <option value="a-to-b">Side A → B</option><option value="b-to-a">Side B → A</option>
      </select></label>}
     <label className="map-quick-select"><span>Elevation field</span>
      <select value={object.attributeField||''} onChange={e=>update({attributeField:e.target.value})}>
       <option value="">None</option>
       {fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
      </select></label>
     {object.attributeField&&<>
      <Numeric label="Passable at (ft)" value={object.movementAt}
       onChange={movementAt=>update({movementAt},false)}/>
      <Numeric label="Visible at (ft)" value={object.visionAt}
       onChange={visionAt=>update({visionAt},false)}/>
     </>}
    </div>
   </details>}
  </div>
 </div>;
}
