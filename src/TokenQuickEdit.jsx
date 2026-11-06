import React,{useEffect,useMemo,useRef,useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';

export function editableFields(template){
 const seen=new Set();
 return (template?.tabs||[]).flatMap(t=>t.fields||[])
  .filter(f=>(f.type==='resource'||f.type==='number')&&/^[A-Za-z0-9_-]{1,64}$/.test(f.id)&&!seen.has(f.id)&&seen.add(f.id))
  .map(f=>({id:f.id,label:f.label||f.id,type:f.type}));
}
export function QuickFieldsSettings({template,selected,onSave}){
 const fields=useMemo(()=>editableFields(template),[template]);
 const [draft,setDraft]=useState(()=>Array.isArray(selected)?selected:[]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setDraft(Array.isArray(selected)?selected:[]);setError('');setNotice('')},[selected]);
 const active=draft.filter(id=>fields.some(f=>f.id===id)).slice(0,8);
 const saved=Array.isArray(selected)?selected:[];
 const changed=JSON.stringify(active)!==JSON.stringify(saved);
 function toggle(id){
  setNotice('');setDraft(old=>old.includes(id)?old.filter(x=>x!==id)
    :old.length<8?[...old,id]:old);
 }
 function move(index,delta){
  const order=[...active],other=index+delta;
  if(other<0||other>=order.length)return;
  [order[index],order[other]]=[order[other],order[index]];
  setDraft(order);
 }
 async function save(){
  setBusy(true);setError('');setNotice('');
  try{await onSave(active);setNotice('Quick-adjust fields saved for this campaign.')}
  catch(e){setError(e?.message||String(e))}
  finally{setBusy(false)}
 }
 return <div className="quick-field-settings">
  <p className="muted small">Choose which resources players can adjust by Ctrl + clicking a token. Players can edit their controlled tokens only; the DM can edit any token.</p>
  {fields.length===0&&<p className="muted tiny">Add a Number or Resource (Current / Maximum) field to the Sheet Designer first.</p>}
  <div className="quick-field-options">{fields.map(field=><label key={field.id} className="quick-field-option">
   <input type="checkbox" checked={active.includes(field.id)} onChange={()=>toggle(field.id)}
    disabled={!active.includes(field.id)&&active.length>=8}/>
   <span>{field.label} <small className="muted">({field.type==='resource'?'Current / Max':'Number'})</small></span>
  </label>)}</div>
  {active.length>0&&<div className="quick-field-order">
   <span className="muted small">Popup order</span>
   {active.map((id,index)=><div key={id} className="quick-field-order-item">
    <span>{fields.find(f=>f.id===id)?.label||id}</span>
    <button type="button" className="secondary" disabled={index===0} onClick={()=>move(index,-1)}>↑</button>
    <button type="button" className="secondary" disabled={index===active.length-1} onClick={()=>move(index,1)}>↓</button>
   </div>)}
  </div>}
  <p className="muted tiny">{active.length}/8 available fields selected</p>
  {error&&<p className="error small" role="alert">{error}</p>}
  {notice&&<p className="good small">{notice}</p>}
  <button type="button" disabled={!changed||busy} onClick={save}>{busy?'Saving…':'Save quick-adjust fields'}</button>
 </div>;
}
function parts(type,value){
 if(type==='resource'){
  if(value&&typeof value==='object'&&!Array.isArray(value))
   return {current:value.current??'',max:value.max??''};
  return {current:value??'',max:''};
 }
 return {current:value??'',max:''};
}
function validNumber(n){return n!==''&&Number.isFinite(Number(n))&&Number(n)>=-1000000&&Number(n)<=1000000}
export default function TokenQuickEdit({db,token,template,allowedFields,initialValues={},onRemember,onClose,onApply}){
 const fields=useMemo(()=>editableFields(template).filter(f=>(allowedFields||[]).includes(f.id)),[template,allowedFields]);
 const prepare=raw=>Object.fromEntries(fields.map(f=>[f.id,parts(f.type,raw?.[f.id])]));
 const [values,setValues]=useState(()=>prepare(initialValues));
 const [saved,setSaved]=useState(()=>prepare(initialValues));
 const [error,setError]=useState('');
 const touched=useRef(new Set());
 const [known,setKnown]=useState(()=>new Set(fields.filter(f=>
  Object.prototype.hasOwnProperty.call(initialValues,f.id)).map(f=>f.id)));
 useEffect(()=>{
  let live=true;
  db.rpc('get_token_quick_values',{p_token:token.id}).then(({data,error:readError})=>{
   if(!live)return;
   if(readError){setError('Could not synchronise current values: '+readError.message);return}
   const remote=prepare(data||{});
   setSaved(remote);
   setValues(previous=>{
    const next={...previous};
    for(const field of fields){
     const id=field.id;
     next[id]={...previous[id]};
     for(const part of field.type==='resource'?['current','max']:['current']){
      if(!touched.current.has(id+':'+part))next[id][part]=remote[id][part];
     }
    }
    return next;
   });
   setKnown(new Set(fields.map(f=>f.id)));
   onRemember?.(data||{});
  }).catch(e=>{if(live)setError(e?.message||String(e))});
  return()=>{live=false};
 },[token.id,db,template,allowedFields]);
 function change(id,part,value){
  touched.current.add(id+':'+part);
  setKnown(old=>new Set([...old,id]));
  setValues(v=>({...v,[id]:{...v[id],[part]:value}}));
 }
 const changes=fields.flatMap(f=>{
  const changed=[];
  for(const part of f.type==='resource'?['current','max']:['current']){
   if(String(values[f.id]?.[part]??'')!==String(saved[f.id]?.[part]??''))changed.push({field:f,part,value:values[f.id]?.[part]});
  }
  return changed;
 });
 function shift(field,amount){
  const raw=values[field.id]?.current;
  const next=(Number(raw)||0)+amount;
  change(field.id,'current',String(Math.max(-1000000,Math.min(1000000,next))));
 }
 function save(){
  if(!changes.length)return;
  if(changes.some(c=>!validNumber(c.value))){
   setError('Enter a number between -1,000,000 and 1,000,000.');return;
  }
  const payload={};
  for(const item of changes){
   if(!payload[item.field.id])payload[item.field.id]={};
   payload[item.field.id][item.part]=Number(item.value);
  }
  try{
   // The parent paints the new values synchronously and queues a single atomic save.
   if(onApply(token,payload)!==false)onClose();
  }catch(e){setError(e?.message||String(e))}
 }
 return <FloatingWindow kind="quick" onClose={onClose}>
  <section className="modal quick-token-modal" role="dialog" aria-label={'Quick edit '+token.name}>
   <div className="heading">
    <div><h2>{token.name} · Quick Adjust</h2></div>
    <button type="button" className="secondary" onClick={onClose}>✕</button>
   </div>
   {fields.length===0?
    <p className="muted">No quick-adjust fields enabled. Ask your DM to configure them in Settings.</p>:
    <div className="quick-token-fields">{fields.map(f=>{
     const value=values[f.id]||{current:'',max:''};
     return <div className="quick-token-field" key={f.id}>
      <strong>{f.label}</strong>
      <div className="quick-token-numbers">
       <label>Current<input type="number" step="any" value={value.current}
        onChange={e=>change(f.id,'current',e.target.value)}/></label>
       {f.type==='resource'&&<label>Maximum<input type="number" step="any"
        value={value.max} onChange={e=>change(f.id,'max',e.target.value)}/></label>}
      </div>
      <div className="quick-token-adjustments">
       {[-5,-1,1,5].map(v=><button type="button" key={v} className="secondary"
        onClick={()=>shift(f,v)} disabled={!known.has(f.id)}
        title={!known.has(f.id)?'Synchronising the original value…':''}>{v>0?'+':''}{v}</button>)}
      </div>
     </div>;
    })}</div>}
   {error&&<p className="error small" role="alert">{error}</p>}
   <div className="actions">
    <button type="button" className="secondary" onClick={onClose}>Cancel</button>
    <button type="button" onClick={save} disabled={changes.length===0}>Apply changes</button>
   </div>
  </section>
 </FloatingWindow>;
}
