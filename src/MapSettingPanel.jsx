import React from 'react';
import MapCalibration from './MapCalibration.jsx';
import {normalizeEnvironment,patchObject,removeObject,lightRadii} from './MapEnvironment.js';

const drawTools=[
 {id:'select',label:'Select / edit'},
 {id:'wall-line',label:'Connected line'},
 {id:'wall-pen',label:'Freehand pen'},
 {id:'door',label:'Place door'},
 {id:'window',label:'Place window'},
 {id:'light',label:'Place light'}
];
const presets=[['solid','Solid wall'],['glass','Transparent wall'],
 ['invisible','Invisible barrier'],['one-way','One-way vision'],
 ['elevation','Elevation wall']];
const fieldOptions=template=>(template?.tabs||[]).flatMap(t=>
 (t.fields||[]).filter(f=>['number','attribute'].includes(f.type))
 .map(f=>({id:f.id,label:t.name+' / '+f.label})));
function NumberOption({title,value,onChange,min=0,max=500,step=1}){
 return <label>{title}<input type="number" min={min} max={max} step={step}
  value={value??''} onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))}/></label>;
}
function Check({title,value,onChange}){
 return <label className="map-setting-check"><input type="checkbox" checked={!!value}
  onChange={e=>onChange(e.target.checked)}/>{title}</label>;
}
export default function MapSettingPanel({map,environment,editor,onEditorChange,
 onEnvironmentChange,onMapCalibrationPreview,onSaveMapCalibration,template,saveStatus}){
 const env=normalizeEnvironment(environment);
 const selected=env.objects.find(o=>o.id===editor.selectedId);
 const updateEditor=change=>onEditorChange({...editor,...change});
 const updateEnv=change=>onEnvironmentChange({...env,...change});
 const updateSelected=change=>selected&&onEnvironmentChange(patchObject(env,selected.id,change));
 const fields=fieldOptions(template);
 const activeLayer=editor.layer||'light';
 const locked=activeLayer==='background'?editor.lockBackground:editor.lockLight;
 const canDraw=editor.enabled&&activeLayer==='light'&&!editor.lockLight;
 return <div className="side-form map-setting-panel">
  <p className="muted tiny">All geometry is saved separately for this map. Layer outlines and drawing controls are DM-only.</p>
  <label>Active layer
   <select value={activeLayer} onChange={e=>updateEditor({layer:e.target.value,selectedId:null})}>
    <option value="background">Map / Background</option>
    <option value="light">Light Layer</option>
   </select>
  </label>
  <div className="map-setting-layer-actions">
   <button type="button" className="secondary" onClick={()=>updateEditor(activeLayer==='light'?
    {showLight:!editor.showLight}:{showBackground:!editor.showBackground})}
    aria-pressed={activeLayer==='light'?editor.showLight:editor.showBackground}>
    {(activeLayer==='light'?editor.showLight:editor.showBackground)?'◉ Visible':'◌ Hidden'}
   </button>
   <button type="button" className="secondary" onClick={()=>updateEditor(activeLayer==='light'?
    {lockLight:!editor.lockLight}:{lockBackground:!editor.lockBackground})}
    aria-pressed={locked}>{locked?'🔒 Locked':'🔓 Unlocked'}</button>
  </div>
  <p className="muted tiny">Visibility and locking only affect the DM editor, not gameplay or players.</p>
  {activeLayer==='background'?<>
   <h4>Map / Background</h4>
   <p className="muted tiny">Set image dimensions and grid alignment without touching environment objects.</p>
   {editor.lockBackground?<p className="muted small">Unlock this layer to edit background calibration.</p>:
    <MapCalibration key={map?.id||'no-map'} map={map}
      onPreview={onMapCalibrationPreview} onSave={onSaveMapCalibration}/>}
  </>:<>
   <div className="map-setting-layer-actions">
    <button type="button" disabled={!map||editor.lockLight}
     className={editor.enabled?'':'secondary'}
     onClick={()=>updateEditor({enabled:!editor.enabled,tool:editor.enabled?'select':editor.tool||'select'})}>
     {editor.enabled?'Exit map editing':'Edit Light Layer'}
    </button>
   </div>
   {editor.enabled&&editor.lockLight&&<p className="muted tiny">Unlock Light Layer to draw or edit.</p>}
   <label>Map tool
    <select disabled={!canDraw} value={editor.tool||'select'}
     onChange={e=>updateEditor({tool:e.target.value,selectedId:null})}>
     {drawTools.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
    </select>
   </label>
   <Check title="Snap wall endpoints to the grid" value={editor.snap!==false}
    onChange={snap=>updateEditor({snap})}/>
   {['wall-line','wall-pen'].includes(editor.tool)&&<>
    <label>New wall preset<select disabled={!canDraw} value={editor.preset||'solid'}
     onChange={e=>updateEditor({preset:e.target.value})}>
     {presets.map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label>
    <p className="muted tiny">{editor.tool==='wall-line'?
     'Left-click to place each connected point; right-click to finish the chain. Escape cancels.' :
     'Hold and drag to draw an irregular wall. Release to save the stroke.'}</p>
   </>}
   {editor.tool==='light'&&<>
    <strong>New light defaults</strong>
    <NumberOption title="Bright radius (feet)" value={editor.lightBright??20}
     onChange={v=>updateEditor({lightBright:v??0})}/>
    <NumberOption title="Additional dim radius (feet)" value={editor.lightDim??20}
     onChange={v=>updateEditor({lightDim:v??0})}/>
   </>}
   <div className="map-setting-divider"/>
   <h4>Selected object</h4>
   {!selected?<p className="muted tiny">Choose Select / edit, then click a wall, door, window, or light marker on the map to inspect its settings.</p>:<>
    <strong>{selected.type.charAt(0).toUpperCase()+selected.type.slice(1)}</strong>
    {selected.type==='light'?<>
     <Check title="Light enabled" value={selected.enabled!==false}
      onChange={v=>updateSelected({enabled:v})}/>
     <NumberOption title="Bright radius (feet)" value={selected.bright}
      onChange={v=>updateSelected({bright:v??0})}/>
     <NumberOption title="Additional dim radius (feet)" value={selected.dim}
      onChange={v=>updateSelected({dim:v??0})}/>
     <p className="muted tiny">Total illuminated distance: {lightRadii(selected).outer} ft</p>
     <label>Light color<input type="color" value={selected.color||'#ffce7a'}
      onChange={e=>updateSelected({color:e.target.value})}/></label>
     <NumberOption title="Brightness / intensity (%)" value={selected.intensity??100}
      min={0} max={100} onChange={v=>updateSelected({intensity:v??0})}/>
     <NumberOption title="Light elevation (feet)" value={selected.elevation||0}
      min={-500} onChange={v=>updateSelected({elevation:v??0})}/>
     <label>Animation<select value={selected.effect||'steady'}
      onChange={e=>updateSelected({effect:e.target.value})}>
      <option value="steady">Steady</option><option value="flicker">Flicker</option>
      <option value="pulse">Pulse</option>
     </select></label>
    </>:<>
     {selected.type!=='wall'&&<>
      <label>Prepared state<select value={selected.state||'closed'}
       onChange={e=>updateSelected({state:e.target.value})}>
       <option value="closed">Closed</option><option value="open">Open</option>
       <option value="broken">Broken</option>
      </select></label>
      <Check title="Locked" value={selected.locked} onChange={v=>updateSelected({locked:v})}/>
     </>}
     <Check title="Blocks movement" value={selected.blocksMovement!==false}
      onChange={v=>updateSelected({blocksMovement:v})}/>
     <label>Vision direction<select value={selected.vision||'block'}
      onChange={e=>updateSelected({vision:e.target.value})}>
      <option value="block">Blocked both ways</option>
      <option value="pass">Visible both ways</option>
      <option value="one-way">One-way vision</option>
     </select></label>
     {selected.vision==='one-way'&&<label>Visible direction
      <select value={selected.oneWay||'a-to-b'} onChange={e=>updateSelected({oneWay:e.target.value})}>
       <option value="a-to-b">Side A sees B</option>
       <option value="b-to-a">Side B sees A</option>
      </select></label>}
     <Check title="Blocks light" value={selected.blocksLight!==false}
      onChange={v=>updateSelected({blocksLight:v})}/>
     <NumberOption title="Physical height (feet)" value={selected.height??0}
      onChange={v=>updateSelected({height:v??0})}/>
     <label>Elevation attribute<select value={selected.attributeField||''}
      onChange={e=>updateSelected({attributeField:e.target.value})}>
      <option value="">No attribute condition</option>
      {fields.map(f=><option value={f.id} key={f.id}>{f.label}</option>)}
     </select></label>
     {selected.attributeField&&<>
      <NumberOption title="Passable at elevation (feet)" value={selected.movementAt}
       onChange={v=>updateSelected({movementAt:v})}/>
      <NumberOption title="Can see across at elevation (feet)" value={selected.visionAt}
       onChange={v=>updateSelected({visionAt:v})}/>
      <p className="muted tiny">Conditions are evaluated separately for each token against this sheet field.</p>
     </>}
    </>}
    <button type="button" className="secondary map-setting-danger"
     disabled={!canDraw} onClick={()=>{
      onEnvironmentChange(removeObject(env,selected.id));updateEditor({selectedId:null});
     }}>Delete selected object</button>
   </>}
   <div className="map-setting-divider"/>
   <h4>Map environment</h4>
   <NumberOption title="Ambient brightness (%)" min={0} max={100} value={env.ambient}
    onChange={v=>updateEnv({ambient:v??0})}/>
   <Check title="Automatic fog of war" value={env.fog.automatic}
    onChange={v=>updateEnv({fog:{...env.fog,automatic:v}})}/>
   <Check title="Party-shared exploration by default" value={env.fog.partyShared}
    onChange={v=>updateEnv({fog:{...env.fog,partyShared:v}})}/>
   <label>Weather effect<select value={env.effects.weather}
    onChange={e=>updateEnv({effects:{...env.effects,weather:e.target.value}})}>
    <option value="none">None</option><option value="rain">Rain</option>
    <option value="snow">Snow</option><option value="fog">Atmospheric fog</option>
   </select></label>
   <NumberOption title="Effect intensity (%)" min={0} max={100} value={env.effects.intensity}
    onChange={v=>updateEnv({effects:{...env.effects,intensity:v??0})}/>
   <p className="muted tiny">{env.objects.length} environment objects on this map.</p>
  </>}
  <p className="map-setting-save" role="status">{saveStatus||'Not loaded'}</p>
  <p className="muted tiny">Preparation tools only in this first staged implementation. Server-authoritative player collision, fog visibility and lighting are not active until their validation and rendering phases are completed.</p>
 </div>;
}
