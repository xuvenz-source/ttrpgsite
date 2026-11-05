import React,{useEffect,useMemo,useState} from 'react';
import {DEFAULT_TOKEN_DISPLAY,normalizeConfig,ICONS,POSITIONS,TokenMonitors} from './TokenMonitors.jsx';

const TYPES=[['bar','Horizontal bar'],['globe','Numbered globe']];
const ID=()=>crypto.randomUUID().slice(0,8);
const copy=x=>JSON.parse(JSON.stringify(x));
const keyRx=/^[a-zA-Z0-9_-]{1,64}$/;
export default function TokenDisplayDesigner({campaign,template,onSave}){
 const [config,setConfig]=useState(()=>copy(normalizeConfig(campaign?.token_display_config)));
 const [saving,setSaving]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 useEffect(()=>{setConfig(copy(normalizeConfig(campaign?.token_display_config)));setStatus('');setError('')},[campaign?.id,campaign?.token_display_config]);
 const fields=useMemo(()=>Array.from(new Map((template?.tabs||[]).flatMap(t=>t.fields||[])
   .filter(f=>f.type==='number').map(f=>[f.id,{id:f.id,label:f.label||f.id}])).values()),[template]);
 const original=normalizeConfig(campaign?.token_display_config);
 const changed=JSON.stringify(config)!==JSON.stringify(original);
 const valid=config.widgets.length<=8&&config.widgets.every(w=>keyRx.test(w.field||'')&&
   (w.type==='globe'||!w.maxField||keyRx.test(w.maxField))&&
   /^#[0-9a-f]{6}$/i.test(w.color||'')&&(w.label||'').length<=24&&
   Object.keys(POSITIONS).includes(w.position));
 function widgetChange(id,patch){
  setStatus('');setConfig(c=>({...c,widgets:c.widgets.map(w=>w.id===id?{...w,...patch}:w)}));
 }
 function addWidget(type){
  if(config.widgets.length>=8)return;
  const id=ID();const field=fields.find(f=>/^(hp|health|ac)$/i.test(f.id))?.id||fields[0]?.id||'hp';
  setConfig(c=>({...c,widgets:[...c.widgets,{id,type,label:type==='bar'?'Resource':'Status',
   field,maxField:type==='bar'?'hp_max':'',icon:type==='bar'?'heart':'shield',
   color:type==='bar'?'#d9505b':'#368cdb',position:type==='bar'?'top':'bottom-right',showValue:true}]}));
 }
 function moveWidget(i,delta){setConfig(c=>{const widgets=[...c.widgets],to=i+delta;if(to<0||to>=widgets.length)return c;
  [widgets[i],widgets[to]]=[widgets[to],widgets[i]];return {...c,widgets}})}
 async function save(){
  if(!valid||!changed||saving)return;
  setSaving(true);setError('');setStatus('');
  try{await onSave(config);setStatus('Token display updated for this campaign.')}
  catch(e){setError(e?.message||String(e))}finally{setSaving(false)}
 }
 return <div className="token-designer">
  <div className="side-heading"><h2>Token Display Designer</h2></div>
  <p className="muted small">Configure the bars and globes for every token in this campaign. Resources bind to numeric fields on the character sheet. NPC values come from each placed NPC's sheet.</p>
  <div className="token-visibility-controls">
   <label>Player monitors visible to
    <select value={config.playerVisibility} onChange={e=>setConfig(c=>({...c,playerVisibility:e.target.value}))}>
     <option value="owner">Only the owner and DM</option>
     <option value="everyone">Every campaign player</option>
    </select>
   </label>
   <label>NPC monitors visible to
    <select value={config.npcVisibility} onChange={e=>setConfig(c=>({...c,npcVisibility:e.target.value}))}>
     <option value="dm">Only the DM (default)</option>
     <option value="everyone">Every campaign player</option>
    </select>
   </label>
   <p className="muted tiny">An individual NPC can override the NPC default using its “Show monitors to everyone” checkbox.</p>
  </div>
  <div className="token-preview-shell">
   <span className="muted tiny">Preview</span>
   <div className="monitor-demo-token">
    <span className="monitor-demo-face">⚔</span>
    <TokenMonitors config={config} preview/>
   </div>
  </div>
  <div className="monitor-widget-title">
   <strong>Display elements ({config.widgets.length}/8)</strong>
   <div className="tools">
    <button type="button" className="secondary" disabled={config.widgets.length>=8} onClick={()=>addWidget('bar')}>+ Bar</button>
    <button type="button" className="secondary" disabled={config.widgets.length>=8} onClick={()=>addWidget('globe')}>+ Globe</button>
   </div>
  </div>
  {config.widgets.length===0&&<p className="muted small">No monitors configured. Add a bar or globe above.</p>}
  {config.widgets.map((w,i)=><section className="monitor-widget-editor" key={w.id}>
   <div className="monitor-widget-header">
    <strong>{w.label||'Unnamed monitor'}</strong>
    <div className="tools">
     <button className="secondary" type="button" disabled={i===0} aria-label="Move monitor up" onClick={()=>moveWidget(i,-1)}>↑</button>
     <button className="secondary" type="button" disabled={i===config.widgets.length-1} aria-label="Move monitor down" onClick={()=>moveWidget(i,1)}>↓</button>
     <button className="secondary" type="button" onClick={()=>setConfig(c=>({...c,widgets:c.widgets.filter(x=>x.id!==w.id)}))}>×</button>
    </div>
   </div>
   <div className="monitor-widget-fields">
    <label>Display type<select value={w.type} onChange={e=>widgetChange(w.id,{type:e.target.value})}>
      {TYPES.map(([v,label])=><option key={v} value={v}>{label}</option>)}
     </select></label>
    <label>Label<input maxLength={24} value={w.label||''} onChange={e=>widgetChange(w.id,{label:e.target.value})}/></label>
    <label>Sheet field
     <input list={'monitor-fields-'+w.id} value={w.field||''} placeholder="hp, ac, elevation"
      onChange={e=>widgetChange(w.id,{field:e.target.value.trim()})}/>
     <datalist id={'monitor-fields-'+w.id}>{fields.map(f=><option value={f.id} key={f.id}>{f.label}</option>)}</datalist>
    </label>
    {w.type==='bar'&&<label>Maximum field (optional)
     <input list={'monitor-fields-'+w.id} value={w.maxField||''} placeholder="hp_max"
      onChange={e=>widgetChange(w.id,{maxField:e.target.value.trim()})}/>
    </label>}
    <label>Position<select value={w.position||'top'} onChange={e=>widgetChange(w.id,{position:e.target.value})}>
      {Object.entries(POSITIONS).map(([v,label])=><option value={v} key={v}>{label}</option>)}
     </select></label>
    <label>Colour<input type="color" value={w.color||'#df444d'} onChange={e=>widgetChange(w.id,{color:e.target.value})}/></label>
    {w.type==='globe'&&<label>Icon<select value={w.icon||'none'} onChange={e=>widgetChange(w.id,{icon:e.target.value})}>
      {Object.entries(ICONS).map(([v,icon])=><option key={v} value={v}>{icon} {v}</option>)}
     </select></label>}
    {w.type==='bar'&&<label className="monitor-checkbox">
      <input type="checkbox" checked={w.showValue!==false} onChange={e=>widgetChange(w.id,{showValue:e.target.checked})}/>Show numeric values
     </label>}
   </div>
  </section>)}
  {!valid&&<p className="error small">Each monitor needs a valid field name, position and colour.</p>}
  {error&&<p className="error small">{error}</p>}
  {status&&<p className="good small">{status}</p>}
  <div className="calibration-actions">
   <button type="button" className="secondary" disabled={!changed} onClick={()=>setConfig(copy(original))}>Discard changes</button>
   <button type="button" disabled={!valid||!changed||saving} onClick={save}>{saving?'Saving…':'Save token display'}</button>
  </div>
 </div>;
}