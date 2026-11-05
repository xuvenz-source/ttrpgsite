import React,{useEffect,useMemo,useState} from 'react';
import Artwork from './Artwork.jsx';
import TokenStudio from './TokenStudio.jsx';

function Items({field,value,onChange}){
 const columns=field.columns?.length?field.columns:['Item','Qty','Notes'];const rows=Array.isArray(value)?value:[];
 return <div className="inventory">
  <div className="invrow">{columns.map(c=><b key={c}>{c}</b>)}</div>
  {rows.map((row,i)=><div className="invrow" key={i}>{columns.map(c=><input aria-label={c} key={c} value={row?.[c]??''} onChange={e=>onChange(rows.map((r,j)=>j===i?{...r,[c]:e.target.value}:r))}/>)}<button className="secondary" onClick={()=>onChange(rows.filter((_,j)=>j!==i))}>×</button></div>)}
  <button className="secondary" onClick={()=>onChange([...rows,{}])}>+ Item</button>
 </div>;
}
export default function NpcEditor({db,campaignId,userId,record,template,onSave,onSaveAsTemplate,onClose,onRoll}){
 const [draft,setDraft]=useState(()=>({
  name:record.data.name,
  values:structuredClone(record.kind==='template'?record.data.field_values||{}:record.data.npc_values||{}),
  portraitPath:record.kind==='template'?record.data.portrait_path||null:null,
  tokenPath:record.kind==='template'?record.data.token_path||null:record.data.image_path||null
 }));
 const[t,setT]=useState(template?.tabs?.[0]?.id||'main'),[studio,setStudio]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const current=template?.tabs?.find(x=>x.id===t)||template?.tabs?.[0];const title=record.kind==='template'?'Bestiary template':'NPC token sheet';
 function setField(id,v){setDraft(d=>({...d,name:id==='character_name'?String(v):d.name,values:{...d.values,[id]:v}}))}
 async function save(){setSaving(true);setError('');try{await onSave(draft);onClose()}catch(e){setError(e?.message||String(e))}finally{setSaving(false)}}
 async function saveToBestiary(){setSaving(true);setNotice('');setError('');
  try{await onSaveAsTemplate(draft);setNotice('Saved a reusable copy in your Bestiary.')}
  catch(e){setError(e?.message||String(e))}finally{setSaving(false)}
 }
 function close(){if(!confirm('Close NPC sheet? Unsaved changes will be lost.'))return;onClose()}
 const doRoll=(field)=>{
  const formula=(field.formula||'1d20').replace(/@\{([a-z0-9_-]+)\}/gi,(raw,key)=>{
   const val=draft.values[key];return val!==undefined&&String(val).match(/^-?\d+$/)?String(val):'0'
  });
  onRoll(formula,field.label);
 };
 return <div className="modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&close()}>
 <section className="modal npc-modal" role="dialog" aria-modal="true" aria-label="Edit NPC sheet">
 <div className="heading"><div><h2>{title}</h2><p className="muted small">{record.kind==='token'?'Changes apply only to this placed token.':'Changes become the default for newly placed copies.'}</p></div><button className="secondary" onClick={close}>✕</button></div>
 <div className="npc-editor-top">
 <Artwork db={db} path={draft.tokenPath||draft.portraitPath} alt={draft.name} className="npc-editor-portrait"/>
 <label>NPC name<input maxLength={100} value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value,values:{...d.values,character_name:e.target.value}}))}/></label>
 <button className="secondary" onClick={()=>setStudio(true)}>🎨 {draft.tokenPath?'Change token art':'Create token art'}</button>
 </div>
 <div className="tabs">{template?.tabs?.map(tab=><button key={tab.id} onClick={()=>setT(tab.id)} className={t===tab.id?'selected':''}>{tab.name}</button>)}</div>
 <div className="npc-fields fields">
 {(current?.fields||[]).map(f=><div className={'field span'+(f.span||1)} key={f.id}><label>{f.label}</label>
 {f.type==='roll'?<button onClick={()=>doRoll(f)} className="rollbtn">🎲 {f.label} <small>{f.formula||'1d20'}</small></button>:
 f.type==='inventory'?<Items field={f} value={draft.values[f.id]||[]} onChange={v=>setField(f.id,v)}/>:
 f.type==='checkbox'?<input type="checkbox" checked={!!draft.values[f.id]} onChange={e=>setField(f.id,e.target.checked)}/>:
 f.type==='textarea'?<textarea value={draft.values[f.id]??''} onChange={e=>setField(f.id,e.target.value)}/>:
 <input type={f.type==='number'?'number':'text'} value={draft.values[f.id]??''} onChange={e=>setField(f.id,e.target.value)}/>}
 </div>)}
 </div>
 {error&&<p className="error">{error}</p>}
 {notice&&<p className="good">{notice}</p>}
 <div className="actions">{record.kind==='token'&&<button className="secondary" onClick={saveToBestiary} disabled={saving}>Save copy to Bestiary</button>}<button className="secondary" onClick={close}>Cancel</button><button onClick={save} disabled={saving||!draft.name.trim()}>{saving?'Saving…':'Save NPC sheet'}</button></div>
 </section>
 {studio&&<TokenStudio db={db} campaignId={campaignId} userId={userId} mode="npcs" onClose={()=>setStudio(false)} onSave={assets=>{setDraft(d=>({...d,portraitPath:assets.portraitPath,tokenPath:assets.tokenPath}))}}/>}
 </div>;
}