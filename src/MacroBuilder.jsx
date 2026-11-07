import React,{useMemo,useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';
import MacroChatCard from './MacroChatCard.jsx';
import {numericFieldsWithDerived} from './SheetDerived.js';
import {supportsMacroCritical} from './MacroCritical.js';

const uid=()=>crypto.randomUUID();
const MAX_ROWS=12,MAX_CELLS=3;
const roll=(label='Roll',formula='1d20',critOn=null)=>({id:uid(),kind:'roll',label,formula,...(critOn==null?{}:{critOn})});
const text=(label='Note',value='vs AC')=>({id:uid(),kind:'text',label,text:value});
const row=(label='Attack',cells=[roll('Normal','1d20+3')])=>({id:uid(),label,cells});
const attackCell=()=>({id:uid(),kind:'attack',label:'Attack',formula:'1d20+4',
 mode:'normal',critOn:20,damage:'1d8+2',critDamage:'1d8'});
const attackMacro=()=>({id:uid(),name:'New attack',subtitle:'Attack + damage',
 source_type:'none',source_id:null,rows:[row('Attack',[attackCell()])]});
const blankMacro=()=>({
 id:uid(),name:'New macro',subtitle:'',
 source_type:'none',source_id:null,
 rows:[row('Attack'),row('Damage',[roll('Force','1d8+2')])]
});
const swipeExample=()=>({
 ...blankMacro(),name:'Bobby',subtitle:'Swipe',
 rows:[
  row('Attack',[roll('Normal','1d20+@{wisdom_mod}',19),roll('Advantage','1d20+@{wisdom_mod}',19),text('vs','AC')]),
  row('Damage',[roll('Force','1d8+2+@{wisdom_mod}'),roll('Critical','1d8')]),
  row('Graze',[roll('Wisdom','@{wisdom_mod}')]),
  row('Charge 20ft',[roll('Extra','1d6'),roll('Crit','1d6')])
 ]
});
export function previewMacro(macro){
 return {body:macro.name,result:{
  version:1,title:macro.name,subtitle:macro.subtitle,
  rows:macro.rows.flatMap(r=>{
   if(r.cells.length===1&&r.cells[0].kind==='attack'){
    const a=r.cells[0],dual=a.mode!=='normal';
    return [{id:r.id+'_hit',label:r.label,cells:[
     {id:a.id+'_1',kind:'roll',label:dual?'Roll 1':'To hit',critOn:a.critOn},
     ...(dual?[{id:a.id+'_2',kind:'roll',label:'Roll 2',critOn:a.critOn}]:[])]},
     {id:r.id+'_damage',label:'Damage',cells:[
      {id:a.id+'_damage',kind:'roll',label:'Damage'},
      ...(a.critDamage?[{id:a.id+'_crit',kind:'roll',label:'Extra on crit'}]:[])]}];
   }
   return {id:r.id,label:r.label,cells:r.cells.map(c=>({...c}))};
  })
 }};
}
export function MacroManager({
 macros=[],characters=[],npcs=[],tokens=[],template,user,isDM=false,
 onSave,onDelete,onRun,onAssign,onClose
}){
 const [draft,setDraft]=useState(()=>structuredClone(macros[0]||blankMacro()));
 const [baseline,setBaseline]=useState(()=>macros[0]?JSON.stringify(macros[0]):null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [chosenId,setChosenId]=useState(()=>macros[0]?.id||'new');
 const dirty=baseline===null||JSON.stringify(draft)!==baseline;
 const editingSaved=macros.some(m=>m.id===chosenId);
 const attrs=useMemo(()=>numericFieldsWithDerived(template),[template]);
 const sourceOptions=[
  {value:'none',label:'No sheet attributes (dice only)'},
  ...characters.filter(ch=>isDM||ch.user_id===user).map(ch=>({
   value:'character:'+ch.id,label:'Character: '+ch.name
  })),
  ...(isDM?[
   ...npcs.map(n=>({value:'npc_template:'+n.id,label:'Bestiary NPC: '+n.name})),
   ...tokens.filter(t=>!t.character_id).map(t=>({
    value:'npc_token:'+t.id,label:'Map NPC: '+t.name
   }))
  ]:[])
 ];
 const sourceValue=draft.source_type==='none'?'none':draft.source_type+':'+draft.source_id;
 function openMacro(macro){
  setChosenId(macro.id);setDraft(structuredClone(macro));
  setBaseline(JSON.stringify(macro));setMessage('');setError('');
 }
 function startNew(kind='custom'){
  setChosenId('new');setDraft(kind==='attack'?attackMacro():kind==='example'?swipeExample():blankMacro());
  setBaseline(null);setMessage('');setError('');
 }
 function update(patch){setDraft(old=>({...old,...patch}));setMessage('');setError('')}
 function updateRow(id,patch){
  setDraft(old=>({...old,rows:old.rows.map(r=>r.id===id?{...r,...patch}:r)}));
  setMessage('');setError('');
 }
 function updateCell(rowId,cellId,patch){
  setDraft(old=>({...old,rows:old.rows.map(r=>r.id===rowId?
   {...r,cells:r.cells.map(c=>c.id===cellId?{...c,...patch}:c)}:r)}));
  setMessage('');setError('');
 }
 function removeRow(id){update({rows:draft.rows.filter(r=>r.id!==id)})}
 function moveRow(index,delta){
  const target=index+delta;
  if(target<0||target>=draft.rows.length)return;
  const next=[...draft.rows];
  [next[index],next[target]]=[next[target],next[index]];
  update({rows:next});
 }
 function addRow(){
  if(draft.rows.length>=MAX_ROWS)return;
  update({rows:[...draft.rows,row('New row',[roll('Roll','1d20')])]});
 }
 function addCell(r,kind){
  if(r.cells.length>=MAX_CELLS||r.cells.some(c=>c.kind==='attack'))return;
  updateRow(r.id,{cells:[...r.cells,kind==='roll'?roll('Roll','1d20'):text('Note','')]});
 }
 function addAttackRow(){
  if(draft.rows.length>=MAX_ROWS)return;
  update({rows:[...draft.rows,row('Attack',[attackCell()])]});
 }
 function changeSource(value){
  if(value==='none')return update({source_type:'none',source_id:null});
  const idx=value.indexOf(':');
  update({source_type:value.slice(0,idx),source_id:value.slice(idx+1)});
 }
 async function persist(){
  if(!draft.name.trim())throw Error('Give the macro a name.');
  if(draft.rows.length===0)throw Error('Add at least one row.');
  if(!draft.rows.some(r=>r.cells.some(c=>c.kind==='roll'||c.kind==='attack')))
   throw Error('Add at least one dice, numeric, or linked attack roll.');
  if(draft.rows.some(r=>!r.label.trim()||r.cells.length===0))
   throw Error('Each row needs a label and at least one cell.');
  if(draft.rows.some(r=>r.cells.some(c=>c.kind==='roll'&&c.critOn!=null&&
     !supportsMacroCritical(c.formula))))
   throw Error('Critical tracking needs exactly one positive 1d20 in that roll formula, e.g. 1d20+4. Use separate rolls for advantage.');
  if(draft.rows.some(r=>r.cells.some(c=>c.kind==='attack')&&r.cells.length!==1))
   throw Error('A linked Attack must be the only result in its row.');
  if(draft.rows.some(r=>r.cells.some(c=>c.kind==='attack'&&
   (!supportsMacroCritical(c.formula)||!['normal','advantage','disadvantage'].includes(c.mode)||
    !Number.isInteger(c.critOn)||c.critOn<1||c.critOn>20||
    !String(c.damage||'').trim()))))
   throw Error('Attack needs one natural d20, a roll mode, damage and a critical threshold.');
  const estimated=draft.rows.flatMap(r=>r.cells).reduce((count,c)=>
   count+(c.kind==='roll'?1:c.kind==='attack'?(c.mode==='normal'?3:4):0),0);
  if(estimated>18)throw Error('A macro can use up to 18 server dice rolls.');
  const saved=await onSave({
   ...draft,name:draft.name.trim(),subtitle:draft.subtitle.trim(),
   rows:draft.rows.map(r=>({...r,label:r.label.trim(),
    cells:r.cells.map(c=>({...c,label:c.label.trim()}))}))
  });
  setDraft(structuredClone(saved));setBaseline(JSON.stringify(saved));
  setChosenId(saved.id);setMessage('Macro saved.');
  return saved;
 }
 async function action(kind){
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   if(kind==='delete'){
    if(!editingSaved)return;
    if(!confirm('Delete this macro? Hotbar buttons pointing to it will stop working.'))return;
    await onDelete(draft.id);
    startNew();setMessage('Macro deleted.');return;
   }
   const saved=dirty?await persist():draft;
   if(kind==='run'){await onRun(saved.id);setMessage('Macro rolled and posted to chat.')}
   if(kind==='hotbar'){
    const index=await onAssign(saved);
    setMessage('Added to hotbar slot '+(index+1)+'. You can also drag a saved macro onto any slot.');
   }
  }catch(e){setError(e?.message||String(e))}
  finally{setBusy(false)}
 }
 function close(){
  if(dirty&&!confirm('Discard unsaved macro changes?'))return;
  onClose();
 }
 function dragMacro(e,m){
  e.dataTransfer.setData('application/x-forge-macro',JSON.stringify({
   id:m.id,label:m.name
  }));
  e.dataTransfer.effectAllowed='copy';
 }
 return <FloatingWindow kind="macro" onClose={close}>
  <section className="panel macro-manager" aria-label="Macro builder">
   <div className="heading macro-manager-heading">
    <div><h2>Macro Builder</h2></div>
    <button type="button" className="secondary" onClick={close} aria-label="Close macro builder">✕</button>
   </div>
   <div className="macro-manager-body">
    <aside className="macro-manager-library">
     <strong>My macros <span className="muted tiny">({macros.length})</span></strong>
     <button type="button" onClick={()=>startNew('attack')} className="secondary">+ Attack macro</button>
     <button type="button" onClick={()=>startNew()} className="secondary">+ Custom macro</button>
     <button type="button" onClick={()=>startNew('example')} className="secondary">+ Swipe example</button>
     <div className="macro-manager-list">
      {macros.length===0&&<p className="muted tiny">Create your first macro and save it to this campaign.</p>}
      {macros.map(m=><button key={m.id} type="button"
       className={'macro-library-entry'+(chosenId===m.id?' selected':'')}
       onClick={()=>{if(dirty&&!confirm('Discard changes to this macro?'))return;openMacro(m)}}
       draggable onDragStart={e=>dragMacro(e,m)}
       title="Open or drag this macro onto a hotbar slot">
       <strong>{m.name}</strong><small>{m.subtitle||'Macro'} · ⠿</small>
      </button>)}
     </div>
    </aside>
    <div className="macro-manager-editor">
     <div className="macro-manager-meta">
      <label>Title<input value={draft.name} maxLength={80}
       onChange={e=>update({name:e.target.value})} placeholder="Bobby"/></label>
      <label>Subtitle<input value={draft.subtitle} maxLength={100}
       onChange={e=>update({subtitle:e.target.value})} placeholder="Swipe"/></label>
      <label className="macro-source-label">Use attributes from
       <select value={sourceOptions.some(o=>o.value===sourceValue)?sourceValue:'none'}
        onChange={e=>changeSource(e.target.value)}>
        {sourceOptions.map(o=><option value={o.value} key={o.value}>{o.label}</option>)}
       </select>
      </label>
     </div>
     <div className="macro-manager-columns">
      <div className="macro-manager-rows">
       <div className="macro-manager-section-heading">
        <strong>Result rows</strong>
        <div className="macro-manager-add-row">
         <button type="button" className="secondary" disabled={draft.rows.length>=MAX_ROWS}
          onClick={addAttackRow}>+ Attack</button>
         <button type="button" className="secondary" disabled={draft.rows.length>=MAX_ROWS}
          onClick={addRow}>+ Row</button>
        </div>
       </div>
       {draft.rows.map((r,index)=><article key={r.id} className="macro-edit-row">
        <div className="macro-edit-row-header">
         <input aria-label={'Row '+(index+1)+' label'} maxLength={36}
          value={r.label} onChange={e=>updateRow(r.id,{label:e.target.value})}/>
         <button type="button" className="secondary" disabled={index===0}
          onClick={()=>moveRow(index,-1)} title="Move row up">↑</button>
         <button type="button" className="secondary" disabled={index===draft.rows.length-1}
          onClick={()=>moveRow(index,1)} title="Move row down">↓</button>
         <button type="button" className="secondary" disabled={draft.rows.length===1}
          onClick={()=>removeRow(r.id)} title="Remove row">×</button>
        </div>
        {r.cells.map((cell,i)=><div key={cell.id} className="macro-edit-cell">
         <div className="macro-edit-cell-header">
          <select aria-label="Result type" value={cell.kind} onChange={e=>{
           const kind=e.target.value;
           if(kind==='attack'){
            if(r.cells.length>1&&!confirm('Replace this row with one linked Attack?'))return;
            updateRow(r.id,{cells:[attackCell()]});return;
           }
           updateCell(r.id,cell.id,kind==='roll'?
            {kind,formula:'1d20',text:undefined,critOn:undefined,
             damage:undefined,critDamage:undefined,mode:undefined}:
            {kind,text:'',formula:undefined,critOn:undefined,
             damage:undefined,critDamage:undefined,mode:undefined});
          }}>
           <option value="roll">Dice / number</option>
           <option value="attack">Attack (linked)</option>
           <option value="text">Text</option>
          </select>
          <input value={cell.label||''} maxLength={24}
           aria-label="Result label" placeholder="Label (optional)"
           onChange={e=>updateCell(r.id,cell.id,{label:e.target.value})}/>
          <button type="button" className="secondary"
           aria-label="Remove result" title="Remove result"
           disabled={r.cells.length===1}
           onClick={()=>updateRow(r.id,{cells:r.cells.filter(x=>x.id!==cell.id)})}>×</button>
         </div>
         {cell.kind==='attack'?<div className="macro-attack-fields">
          <label>To-hit formula<input className="macro-formula-input" value={cell.formula||''}
           placeholder="1d20+@{dexterity_mod}" maxLength={120}
           onChange={e=>updateCell(r.id,cell.id,{formula:e.target.value})}/></label>
          <label>Roll mode<select value={cell.mode||'normal'}
           onChange={e=>updateCell(r.id,cell.id,{mode:e.target.value})}>
           <option value="normal">Normal — one d20</option>
           <option value="advantage">Advantage — higher natural d20</option>
           <option value="disadvantage">Disadvantage — lower natural d20</option>
          </select></label>
          <label>Crit on<select value={cell.critOn??20}
           onChange={e=>updateCell(r.id,cell.id,{critOn:Number(e.target.value)})}>
           {Array.from({length:20},(_,i)=>20-i).map(n=>
            <option value={n} key={n}>{n===20?'Natural 20':n+'–20'}</option>)}
          </select></label>
          <label>Damage formula<input className="macro-formula-input" value={cell.damage||''}
           placeholder="1d8+2" maxLength={120}
           onChange={e=>updateCell(r.id,cell.id,{damage:e.target.value})}/></label>
          <label>Extra damage on crit<input className="macro-formula-input"
           value={cell.critDamage||''} placeholder="1d8 (or leave blank)" maxLength={120}
           onChange={e=>updateCell(r.id,cell.id,{critDamage:e.target.value})}/></label>
          <p className="muted tiny">One linked action: choose the hit by its natural die,
           roll damage once, then add the extra damage only when that hit is critical.</p>
         </div>:cell.kind==='roll'?<>
          <input className="macro-formula-input" value={cell.formula||''}
           aria-label="Dice expression" maxLength={120} placeholder="1d20+@{wisdom_mod}"
           onChange={e=>updateCell(r.id,cell.id,{formula:e.target.value})}/>
          <label className="macro-crit-control">Natural critical
           <select value={cell.critOn??''} aria-label="Natural critical threshold"
            onChange={e=>updateCell(r.id,cell.id,{
             critOn:e.target.value===''?undefined:Number(e.target.value)})}>
            <option value="">Off (normal result)</option>
            <option value="20">20 only</option>
            <option value="19">19–20</option>
            <option value="18">18–20</option>
            {Array.from({length:17},(_,i)=>17-i).map(n=>
             <option key={n} value={n}>{n}–20</option>)}
           </select>
          </label>
          {cell.critOn!=null&&<p className={'muted tiny macro-crit-help'+
           (!supportsMacroCritical(cell.formula)?' error':'')}>
           {supportsMacroCritical(cell.formula)?
            'Uses the unmodified d20 face, not the total after bonuses.':
            'Use exactly one positive 1d20 (e.g. 1d20+4). Separate cells for advantage.'}
          </p>}
          {attrs.length>0&&<select className="macro-attribute-insert"
           aria-label="Insert character attribute" value=""
           onChange={e=>{
            if(e.target.value)updateCell(r.id,cell.id,{
             formula:(cell.formula||'')+'@{'+e.target.value+'}'});
           }}>
           <option value="">+ Insert sheet attribute</option>
           {attrs.map(field=><option key={field.id} value={field.id}>
            {field.label} — {field.id}
           </option>)}
          </select>}
         </>:<input value={cell.text||''} maxLength={90}
          aria-label="Result text" placeholder="vs AC, Force, etc."
          onChange={e=>updateCell(r.id,cell.id,{text:e.target.value})}/>}
        </div>)}
        <div className="macro-edit-cell-actions">
         <button type="button" className="secondary" disabled={r.cells.length>=MAX_CELLS||r.cells.some(c=>c.kind==='attack')}
          onClick={()=>addCell(r,'roll')}>+ Roll</button>
         <button type="button" className="secondary" disabled={r.cells.length>=MAX_CELLS||r.cells.some(c=>c.kind==='attack')}
          onClick={()=>addCell(r,'text')}>+ Text</button>
        </div>
       </article>)}
       <p className="muted tiny">Up to 12 rows, three results each, and 18 rolls total.
        Use <code>@{'{dexterity_mod}'}</code> for a DM-configured modifier.
        Linked Attack rolls damage and conditional critical bonus together;
        custom Dice / Number cells remain independent.</p>
      </div>
      <div className="macro-manager-preview">
       <strong>Live layout preview</strong>
       <p className="muted tiny">Values appear when you run the macro. Hover over a rolled result in chat for its maths.</p>
       <MacroChatCard message={previewMacro(draft)} preview/>
       <p className="muted tiny">Linked Attack chooses the higher/lower natural d20 and only adds critical damage when the chosen roll qualifies.</p>
      </div>
     </div>
    </div>
   </div>
   {(error||message)&&<p className={error?'error small macro-manager-notice':'good small macro-manager-notice'} role="status">{error||message}</p>}
   <div className="macro-manager-footer">
    {editingSaved&&<button type="button" className="secondary" disabled={busy}
     onClick={()=>action('delete')}>Delete</button>}
    <span className="spacer"/>
    <button type="button" className="secondary" disabled={busy}
     onClick={()=>action('hotbar')}>+ Hotbar</button>
    <button type="button" className="secondary" disabled={busy}
     onClick={()=>action('run')}>🎲 Run macro</button>
    <button type="button" disabled={busy||(!dirty&&editingSaved)}
     onClick={()=>action('save')}>{busy?'Saving…':'Save macro'}</button>
   </div>
  </section>
 </FloatingWindow>;
}
