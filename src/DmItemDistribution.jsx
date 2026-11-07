import React,{useMemo,useState} from 'react';

/** Only the DM can invoke the protected server-side distribution RPC. */
export default function DmItemDistribution({db,characters=[],template,onDistributed}){
 const inventories=useMemo(()=>(template?.tabs||[]).flatMap(t=>t.fields||[])
  .filter(f=>f.type==='inventory'),[template]);
 const [characterId,setCharacterId]=useState(''),[fieldId,setFieldId]=useState('');
 const [name,setName]=useState(''),[quantity,setQuantity]=useState('1');
 const [weight,setWeight]=useState('0'),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const destination=characters.some(c=>c.id===characterId)?characterId:characters[0]?.id||'';
 const inventory=inventories.some(f=>f.id===fieldId)?fieldId:inventories[0]?.id||'';
 async function submit(e){
  e.preventDefault();if(busy)return;
  setError('');setNotice('');
  if(!destination||!inventory){setError('Choose a character and inventory.');return}
  const qty=Number(quantity),each=Number(weight);
  if(!name.trim()||name.trim().length>100||!Number.isInteger(qty)||
   qty<1||qty>10000||!Number.isFinite(each)||each<0||each>100000){
   setError('Enter a name, quantity 1–10000 and nonnegative per-item weight.');return
  }
  setBusy(true);
  try{
   const {error:dbError}=await db.rpc('dm_give_inventory_item',{
    p_character:destination,p_inventory_field:inventory,
    p_item:{Item:name.trim(),Qty:qty,Weight:each,Notes:notes}
   });
   if(dbError)throw dbError;
   await onDistributed?.();
   setNotice('Item delivered to the selected character inventory.');
   setName('');setQuantity('1');setWeight('0');setNotes('');
  }catch(err){setError(err?.message||String(err))}
  finally{setBusy(false)}
 }
 return <form className="side-form inventory-give-form" onSubmit={submit}>
  <p className="muted tiny">Give an item directly to a character. This adds a new
   item record without replacing their other inventory items.</p>
  <label>Character<select value={destination} onChange={e=>setCharacterId(e.target.value)}>
   {characters.map(ch=><option value={ch.id} key={ch.id}>{ch.name||'Unnamed character'}</option>)}
  </select></label>
  <label>Inventory<select value={inventory} onChange={e=>setFieldId(e.target.value)}>
   {inventories.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
  </select></label>
  <label>Item<input value={name} maxLength={100} required
   onChange={e=>setName(e.target.value)} placeholder="Potion of Healing"/></label>
  <div className="inventory-give-numbers">
   <label>Quantity<input type="number" min="1" max="10000" required
    value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
   <label>Weight per item<input type="number" min="0" max="100000" step=".001" required
    value={weight} onChange={e=>setWeight(e.target.value)}/></label>
  </div>
  <label>Notes<textarea value={notes} maxLength={500}
   onChange={e=>setNotes(e.target.value)} rows={2}/></label>
  <button type="submit" disabled={busy||!destination||!inventory||!name.trim()}>
   {busy?'Distributing…':'Give item to character'}
  </button>
  {!inventories.length&&<p className="error tiny">Add an Inventory field in Sheet Designer first.</p>}
  {notice&&<p className="good tiny" role="status">{notice}</p>}
  {error&&<p className="error tiny" role="alert">{error}</p>}
 </form>;
}
