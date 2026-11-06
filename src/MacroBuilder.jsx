import React,{useMemo,useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';
import MacroChatCard from './MacroChatCard.jsx';

const uid=()=>crypto.randomUUID();
const MAX_ROWS=12,MAX_CELLS=3;
const roll=(label='Roll',formula='1d20')=>({id:uid(),kind:'roll',label,formula});
const text=(label='Note',value='vs AC')=>({id:uid(),kind:'text',label,text:value});
const row=(label='Attack',cells=[roll('Normal','1d20+3')])=>({id:uid(),label,cells});
const blankMacro=()=>({
 id:uid(),name:'New macro',subtitle:'',
 source_type:'none',source_id:null,
 rows:[row('Attack'),row('Damage',[roll('Force','1d8+2')])]
});
const swipeExample=()=>({
 ...blankMacro(),name:'Bobby',subtitle:'Swipe',
 rows:[
  row('Attack',[roll('Normal','1d20+@{wisdom_mod}'),roll('Advantage','1d20+@{wisdom_mod}'),text('vs','AC')]),
  row('Damage',[roll('Force','1d8+2+@{wisdom_mod}'),roll('Critical','1d8')]),
  row('Graze',[roll('Wisdom','@{wisdom_mod}')]),
  row('Charge 20ft',[roll('Extra','1d6'),roll('Crit','1d6')])
 ]
});
export function previewMacro(macro){
 return {body:macro.name,result:{
  version:1,title:macro.name,subtitle:macro.subtitle,
  rows:macro.rows.map(r=>({id:r.id,label:r.label,cells:r.cells.map(c=>({...c}))}))
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
 const attrs=useMemo(()=>Array.from(
   new Map((template?.tabs||[]).flatMap(tab=>tab.fields||[])
    .filter(f=>f.type==='number'||f.type==='resource')
    .map(f=>[f.id,{id:f.id,label:f.label||f.id}])).values()
  ),[template]);
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
 function startNew(example=false){
  setChosenId('new');setDraft(example?swipeExample():blankMacro());
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
  if(r.cells.length>=MAX_CELLS)return;
  updateRow(r.id,{cells:[...r.cells,kind==='roll'?roll('Roll','1d20'):text('Note','')]});
 }
 function changeSource(value){
  if(value==='none')return update({source_type:'none',source_id:null});
  const idx=value.indexOf(':');
  update({source_type:value.slice(0,idx),source_id:value.slice(idx+1)});
 }
 async function persist(){
  if(!draft.name.trim())throw Error('Give the macro a name.');
  if(draft.rows.length===0)throw Error('Add at least one row.');
  if(!draft.rows.some(r=>r.cells.some(c=>c.kind==='roll')))
   throw Error('Add at least one dice or numeric roll.');
  if(draft.rows.some(r=>!r.label.trim()||r.cells.length===0))
   throw Error('Each row needs a label and at least one cell.');
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
    <div><h2>Macro Builder</h2>
     <p className="muted tiny">Build multi-roll actions without writing a Roll20 template.</p>
    </div>
    <button type="button" className="secondary" onClick={close} aria-label="Close macro builder">✕</button>
   </div>
   <div className="macro-manager-body">
    <aside className="macro-manager-library">
     <strong>My macros <span className="muted tiny">({macros.length})</span></strong>
     <button type="button" onClick={()=>startNew()} className="secondary">+ New macro</button>
     <button type="button" onClick={()=>startNew(true)} className="secondary">+ Swipe example</button>
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
        <button type="button" className="secondary" disabled={draft.rows.length>=MAX_ROWS}
         onClick={addRow}>+ Row</button>
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
           updateCell(r.id,cell.id,kind==='roll'?
            {kind,formula:'1d20',text:undefined}:
            {kind,text:'',formula:undefined});
          }}>
           <option value="roll">Dice / number</option>
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
         {cell.kind==='roll'?<>
          <input className="macro-formula-input" value={cell.formula||''}
           aria-label="Dice expression" maxLength={120} placeholder="1d20+@{wisdom_mod}"
           onChange={e=>updateCell(r.id,cell.id,{formula:e.target.value})}/>
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
         <button type="button" className="secondary" disabled={r.cells.length>=MAX_CELLS}
          onClick={()=>addCell(r,'roll')}>+ Roll</button>
         <button type="button" className="secondary" disabled={r.cells.length>=MAX_CELLS}
          onClick={()=>addCell(r,'text')}>+ Text</button>
        </div>
       </article>)}
       <p className="muted tiny">Up to 12 rows, three results each, and 18 rolls total.
        Use <code>@{'{wisdom_mod}'}</code> to reference a numeric character field.
        Formulas are rolled by the server when the macro is used.</p>
      </div>
      <div className="macro-manager-preview">
       <strong>Live layout preview</strong>
       <p className="muted tiny">Values appear when you run the macro. Hover over a rolled result in chat for its maths.</p>
       <MacroChatCard message={previewMacro(draft)} preview/>
       <p className="muted tiny">Example: Attack has two independent d20 rolls; Graze can show only a modifier; each additional effect gets its own row.</p>
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
