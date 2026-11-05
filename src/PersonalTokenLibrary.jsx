import React,{useEffect,useState} from 'react';
import Artwork from './Artwork.jsx';
import TokenStudio from './TokenStudio.jsx';

const LIBRARY_BUCKET='personal-token-art';
const CAMPAIGN_BUCKET='tabletop-artwork';
const MAX_IMAGE_BYTES=5*1024*1024;
function unwrap({data,error}){if(error)throw error;return data}

/**
 * Personal, account-owned tokens; an authorised member can copy one into their
 * current campaign. The personal original is never shared with campaign members.
 */
export default function PersonalTokenLibrary({
 db,userId,campaignId,mode='players',currentTokenPath=null,currentPortraitPath=null,
 defaultName='New Token',onApply,onClose
}){
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),
  [studio,setStudio]=useState(false),[newName,setNewName]=useState(defaultName),
  [error,setError]=useState(''),[notice,setNotice]=useState('');

 useEffect(()=>{
  let alive=true;setLoading(true);
  db.from('personal_tokens').select('*').eq('owner_id',userId)
   .order('created_at',{ascending:false}).then(({data,error})=>{
    if(!alive)return;
    if(error)setError(error.message);else setItems(data||[]);
    setLoading(false);
   });
  return()=>{alive=false};
 },[db,userId]);

 async function addBlobs({portraitBlob,tokenBlob},name){
  if(!portraitBlob||!tokenBlob||portraitBlob.size>MAX_IMAGE_BYTES||tokenBlob.size>MAX_IMAGE_BYTES)
   throw Error('Portrait and token images must each be smaller than 5 MB.');
  const id=crypto.randomUUID(),portraitPath=userId+'/'+id+'-portrait.webp',
   tokenPath=userId+'/'+id+'-token.webp';
  const storage=db.storage.from(LIBRARY_BUCKET),uploaded=[];
  try{
   unwrap(await storage.upload(portraitPath,portraitBlob,{contentType:'image/webp',upsert:false}));
   uploaded.push(portraitPath);
   unwrap(await storage.upload(tokenPath,tokenBlob,{contentType:'image/webp',upsert:false}));
   uploaded.push(tokenPath);
   return unwrap(await db.from('personal_tokens').insert({
    owner_id:userId,name:name.trim().slice(0,100)||'Unnamed Token',
    portrait_path:portraitPath,token_path:tokenPath
   }).select('*').single());
  }catch(e){
   if(uploaded.length)await storage.remove(uploaded);
   throw e;
  }
 }
 async function saveNewBlobs(blobs){
  const item=await addBlobs(blobs,newName);
  setItems(previous=>[item,...previous]);setStudio(false);setNotice('Token saved to your private library.');
  // Preserve the old Create / edit flow: a newly made token also becomes active.
  try{await applyItem(item)}catch(e){
   setError('The token was saved to your library, but could not be assigned: '+(e.message||String(e)));
  }
 }
 async function downloadLibraryFile(path){
  return unwrap(await db.storage.from(LIBRARY_BUCKET).download(path));
 }
 async function applyItem(item){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const [portraitBlob,tokenBlob]=await Promise.all([
    downloadLibraryFile(item.portrait_path),downloadLibraryFile(item.token_path)
   ]);
   const id=crypto.randomUUID(),root=mode==='npcs'
    ?campaignId+'/npcs/':campaignId+'/players/'+userId+'/';
   const portraitPath=root+id+'-portrait.webp',tokenPath=root+id+'-token.webp';
   const storage=db.storage.from(CAMPAIGN_BUCKET);
   unwrap(await storage.upload(portraitPath,portraitBlob,{contentType:'image/webp',upsert:false}));
   unwrap(await storage.upload(tokenPath,tokenBlob,{contentType:'image/webp',upsert:false}));
   await onApply({portraitPath,tokenPath});
   onClose();
  }catch(e){
   setError(e?.message||String(e));
   throw e;
  }finally{setBusy(false)}
 }
 async function importCurrent(){
  if(!currentTokenPath)return;
  setBusy(true);setError('');setNotice('');
  try{
   const storage=db.storage.from(CAMPAIGN_BUCKET);
   const tokenBlob=unwrap(await storage.download(currentTokenPath));
   const portraitBlob=currentPortraitPath
    ?unwrap(await storage.download(currentPortraitPath)):tokenBlob;
   const name=(defaultName||'Imported token').slice(0,85)+' — saved';
   const item=await addBlobs({portraitBlob,tokenBlob},name);
   setItems(previous=>[item,...previous]);
   setNotice('Your existing token is now in your personal library. Its campaign copy remains unchanged.');
  }catch(e){setError(e?.message||String(e))}
  finally{setBusy(false)}
 }
 async function rename(item){
  const name=prompt('Rename token',item.name)?.trim();
  if(!name||name===item.name)return;
  if(name.length>100){setError('Names must be 100 characters or fewer.');return}
  setBusy(true);setError('');
  try{
   const data=unwrap(await db.from('personal_tokens').update({name})
    .eq('id',item.id).eq('owner_id',userId).select('*').single());
   setItems(previous=>previous.map(t=>t.id===item.id?data:t));
  }catch(e){setError(e?.message||String(e))}finally{setBusy(false)}
 }
 async function deleteItem(item){
  if(!confirm('Remove "'+item.name+'" from your personal library? Tokens already assigned to character sheets will remain on those sheets.'))return;
  setBusy(true);setError('');setNotice('');
  try{
   unwrap(await db.from('personal_tokens').delete().eq('id',item.id).eq('owner_id',userId));
   setItems(previous=>previous.filter(t=>t.id!==item.id));
   const {error:storageError}=await db.storage.from(LIBRARY_BUCKET)
    .remove([item.portrait_path,item.token_path]);
   if(storageError)setNotice('Library entry removed, but artwork cleanup could not finish: '+storageError.message);
  }catch(e){setError(e?.message||String(e))}finally{setBusy(false)}
 }

 return <div className="modal-backdrop personal-token-backdrop"
  onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="modal personal-token-library" role="dialog" aria-modal="true" aria-label="My Token Library">
   <div className="heading">
    <div><h2>My Token Library</h2>
     <p className="muted small">Private to your account · Reusable across campaigns</p>
    </div>
    <button type="button" className="secondary" onClick={onClose}>✕ Close</button>
   </div>
   <div className="library-create-row">
    <label>New token name<input maxLength={100} placeholder="e.g. Elven Ranger"
      value={newName} onChange={e=>setNewName(e.target.value)}/></label>
    <button type="button" onClick={()=>{setError('');setStudio(true)}} disabled={busy}>+ Create new token</button>
   </div>
   {currentTokenPath&&<button className="secondary personal-import" disabled={busy}
    onClick={importCurrent}>Save currently equipped token to library</button>}
   <p className="muted small">Choose **Use on this sheet** to apply a previously saved token. New tokens are saved here and applied automatically.</p>
   {error&&<div className="error alert" role="alert">{error}</div>}
   {notice&&<p className="good small">{notice}</p>}
   {loading?<p className="muted">Loading your tokens…</p>:
    items.length===0?<div className="personal-empty"><p>You haven't saved any tokens yet.</p>
     <p className="muted small">Create one above or import the token currently equipped on your character.</p></div>:
    <div className="personal-token-grid">{items.map(item=><article className="personal-token-card" key={item.id}>
     <Artwork db={db} bucket={LIBRARY_BUCKET} path={item.token_path}
      alt={item.name} className="personal-token-art"/>
     <strong title={item.name}>{item.name}</strong>
     <span className="muted tiny">Saved {new Date(item.created_at).toLocaleDateString()}</span>
     <button type="button" disabled={busy} onClick={()=>applyItem(item).catch(()=>{})}>
      {busy?'Working…':'Use on this sheet'}
     </button>
     <div className="personal-token-actions">
      <button type="button" disabled={busy} className="secondary" onClick={()=>rename(item)}>Rename</button>
      <button type="button" disabled={busy} className="secondary" onClick={()=>deleteItem(item)}>Remove</button>
     </div>
    </article>)}</div>}
  </section>
  {studio&&<TokenStudio db={db} userId={userId} campaignId={campaignId}
   onClose={()=>setStudio(false)} onSaveBlobs={saveNewBlobs}/>}
 </div>;
}