import React,{useMemo} from 'react';
import MapCalibration from './MapCalibration.jsx';
import {normalizeEnvironment,patchObject,removeObject,lightRadii} from './MapEnvironment.js';
import {PIN_ICONS} from './CampaignHandouts.js';

const drawTools=[
 {id:'select',label:'Select / edit'},
 {id:'wall-line',label:'Connected line'},
 {id:'wall-pen',label:'Freehand pen'},
 {id:'door',label:'Place door'},
 {id:'window',label:'Place window'},
 {id:'light',label:'Place light'},
 {id:'pin',label:'Place handout pin'}
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
 onEnvironmentChange,onMapCalibrationPreview,onSaveMapCalibration,template,saveStatus,tokens=[],handouts=[]}){
 const env=useMemo(()=>normalizeEnvironment(environment),[environment]);
 const selected=env.objects.find(o=>o.id===editor.selectedId);
 const updateEditor=change=>onEditorChange({...editor,...change});
 const updateEnv=change=>onEnvironmentChange({...env,...change});
 const updateSelected=change=>selected&&onEnvironmentChange(patchObject(env,selected.id,change));
 const fields=fieldOptions(template);
 const previewTokens=tokens.filter(t=>t.visible!==false);
 const previewTokenId=editor.previewTokenId||previewTokens[0]?.id||'';
 const activeLayer=editor.layer||'light';
 const locked=activeLayer==='background'?editor.lockBackground:editor.lockLight;
 const canDraw=editor.enabled&&activeLayer==='light'&&!editor.lockLight;
 return <div className="side-form map-setting-panel">
  <div className="map-setting-preview-controls">
   <strong>Player perspective</strong>
   <label>View from token<select aria-label="Preview token" disabled={editor.previewing||!previewTokens.length}
    value={previewTokenId} onChange={e=>updateEditor({previewTokenId:e.target.value})}>
    {previewTokens.length===0&&<option value="">Place a visible token first</option>}
    {previewTokens.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
   </select></label>
   <button className={editor.previewing?'':'secondary'} disabled={!previewTokens.length}
    type="button" onClick={()=>updateEditor({previewing:!editor.previewing,
     previewTokenId,enabled:false,selectedId:null})}>
    {editor.previewing?'Exit player preview':'Preview as player'}</button>
  </div>
  {!editor.previewing&&<>
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
  {activeLayer==='background'?<>
   <h4>Map / Background</h4>
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
   {['wall-line','wall-pen'].includes(editor.tool)&&<>
    <label>New wall preset<select disabled={!canDraw} value={editor.preset||'solid'}
     onChange={e=>updateEditor({preset:e.target.value})}>
     {presets.map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label>
   </>}
   {editor.tool==='pin'&&<><label>Handout
    <select disabled={!canDraw||!handouts.length} value={editor.pinHandoutId||''}
     onChange={e=>updateEditor({pinHandoutId:e.target.value})}>
     <option value="">Select handout</option>
     {handouts.map(h=><option value={h.id} key={h.id}>{h.title}</option>)}
    </select>
   </label>
   <label>Pin appearance<select disabled={!canDraw} value={editor.pinKind||'pin'}
    onChange={e=>updateEditor({pinKind:e.target.value})}>
    {Object.entries(PIN_ICONS).map(([id,icon])=><option key={id} value={id}>
     {icon} {id.charAt(0).toUpperCase()+id.slice(1)}</option>)}
   </select></label></>}
   {editor.tool==='light'&&<>
    <strong>New light defaults</strong>
    <NumberOption title="Bright radius (feet)" value={editor.lightBright??20}
     onChange={v=>updateEditor({lightBright:v??0})}/>
    <NumberOption title="Additional dim radius (feet)" value={editor.lightDim??20}
     onChange={v=>updateEditor({lightDim:v??0})}/>
   </>}
   <div className="map-setting-divider"/>
   {selected&&<h4>Selected object</h4>}
   {!selected?null:<>
    <strong>{selected.type.charAt(0).toUpperCase()+selected.type.slice(1)}</strong>
    {selected.type==='light'?<>
     <Check title="Light enabled" value={selected.enabled!==false}
      onChange={v=>updateSelected({enabled:v})}/>
     <NumberOption title="Bright radius (feet)" value={selected.bright}
      onChange={v=>updateSelected({bright:v??0})}/>
     <NumberOption title="Additional dim radius (feet)" value={selected.dim}
      onChange={v=>updateSelected({dim:v??0})}/>
     <small className="muted tiny">Reach: {lightRadii(selected).outer} ft</small>
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
      {selected.type==='window'&&<Check title="Curtains closed" value={selected.curtains}
       onChange={v=>updateSelected({curtains:v})}/>}
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
    onChange={v=>updateEnv({effects:{...env.effects,intensity:v??0}})}/>
  </>}
  </>}
  <p className="map-setting-save" role="status">{saveStatus||'Not loaded'}</p>
 </div>;
}
