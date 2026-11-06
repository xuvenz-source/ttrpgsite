import React,{useEffect,useMemo,useState} from 'react';

export const MAX_ACTIVE_EFFECTS=18;
export const MAX_CUSTOM_EFFECTS=24;
export const STATUS_CATEGORIES=[
 {id:'conditions',label:'Conditions'},
 {id:'buffs',label:'Buffs'},
 {id:'debuffs',label:'Debuffs'},
 {id:'resistances',label:'Resistances'},
 {id:'custom',label:'Custom'}
];
export const STATUS_ICONS=['eye-off','heart','ear-off','hourglass','ghost','chain','zap','moon','stone','flask','footprints','lock','sparkles','shield','shield-check','music','flame','snowflake','droplets','wind','skull','swords','target','swirl','paw','hand','star','feather','circle-slash','cloud','clock'];
const COLORS={conditions:'#ed6c79',buffs:'#68cfa9',debuffs:'#c69add',resistances:'#75b5ee',custom:'#e9bb73'};

const item=(id,name,category,icon,options={})=>({
 id,name,category,icon,color:COLORS[category],stackable:false,...options
});
export const STATUS_PRESETS=[
 item('blinded','Blinded','conditions','eye-off'),
 item('charmed','Charmed','conditions','heart'),
 item('deafened','Deafened','conditions','ear-off'),
 item('exhaustion','Exhaustion','conditions','hourglass',{stackable:true,maxLevel:6}),
 item('frightened','Frightened','conditions','ghost'),
 item('grappled','Grappled','conditions','chain'),
 item('incapacitated','Incapacitated','conditions','circle-slash'),
 item('invisible','Invisible','conditions','eye-off'),
 item('paralyzed','Paralyzed','conditions','zap'),
 item('petrified','Petrified','conditions','stone'),
 item('poisoned','Poisoned','conditions','flask'),
 item('prone','Prone','conditions','footprints'),
 item('restrained','Restrained','conditions','lock'),
 item('stunned','Stunned','conditions','swirl'),
 item('unconscious','Unconscious','conditions','moon'),
 item('bardic_inspiration','Bardic Inspiration','buffs','music',{stackable:true,maxLevel:9}),
 item('bless','Bless','buffs','sparkles'),
 item('guidance','Guidance','buffs','star'),
 item('haste','Haste','buffs','wind'),
 item('heroism','Heroism','buffs','heart'),
 item('rage','Rage','buffs','swords'),
 item('shield_of_faith','Shield of Faith','buffs','shield-check'),
 item('sanctuary','Sanctuary','buffs','shield'),
 item('aid','Aid','buffs','heart'),
 item('inspiration','Inspiration','buffs','star'),
 item('concentration','Concentrating','buffs','swirl'),
 item('flying','Flying','buffs','feather'),
 item('bane','Bane','debuffs','cloud'),
 item('hex','Hex','debuffs','swirl'),
 item('slow','Slow','debuffs','hourglass'),
 item('hunters_mark',"Hunter's Mark",'debuffs','target'),
 ...[
  ['acid','flask'],['bludgeoning','shield'],['cold','snowflake'],
  ['fire','flame'],['force','star'],['lightning','zap'],
  ['necrotic','skull'],['piercing','target'],['poison','flask'],
  ['psychic','swirl'],['radiant','sparkles'],['slashing','swords'],
  ['thunder','cloud']
 ].map(([type,icon])=>item('resist_'+type,type.charAt(0).toUpperCase()+type.slice(1)+' Resistance',
   'resistances',icon))
];
const STATUS_ID=/^[a-z][a-z0-9_]{1,39}$/;
const HEX=/^#[0-9a-f]{6}$/i;

export function normalizedCatalog(raw){
 if(!Array.isArray(raw))return [];
 const seen=new Set();
 return raw.filter(e=>{
  if(!e||typeof e!=='object'||typeof e.id!=='string'||!/^custom_[0-9a-f]{12}$/.test(e.id)
    ||seen.has(e.id)||typeof e.name!=='string'||!e.name.trim()||e.name.length>36)return false;
  seen.add(e.id);return true;
 }).slice(0,MAX_CUSTOM_EFFECTS).map(e=>({
  id:e.id,name:e.name.slice(0,36),
  category:e.category==='debuffs'?'debuffs':'buffs',
  icon:STATUS_ICONS.includes(e.icon)?e.icon:'star',
  color:HEX.test(e.color||'')?e.color:'#e9bb73',
  stackable:e.stackable===true,archived:e.archived===true
 }));
}
export function normalizedEffects(raw){
 if(!Array.isArray(raw))return [];
 const seen=new Set();
 return raw.filter(e=>{
  if(!e||typeof e!=='object'||!STATUS_ID.test(e.id||'')||seen.has(e.id))return false;
  seen.add(e.id);return true;
 }).slice(0,MAX_ACTIVE_EFFECTS).map(e=>{
  const level=Number(e.level);
  return {id:e.id,level:Number.isInteger(level)?Math.max(1,Math.min(e.id==='exhaustion'?6:9,level)):1};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
export function allStatusDefinitions(catalog){
 return [...STATUS_PRESETS,...normalizedCatalog(catalog)];
}
export function statusDefinition(id,catalog){
 return allStatusDefinitions(catalog).find(x=>x.id===id)||{
  id,name:id.replace(/_/g,' '),category:'custom',icon:'circle-slash',color:'#8c97ac',archived:true
 };
}
export function statusTitle(effect,catalog){
 const definition=statusDefinition(effect.id,catalog);
 const n=effect.id==='exhaustion'?'Level '+effect.level:
  definition.stackable&&effect.level>1?'×'+effect.level:'';
 return definition.name+(n?' · '+n:'')+
  (effect.id==='exhaustion'&&effect.level===6?' · Level 6 causes death':'');
}
const iconNodes={
 'eye-off':<><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.5 5.5A10 10 0 0 1 12 5c5 0 9.1 4.4 10 7a12.6 12.6 0 0 1-4 5.3M6 6.8A13 13 0 0 0 2 12c1 3 5 7 10 7 1.3 0 2.5-.2 3.6-.7"/></>,
 heart:<path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 6l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.3a5.5 5.5 0 0 0 0-7.8Z"/>,
 'ear-off':<><path d="M4 4 20 20M8 6.2A7 7 0 0 1 19 12c0 3-3.4 4.1-4.4 6.7A3.1 3.1 0 0 1 9 19"/><path d="M4.5 11.5A8 8 0 0 1 5 9"/></>,
 hourglass:<><path d="M6 2h12M6 22h12M7 3v4c0 3 5 5 5 5s5-2 5-5V3M7 21v-4c0-3 5-5 5-5s5 2 5 5v4"/><path d="m9 19 3-3 3 3"/></>,
 ghost:<><path d="M4 20V10a8 8 0 0 1 16 0v10l-4-2-4 2-4-2-4 2Z"/><path d="M9 11h.01M15 11h.01"/></>,
 chain:<><path d="m10 13 4-4M9 8l-1 1a4 4 0 0 0 5.7 5.7l1-1M15 16l1-1a4 4 0 0 0-5.7-5.7l-1 1"/></>,
 zap:<path d="m13 2-9 12h7l-1 8 10-12h-7V2Z"/>,
 moon:<path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
 stone:<><path d="m7 3 10-1 5 8-3 10-10 2-7-7 1-8Z"/><path d="m7 3 4 8-2 11M11 11l11-1M11 11l8 9"/></>,
 flask:<><path d="M9 3h6M10 3v7l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8"/><path d="M11 18h.01M15 19h.01"/></>,
 footprints:<><path d="M10 5c-.5 2-3.5 3.5-3 6.5.4 2.3 2.3 2.7 4 1.5 1.5-1.1 1.5-3.2 1-4.7C11.6 6.6 11.3 5 10 5Z"/><path d="M16 13c-2 0-3.3 2-3.4 4.3 0 2 1.2 3.5 3 3.5 2.2 0 3.4-2 3.4-4S17.8 13 16 13ZM6 3h.01M5 5h.01M14 10h.01"/></>,
 lock:<><rect x="5" y="11" width="14" height="11" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v3"/></>,
 sparkles:<><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/><path d="M19 2v4M17 4h4"/></>,
 shield:<path d="m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6l9-4Z"/>,
 'shield-check':<><path d="m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6l9-4Z"/><path d="m8 12 3 3 5-6"/></>,
 music:<><path d="M8 18V5l12-2v13M8 7l12-2"/><ellipse cx="5.5" cy="18.5" rx="3.5" ry="2.5"/><ellipse cx="16.5" cy="16.5" rx="3.5" ry="2.5"/></>,
 flame:<path d="M12 22c5 0 8-4 8-8 0-3-1.5-5.7-4-8 .1 3.5-2 4-3 4-1-4-1.5-5-4-8-.5 4-5 7-5 12 0 4 3 8 8 8Z"/>,
 snowflake:<><path d="M12 2v20M4 7l16 10M4 17 20 7M9 5l3-3 3 3M9 19l3 3 3-3M5 10 4 7l3-1M19 14l1 3-3 1"/></>,
 droplets:<><path d="M12 2C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-12Z"/><path d="M9 15c.5 2 1.5 3 3 3"/></>,
 wind:<><path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h8a3 3 0 1 1-3 3"/></>,
 skull:<><path d="M5 15a8 8 0 1 1 14 0l-2 2v4H7v-4l-2-2Z"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M11 18h2"/></>,
 swords:<><path d="M3 3l18 18M20 3 3 20M3 8l5-5M16 3l5 5M6 15l3 3M15 6l3 3"/></>,
 target:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></>,
 swirl:<><path d="M21 12a9 9 0 1 0-9 9c4 0 7-3 7-7 0-3-2-5-5-5-2 0-4 1.6-4 4 0 1.5 1 2.5 2.5 2.5 1 0 1.5-.5 1.5-1.5"/></>,
 paw:<><circle cx="7" cy="7" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="17" cy="7" r="1"/><path d="M12 11c-2 0-2.5 1.7-4.6 3C5 15 5 19 8 20c2 1 6-1 8 0 3 0 3-5 .6-6-2.1-1.3-2.6-3-4.6-3Z"/></>,
 hand:<><path d="M6 13V7a2 2 0 0 1 4 0v4-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v7a2 2 0 0 1 3 2v3c0 3-3 5-6 5h-3l-8-8a2 2 0 0 1 2-3l3 2"/></>,
 star:<path d="m12 2 3.1 6.5 7 1-5 4.9 1.2 7-6.3-3.4L5.7 21l1.2-7L2 9.5l7-1L12 2Z"/>,
 feather:<><path d="M21 3c-9-2-15 4-17 17l5-5c7 0 13-6 12-12Z"/><path d="M4 20c4-6 9-9 14-12"/></>,
 'circle-slash':<><circle cx="12" cy="12" r="10"/><path d="m5 5 14 14"/></>,
 cloud:<path d="M7 18a5 5 0 0 1-1-9.9 7 7 0 0 1 13 2.5A4 4 0 0 1 18 18H7Z"/>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>
};
export function StatusGlyph({name,size=17}){
 return <svg className="status-glyph" width={size} height={size} viewBox="0 0 24 24"
  aria-hidden="true" focusable="false" fill="none" stroke="currentColor"
  strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
  {iconNodes[name]||iconNodes.star}
 </svg>;
}

export function TokenStatusBadges({effects,catalog,onOpen,canEdit=false}){
 const list=normalizedEffects(effects);
 if(!list.length)return null;
 const shown=list.slice(0,4),hidden=list.length-shown.length;
 return <div className="token-status-strip" aria-label="Token status effects"
  onPointerDown={e=>e.stopPropagation()}>
  {shown.map(effect=>{
   const def=statusDefinition(effect.id,catalog);
   const description=statusTitle(effect,catalog);
   return <button type="button" key={effect.id} className="token-status-pill"
     style={{'--status-color':def.color}}
     title={description+(canEdit?' · Click to edit':' · Click to view')}
     aria-label={description}
     onClick={e=>{e.preventDefault();e.stopPropagation();onOpen()}}>
     <StatusGlyph name={def.icon} size={15}/>
     {(effect.id==='exhaustion'||effect.level>1)&&<span className="status-level">{effect.level}</span>}
    </button>;
  })}
  {hidden>0&&<button type="button" className="token-status-overflow"
   title={list.slice(4).map(e=>statusTitle(e,catalog)).join(', ')}
   aria-label={hidden+' additional effects'} onClick={e=>{e.preventDefault();e.stopPropagation();onOpen()}}>
   +{hidden}
  </button>}
 </div>;
}

export function TokenStatusPicker({token,catalog,canEdit,onClose,onApply}){
 const definitions=useMemo(()=>allStatusDefinitions(catalog),[catalog]);
 const [draft,setDraft]=useState(()=>normalizedEffects(token.status_effects));
 const [search,setSearch]=useState('');
 const [category,setCategory]=useState('all');
 const [error,setError]=useState('');
 useEffect(()=>{setDraft(normalizedEffects(token.status_effects));setSearch('');setError('')},[token.id]);
 const original=normalizedEffects(token.status_effects);
 const activeMap=new Map(draft.map(e=>[e.id,e]));
 const changed=JSON.stringify(draft)!==JSON.stringify(original);
 function setEffect(id,level){
  setError('');
  setDraft(prev=>normalizedEffects(level===0?prev.filter(s=>s.id!==id):
   [...prev.filter(s=>s.id!==id),{id,level}]));
 }
 const searched=definitions.filter(def=>{
  if(def.archived&&!activeMap.has(def.id))return false;
  if(category!=='all'&&category!=='custom'&&def.category!==category)return false;
  if(category==='custom'&&!def.id.startsWith('custom_'))return false;
  return !search||def.name.toLowerCase().includes(search.toLowerCase());
 });
 function apply(){
  if(!canEdit||!changed)return;
  try{
   const result=onApply(token,draft);
   if(result!==false)onClose();
  }catch(e){setError(e?.message||String(e))}
 }
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="modal token-status-modal" role="dialog" aria-modal="true"
   aria-label={'Statuses for '+token.name}>
   <div className="heading">
    <div><h2>{token.name} · Status Effects</h2>
     <p className="muted small">{canEdit?'Select conditions and buffs, then apply.':'View the effects currently applied to this token.'}</p>
    </div>
    <button type="button" className="secondary" onClick={onClose}>✕</button>
   </div>
   {draft.length>0&&<div className="status-active-list">
    <h3>Active effects <span className="muted tiny">({draft.length}/{MAX_ACTIVE_EFFECTS})</span></h3>
    <div className="status-active-tags">{draft.map(effect=>{
     const def=statusDefinition(effect.id,catalog);
     return <span key={effect.id} className="status-active-tag" title={statusTitle(effect,catalog)}
      style={{'--status-color':def.color}}>
      <StatusGlyph name={def.icon} size={15}/>
      <span>{def.name}</span>
      {(effect.id==='exhaustion'||effect.level>1)&&<strong>{effect.level}</strong>}
      {canEdit&&<button type="button" aria-label={'Remove '+def.name}
       onClick={()=>setEffect(effect.id,0)}>×</button>}
     </span>;
    })}</div>
   </div>}
   <div className="status-search-row">
    <input type="search" autoFocus value={search} onChange={e=>setSearch(e.target.value)}
      placeholder="Search conditions, buffs, resistances…" aria-label="Search status effects"/>
    <span className="muted tiny">{searched.length} results</span>
   </div>
   <div className="status-filter-tabs" role="group" aria-label="Effect categories">
    {[{id:'all',label:'All'},...STATUS_CATEGORIES].map(c=>
     <button type="button" key={c.id} className={'secondary'+(category===c.id?' active':'')}
      onClick={()=>setCategory(c.id)}>{c.label}</button>)}
   </div>
   <div className="status-options" role="group" aria-label="Available effects">
    {!searched.length&&<p className="muted small">No matching effects.</p>}
    {searched.map(def=>{
     const active=activeMap.get(def.id),max=def.id==='exhaustion'?6:
      def.stackable?9:1;
     return <div key={def.id} className={'status-option'+(active?' selected':'')}>
      <span className="status-option-icon" style={{'--status-color':def.color}}><StatusGlyph name={def.icon} size={20}/></span>
      <div className="status-option-info">
       <strong>{def.name}</strong>
       <span>{def.id==='exhaustion'?'Levels 1–6; level 6 causes death':def.category==='resistances'?
        'Damage resistance':def.category==='conditions'?'Condition':def.id.startsWith('custom_')?'Custom effect':def.category==='buffs'?'Beneficial effect':'Harmful effect'}</span>
      </div>
      {canEdit&&<div className="status-option-actions">
       {active&&max>1&&<>
        <button type="button" className="secondary" aria-label={'Decrease '+def.name}
         onClick={()=>setEffect(def.id,active.level===1?0:active.level-1)}>−</button>
        <span className="status-option-count" aria-label={'Level '+active.level}>{active.level}</span>
        <button type="button" className="secondary" aria-label={'Increase '+def.name}
         disabled={active.level>=max} onClick={()=>setEffect(def.id,Math.min(max,active.level+1))}>+</button>
       </>}
       <button type="button" className={active?'secondary selected-toggle':'secondary'}
        onClick={()=>setEffect(def.id,active?0:1)}
        disabled={!active&&draft.length>=MAX_ACTIVE_EFFECTS}
        aria-label={(active?'Remove ':'Apply ')+def.name}>{active?'✓':'Add'}</button>
      </div>}
      {!canEdit&&active&&<span className="status-option-count">{active.level>1?active.level:'Active'}</span>}
     </div>;
    })}
   </div>
   <p className="muted tiny">These markers are visual trackers. They don't automatically enforce D&D rules, expire spells, or modify rolls.</p>
   {error&&<p className="error small" role="alert">{error}</p>}
   <div className="actions">
    <button type="button" className="secondary" onClick={onClose}>{canEdit?'Cancel':'Close'}</button>
    {canEdit&&<button type="button" onClick={apply} disabled={!changed}>Apply effects</button>}
   </div>
  </section>
 </div>;
}

export function StatusCatalogEditor({catalog,onSave}){
 const entries=normalizedCatalog(catalog);
 const [name,setName]=useState(''),[category,setCategory]=useState('buffs');
 const [icon,setIcon]=useState('star'),[color,setColor]=useState('#e9bb73');
 const [stackable,setStackable]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 function upsert(next){
  setError('');setNotice('');setBusy(true);
  Promise.resolve(onSave(next)).then(()=>setNotice('Custom status library saved.'))
   .catch(e=>setError(e?.message||String(e))).finally(()=>setBusy(false));
 }
 function add(){
  if(name.trim().length<2||name.trim().length>36){setError('Use a name between 2 and 36 characters.');return}
  if(entries.length>=MAX_CUSTOM_EFFECTS){setError('Maximum of 24 custom effects per campaign.');return}
  if(entries.some(e=>e.name.toLowerCase()===name.trim().toLowerCase())){
   setError('A custom effect with that name already exists.');return;
  }
  const id='custom_'+crypto.randomUUID().replace(/-/g,'').slice(0,12);
  upsert([...entries,{id,name:name.trim(),category,icon,color,stackable,archived:false}]);
  setName('');
 }
 function archive(entry){
  upsert(entries.map(e=>e.id===entry.id?{...e,archived:!e.archived}:e));
 }
 return <div className="status-catalog-editor">
  <p className="muted small">Make additional class, spell, or homebrew effects available to your whole campaign. Built-in D&D conditions and damage resistances are always included.</p>
  <div className="status-custom-form">
   <label>Effect name<input maxLength={36} value={name} onChange={e=>setName(e.target.value)}
    placeholder="e.g. Bladesong"/></label>
   <label>Effect type<select value={category} onChange={e=>setCategory(e.target.value)}>
    <option value="buffs">Beneficial</option><option value="debuffs">Harmful</option>
   </select></label>
   <label>Symbol<select value={icon} onChange={e=>setIcon(e.target.value)}>
    {STATUS_ICONS.map(name=><option key={name} value={name}>{name.replace(/-/g,' ')}</option>)}
   </select></label>
   <label>Colour<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>
   <label className="status-custom-stack"><input type="checkbox" checked={stackable}
    onChange={e=>setStackable(e.target.checked)}/>Allow levels / charges (1–9)</label>
   <button type="button" disabled={busy||entries.length>=MAX_CUSTOM_EFFECTS} onClick={add}>+ Add custom effect</button>
  </div>
  {entries.length>0&&<div className="status-custom-items">
   {entries.map(e=><div className="status-custom-item" key={e.id}>
    <span className="status-option-icon" style={{'--status-color':e.color}}><StatusGlyph name={e.icon} size={18}/></span>
    <span className="status-custom-name">{e.name}{e.stackable?' · Stackable':''}{e.archived?' · Archived':''}</span>
    <button type="button" className="secondary" disabled={busy} onClick={()=>archive(e)}>
     {e.archived?'Restore':'Archive'}
    </button>
   </div>)}
  </div>}
  <p className="muted tiny">Archiving hides an effect from new selections but preserves markers already applied to tokens.</p>
  {error&&<p className="error small" role="alert">{error}</p>}
  {notice&&<p className="good small" role="status">{notice}</p>}
 </div>;
}
