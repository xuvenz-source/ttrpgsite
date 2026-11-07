import React,{useState} from 'react';
import {TOOL_KINDS,DEFAULT_TOOL_CONFIG,normaliseToolConfig,toolCanControl} from './CampaignTools.js';

const preset=kind=>({
 name:{torch:'Torch',mount:'Pack Mule',inventory:'Party Supplies'}[kind],
 icon:TOOL_KINDS[kind].icon,kind,config:normaliseToolConfig(kind,DEFAULT_TOOL_CONFIG[kind])
});
function ToolConfigFields({draft,onChange}){
 const kind=draft.kind,config=normaliseToolConfig(kind,draft.config);
 const set=(field,value)=>onChange({...draft,config:{...config,[field]:value}});
 return <>
  <label>Name<input required maxLength={80} value={draft.name}
   onChange={e=>onChange({...draft,name:e.target.value})}/></label>
  <div className="campaign-tool-inline">
   <label>Icon<input maxLength={12} value={draft.icon}
    onChange={e=>onChange({...draft,icon:e.target.value})}/></label>
   <label>Type<select value={kind} onChange={e=>onChange({
    ...draft,...preset(e.target.value)})}>
    {Object.entries(TOOL_KINDS).map(([id,k])=><option key={id} value={id}>{k.label}</option>)}
   </select></label>
  </div>
  {kind==='torch'&&<>
   <div className="campaign-tool-inline">
    <label>Bright (ft)<input type="number" min="0" max="120" step="5" value={config.bright}
     onChange={e=>set('bright',e.target.value)}/></label>
    <label>Dim (ft)<input type="number" min="0" max="120" step="5" value={config.dim}
     onChange={e=>set('dim',e.target.value)}/></label>
   </div>
   <div className="campaign-tool-inline">
    <label>Light colour<input type="color" value={config.color}
     onChange={e=>set('color',e.target.value)}/></label>
    <label>Intensity (%)<input type="number" min="0" max="100" value={config.intensity}
     onChange={e=>set('intensity',e.target.value)}/></label>
   </div>
  </>}
  {(kind==='inventory'||kind==='mount')&&<>
   <div className="campaign-tool-inline">
    <label>Inventory<select value={config.inventoryMode} onChange={e=>set('inventoryMode',e.target.value)}>
     <option value="list">List</option><option value="grid">Grid</option>
    </select></label>
    {kind==='mount'&&<label>Token size (cells)<input type="number" min="1" max="4" value={config.span}
      onChange={e=>set('span',e.target.value)}/></label>}
   </div>
   {config.inventoryMode==='grid'&&<div className="campaign-tool-inline">
    <label>Columns<input type="number" min="2" max="20" value={config.columns}
     onChange={e=>set('columns',e.target.value)}/></label>
    <label>Rows<input type="number" min="2" max="20" value={config.rows}
     onChange={e=>set('rows',e.target.value)}/></label>
   </div>}
   {kind==='mount'&&<div className="campaign-tool-stats">
    <strong>Starting attributes</strong>
    {Object.entries(config.attributes||{}).map(([id,value])=><label key={id}>
     {id}
     <span className="campaign-tool-attribute-control">
      <input type="number" min="-10000" max="10000" value={value}
       onChange={e=>set('attributes',{...config.attributes,[id]:Number(e.target.value)})}/>
      <button type="button" className="secondary" title={'Remove '+id}
       aria-label={'Remove '+id} onClick={()=>set('attributes',
        Object.fromEntries(Object.entries(config.attributes).filter(([key])=>key!==id)))}>×</button>
     </span>
    </label>)}
    {Object.keys(config.attributes||{}).length<16&&<button type="button"
     className="secondary campaign-tool-add-attribute" onClick={()=>{
      const name=window.prompt('Attribute code (e.g. wisdom):')?.trim().toLowerCase();
      if(name&&/^[a-z][a-z0-9_]{0,31}$/.test(name)&&!(name in config.attributes))
       set('attributes',{...config.attributes,[name]:0});
     }}>+ Attribute</button>}
   </div>}
  </>}
 </>;
}
export default function CampaignToolsPanel({tools,members=[],accountNames=[],userId,isDM,
 mapId,onOpenTool,onError}){
 const [editing,setEditing]=useState(null),[issueFor,setIssueFor]=useState(null);
 const [draft,setDraft]=useState(preset('torch'));
 const [recipient,setRecipient]=useState('party');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const owners=members.filter(m=>m.role!=='dm');
 const owned=tools.issued.filter(t=>isDM||t.party_shared||t.owner_id===userId);
 const err=e=>{onError?.(e?.message||String(e))};
 async function run(fn){
  if(busy)return;
  setBusy(true);setNotice('');
  try{await fn();setEditing(null);setIssueFor(null)}catch(e){err(e)}
  finally{setBusy(false)}
 }
 function editTemplate(t){
  setIssueFor(null);setEditing(t||'new');
  setDraft(t?{name:t.name,icon:t.icon,kind:t.kind,config:t.config}:preset('torch'));
 }
 function issue(t){
  setEditing(null);setIssueFor(t);
  setDraft({name:t.name,icon:t.icon,kind:t.kind,config:t.config});
  setRecipient('party');
 }
 // If the DM withdraws an issuance while the sheet is open, the parent closes it.
 return <div className="campaign-tools-pane">
  {tools.error&&<p role="alert" className="error small">Tools unavailable: {tools.error}</p>}
  {isDM&&<section className="campaign-tool-section">
   <div className="campaign-tool-heading"><strong>Tool library</strong>
    <button className="secondary" type="button" onClick={()=>editTemplate(null)}>+ Tool</button>
   </div>
   {tools.templates.length===0&&<p className="muted tiny">Create a light, mount or shared inventory.</p>}
   {tools.templates.map(t=><div className="campaign-tool-row" key={t.id}>
    <span className="campaign-tool-icon">{t.icon}</span>
    <span className="campaign-tool-name">{t.name}<small>{TOOL_KINDS[t.kind]?.label}</small></span>
    <button type="button" className="secondary" onClick={()=>issue(t)}>Issue</button>
    <button type="button" className="secondary" onClick={()=>editTemplate(t)} aria-label={'Edit '+t.name}>✎</button>
   </div>)}
   {editing&&<form className="side-form campaign-tool-editor" onSubmit={e=>{
    e.preventDefault();void run(async()=>{
     if(!draft.name.trim())throw Error('Enter a tool name.');
     if(editing==='new')await tools.createTemplate(draft);
     else await tools.updateTemplate(editing,draft);
    });
   }}>
    <strong>{editing==='new'?'New tool':'Edit template'}</strong>
    <ToolConfigFields draft={draft} onChange={setDraft}/>
    <div className="campaign-tool-actions">
     <button type="submit" disabled={busy||!draft.name.trim()}>Save template</button>
     <button type="button" className="secondary" onClick={()=>setEditing(null)}>Cancel</button>
     {editing!=='new'&&<button type="button" className="secondary" disabled={busy}
      onClick={()=>{if(window.confirm('Remove template? Issued copies will remain.'))
       void run(()=>tools.deleteTemplate(editing))}}>Delete</button>}
    </div>
   </form>}
   {issueFor&&<form className="side-form campaign-tool-editor" onSubmit={e=>{
    e.preventDefault();void run(async()=>{
     if(!draft.name.trim())throw Error('Enter a tool name.');
     const partyShared=recipient==='party';
     if(!partyShared&&!owners.some(member=>member.user_id===recipient))
      throw Error('Choose a campaign player.');
     await tools.issueTool({...draft,templateId:issueFor.id,partyShared,
      ownerId:partyShared?null:recipient});
     setNotice('Tool issued.');
    });
   }}>
    <strong>Issue {issueFor.name}</strong>
    <label>Recipient<select value={recipient} onChange={e=>setRecipient(e.target.value)}>
     <option value="party">Entire party</option>
     {owners.map(m=><option key={m.user_id} value={m.user_id}>
      {accountNames.find(a=>a.user_id===m.user_id)?.account_name||'Player '+m.user_id.slice(0,6)}
     </option>)}
    </select></label>
    <ToolConfigFields draft={draft} onChange={setDraft}/>
    <div className="campaign-tool-actions">
     <button type="submit" disabled={busy||!draft.name.trim()}>Issue tool</button>
     <button type="button" className="secondary" onClick={()=>setIssueFor(null)}>Cancel</button>
    </div>
   </form>}
  </section>}
  <section className="campaign-tool-section">
   <div className="campaign-tool-heading"><strong>Issued tools</strong>
    {tools.loading&&<small className="muted">Syncing</small>}</div>
   {owned.length===0&&<p className="muted tiny">No tools issued yet.</p>}
   {owned.map(item=><div className="campaign-tool-row" key={item.id}>
    <span className="campaign-tool-icon" aria-hidden="true">{item.icon}</span>
    <span className="campaign-tool-name">
     {item.name}
     <small>{item.party_shared?'Party':
      accountNames.find(a=>a.user_id===item.owner_id)?.account_name||
      (item.owner_id===userId?'You':'Assigned player')}
      {item.map_id?' · On map':''}</small>
    </span>
    <button type="button" className="secondary" onClick={()=>onOpenTool(item.id)}>Open</button>
    {mapId&&toolCanControl(item,userId,isDM)&&<button
     type="button" className="secondary campaign-tool-drag" draggable
     aria-label={'Drag '+item.name+' onto map'}
     onDragStart={e=>{
      e.dataTransfer.setData('application/x-forge-tool',item.id);
      e.dataTransfer.effectAllowed='move';
     }} title="Drag onto map">⠿</button>}
    {item.map_id&&toolCanControl(item,userId,isDM)&&<button type="button"
     className="secondary" disabled={busy} title="Pick up from map"
     aria-label={'Pick up '+item.name} onClick={()=>void run(()=>tools.pickUp(item))}>↩</button>}
    {isDM&&<button type="button" className="secondary" disabled={busy}
     title="Withdraw issued tool" aria-label={'Withdraw '+item.name}
     onClick={()=>{if(window.confirm('Withdraw '+item.name+'?'))
      void run(()=>tools.removeIssued(item))}}>×</button>}
   </div>)}
  </section>
  {notice&&<p className="good tiny" role="status">{notice}</p>}
 </div>;
}
