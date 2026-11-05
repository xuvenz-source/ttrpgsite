import React,{useEffect,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import{createClient}from'@supabase/supabase-js';
import './style.css';
import TokenStudio from './TokenStudio.jsx';
import Artwork from './Artwork.jsx';
import Bestiary from './Bestiary.jsx';
import NpcEditor from './NpcEditor.jsx';
import CharacterEditor from './CharacterEditor.jsx';
import TabletopSidebar from './TabletopSidebar.jsx';

const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
const uid=()=>crypto.randomUUID();
const message=e=>e?.message||String(e);
const read=async(q)=>{const{data,error}=await q;if(error)throw error;return data};
const D=(field)=>field.type==='number'?0:field.type==='inventory'?[]:'';
const stamp=s=>new Date(s).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const defaults=[{id:'main',name:'Character',fields:[{id:'character_name',label:'Name',type:'text',span:2},{id:'strength',label:'Strength',type:'number',span:1},{id:'dexterity',label:'Dexterity',type:'number',span:1},{id:'hp',label:'Hit points',type:'number',span:1},{id:'attack',label:'Attack',type:'roll',formula:'1d20+@{strength}',span:1}]},{id:'inventory',name:'Inventory',fields:[{id:'items',label:'Equipment',type:'inventory',columns:['Item','Qty','Weight','Notes'],span:3}]}];
function App(){
 const[session,setSession]=useState(null),[authReady,setAuthReady]=useState(false),[email,setEmail]=useState(''),[sent,setSent]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const[campaigns,setCampaigns]=useState([]),[roles,setRoles]=useState({}),[activeId,setActiveId]=useState(''),[camp,setCamp]=useState(null),[members,setMembers]=useState([]),[characters,setCharacters]=useState([]),[character,setCharacter]=useState(null);
 const[createName,setCreateName]=useState(''),[joinCode,setJoinCode]=useState(new URLSearchParams(location.search).get('join')||'');
 const[tab,setTab]=useState('sheet'),[sheetTab,setSheetTab]=useState('main'),[template,setTemplate]=useState(null),[saveState,setSaveState]=useState('Saved');
 const[folders,setFolders]=useState([]),[maps,setMaps]=useState([]),[folder,setFolder]=useState(null),[selectedMap,setSelectedMap]=useState(''),[urls,setUrls]=useState({}),[tokens,setTokens]=useState([]);
 const[sidebarOpen,setSidebarOpen]=useState(true),[artStudio,setArtStudio]=useState(false),[npcEditor,setNpcEditor]=useState(null),[characterEditor,setCharacterEditor]=useState(null);
 const[rightTab,setRightTab]=useState('chat'),[mapZoom,setMapZoom]=useState(.7),[selectedTokenId,setSelectedTokenId]=useState(null);
 const[npcs,setNpcs]=useState([]),[npcFolders,setNpcFolders]=useState([]);
 const[msgs,setMsgs]=useState([]),[chat,setChat]=useState(''),[newFolder,setNewFolder]=useState(''),[uploading,setUploading]=useState(false),[newToken,setNewToken]=useState('Token'),[tokenOwner,setTokenOwner]=useState('');
 const saveTimer=useRef(null),user=session?.user?.id,isDM=roles[activeId]==='dm';
 const activeMap=maps.find(x=>x.id===selectedMap);
 const selectedToken=tokens.find(x=>x.id===selectedTokenId)||null;
 function fail(e){setError(message(e));console.error(e)}
 async function fetchCampaigns(prefer){if(!db||!user)return;
  try{const [cs,ms]=await Promise.all([read(db.from('campaigns').select('*').order('created_at',{ascending:false})),read(db.from('campaign_members').select('campaign_id,role').eq('user_id',user))]);
    setCampaigns(cs);setRoles(Object.fromEntries(ms.map(x=>[x.campaign_id,x.role])));setActiveId(old=>cs.find(x=>x.id===(prefer||old))?(prefer||old):(cs[0]?.id||''));}catch(e){fail(e)}
 }
 async function fetchCampaign(id){if(!id)return;
  try{const [c,m,ch,f,b,chat,npcList,npcFolderList]=await Promise.all([
  read(db.from('campaigns').select('*').eq('id',id).single()),
  read(db.from('campaign_members').select('user_id,role').eq('campaign_id',id)),
  read(db.from('characters').select('*').eq('campaign_id',id)),
  read(db.from('map_folders').select('*').eq('campaign_id',id)),
  read(db.from('battle_maps').select('*').eq('campaign_id',id).order('created_at',{ascending:false})),
  read(db.from('chat_messages').select('*').eq('campaign_id',id).order('created_at',{ascending:false}).limit(100)),
  read(db.from('npc_templates').select('*').eq('campaign_id',id).order('name')),
  read(db.from('npc_folders').select('*').eq('campaign_id',id).order('name'))]);
   setCamp(c);setTemplate(c.sheet_template);setMembers(m);setCharacters(ch);setCharacter(ch.find(x=>x.user_id===user)||null);setFolders(f);setMaps(b);setMsgs(chat.reverse());setNpcs(npcList);setNpcFolders(npcFolderList);
  setSelectedMap(old=>b.find(x=>x.id===old)?old:(c.active_map_id&&b.some(x=>x.id===c.active_map_id)?c.active_map_id:(b[0]?.id||'')));}catch(e){fail(e)}
 }
 async function refreshMaps(){if(!activeId)return;
  try{const [f,m]=await Promise.all([read(db.from('map_folders').select('*').eq('campaign_id',activeId)),read(db.from('battle_maps').select('*').eq('campaign_id',activeId).order('created_at',{ascending:false}))]);setFolders(f);setMaps(m);setSelectedMap(old=>m.find(x=>x.id===old)?old:m[0]?.id||'');}catch(e){fail(e)}
 }
 
 async function refreshNpcs(){if(!activeId)return;try{
  const [all,allFolders]=await Promise.all([
   read(db.from('npc_templates').select('*').eq('campaign_id',activeId).order('name')),
   read(db.from('npc_folders').select('*').eq('campaign_id',activeId).order('name'))]);
  setNpcs(all);setNpcFolders(allFolders);
 }catch(e){fail(e)}}
 async function makeNpcFolder(name,parentId){try{
   await read(db.from('npc_folders').insert({campaign_id:activeId,name,parent_id:parentId}));
   await refreshNpcs();
  }catch(e){fail(e)}}
 async function makeNpc(name,folderId){try{
   const created=await read(db.from('npc_templates').insert({
    campaign_id:activeId,folder_id:folderId,name,
    field_values:{character_name:name}
   }).select('*').single());
   await refreshNpcs();setNpcEditor({kind:'template',data:created});
  }catch(e){fail(e)}}
 async function moveNpcFolder(id,folderId){try{
  await read(db.from('npc_templates').update({folder_id:folderId}).eq('id',id));await refreshNpcs();
 }catch(e){fail(e)}}
 async function openPlayerCharacter(characterId,ownerId){
  if(!isDM)return;
  try{
   let row=null;
   if(characterId){
    row=await read(db.from('characters').select('*').eq('campaign_id',activeId).eq('id',characterId).maybeSingle());
   }
   // Old tokens stored an owner but not a character_id. Resolve by campaign membership.
   if(!row&&ownerId){
    row=await read(db.from('characters').select('*').eq('campaign_id',activeId).eq('user_id',ownerId).maybeSingle());
   }
   if(!row)throw Error('No player character sheet is linked to this token in the campaign.');
   setCharacterEditor({data:row});
  }catch(e){fail(e)}
 }
 async function openTokenSheet(t){
  if(!isDM)return;
  if(t.character_id||t.owner_id){
   await openPlayerCharacter(t.character_id,t.owner_id);
  }else{
   setNpcEditor({kind:'token',data:t});
  }
 }
 function afterPlayerSheetSaved(updated){
  setCharacters(prev=>prev.map(ch=>ch.id===updated.id?updated:ch));
  setCharacter(prev=>prev?.id===updated.id?updated:prev);
 }
 async function saveNpc(draft){
  if(!npcEditor)return;
  if(npcEditor.kind==='template'){
   await read(db.from('npc_templates').update({
    name:draft.name.trim(),field_values:draft.values,portrait_path:draft.portraitPath,token_path:draft.tokenPath
   }).eq('id',npcEditor.data.id));
   await refreshNpcs();
  }else{
   await read(db.from('map_tokens').update({
    name:draft.name.trim(),npc_values:draft.values,image_path:draft.tokenPath
   }).eq('id',npcEditor.data.id));
   await refreshTokens();
  }
 }
 async function placeNpc(npcId,x=1,y=1){
  const npc=npcs.find(n=>n.id===npcId);
  if(!npc||!selectedMap||!isDM)return;
  try{
   await read(db.from('map_tokens').insert({
    campaign_id:activeId,map_id:selectedMap,name:npc.name,
    npc_template_id:npc.id,npc_values:structuredClone(npc.field_values||{}),
    image_path:npc.token_path||null,owner_id:null,x,y
   }));
   await refreshTokens();
  }catch(e){fail(e)}
 }
 async function savePlayerArtwork(art){
  if(!character)throw Error('Character sheet is not ready');
  const changed=await read(db.from('characters').update({
    portrait_path:art.portraitPath,token_path:art.tokenPath
  }).eq('id',character.id).select('*').single());
  setCharacter(old=>({...old,portrait_path:changed.portrait_path,token_path:changed.token_path}));
  setCharacters(old=>old.map(x=>x.id===changed.id?{...x,portrait_path:changed.portrait_path,token_path:changed.token_path}:x));
 }
 async function refreshChat(){if(!activeId)return;try{setMsgs((await read(db.from('chat_messages').select('*').eq('campaign_id',activeId).order('created_at',{ascending:false}).limit(100))).reverse())}catch(e){fail(e)}}
 async function refreshTokens(){if(!selectedMap)return setTokens([]);try{setTokens(await read(db.from('map_tokens').select('*').eq('map_id',selectedMap)))}catch(e){fail(e)}}
 useEffect(()=>{if(!db){setAuthReady(true);return}db.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true)});const{data}=db.auth.onAuthStateChange((_,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);
 useEffect(()=>{if(user)fetchCampaigns();else{setCampaigns([]);setActiveId('')}},[user]);
 useEffect(()=>{if(activeId&&user){setSidebarOpen(false);setTab('sheet');setRightTab('chat');setSelectedTokenId(null);setFolder(null);setNpcEditor(null);setCharacterEditor(null);setError('');fetchCampaign(activeId)}},[activeId,user]);
 useEffect(()=>{if(!db||!activeId)return;const c=db.channel('vtt-'+activeId).on('postgres_changes',{event:'*',schema:'public',table:'chat_messages',filter:'campaign_id=eq.'+activeId},()=>refreshChat()).on('postgres_changes',{event:'*',schema:'public',table:'map_tokens',filter:'campaign_id=eq.'+activeId},()=>refreshTokens()).on('postgres_changes',{event:'*',schema:'public',table:'campaigns',filter:'id=eq.'+activeId},()=>fetchCampaign(activeId))
 .on('postgres_changes',{event:'*',schema:'public',table:'npc_templates',filter:'campaign_id=eq.'+activeId},()=>refreshNpcs())
 .subscribe();return()=>db.removeChannel(c)},[activeId,selectedMap,user]);
 useEffect(()=>{refreshTokens()},[selectedMap]);
 useEffect(()=>{let done=false;Promise.all(maps.map(async x=>{const{data}=await db.storage.from('battlemap-assets').createSignedUrl(x.storage_path,3600);return[x.id,data?.signedUrl||'']})).then(x=>!done&&setUrls(Object.fromEntries(x)));return()=>{done=true}},[maps]);
 useEffect(()=>()=>clearTimeout(saveTimer.current),[]);
 async function create(e){e.preventDefault();setBusy(true);try{const id=await read(db.rpc('create_campaign',{p_name:createName.trim()}));setCreateName('');await fetchCampaigns(id)}catch(e){fail(e)}finally{setBusy(false)}}
 async function join(e){e.preventDefault();setBusy(true);try{const id=await read(db.rpc('join_campaign',{p_invite_code:joinCode.trim().toLowerCase()}));setJoinCode('');history.replaceState({},'',location.pathname);await fetchCampaigns(id)}catch(e){fail(e)}finally{setBusy(false)}}
 function updateField(id,value){if(!character)return;const next={...character,field_values:{...character.field_values,[id]:value}};if(id==='character_name')next.name=String(value||'New Character');setCharacter(next);setSaveState('Saving…');clearTimeout(saveTimer.current);saveTimer.current=setTimeout(async()=>{try{await read(db.from('characters').update({field_values:next.field_values,name:next.name}).eq('id',next.id));setSaveState('Saved')}catch(e){setSaveState('Save failed');fail(e)}},600)}
 async function roll(formula,label='Dice roll',charId=character?.id){try{await read(db.rpc('roll_dice',{p_campaign_id:activeId,p_expression:formula,p_label:label,p_character_id:charId||null}));await refreshChat()}catch(e){fail(e)}}
 async function sendChat(e){e.preventDefault();const raw=chat.trim();if(!raw)return;setChat('');if(/^\/(roll|r)\s+/i.test(raw))return roll(raw.replace(/^\/(roll|r)\s+/i,''),'Dice roll',null);
 if(/^\/macro\s+/i.test(raw)){const label=raw.replace(/^\/macro\s+/i,'').trim().toLowerCase(),field=camp?.sheet_template?.tabs?.flatMap(t=>t.fields).find(f=>f.type==='roll'&&f.label.toLowerCase()===label);if(field)return roll(field.formula||'1d20',field.label);return fail('Macro not found')}
 try{await read(db.from('chat_messages').insert({campaign_id:activeId,user_id:user,body:raw.startsWith('/em ')?'*'+raw.slice(4)+'*':raw}));await refreshChat()}catch(e){fail(e)}}
 function changeTemplate(fn){setTemplate(old=>{const t=structuredClone(old||{tabs:defaults});fn(t);return t})}
 async function saveTemplate(){setBusy(true);try{await read(db.from('campaigns').update({sheet_template:template}).eq('id',activeId));setCamp(x=>({...x,sheet_template:template}));setSaveState('Template saved')}catch(e){fail(e)}finally{setBusy(false)}}
 async function addFolder(e){e.preventDefault();if(!newFolder.trim())return;try{await read(db.from('map_folders').insert({campaign_id:activeId,parent_id:folder,name:newFolder.trim()}));setNewFolder('');refreshMaps()}catch(e){fail(e)}}
 async function uploadMap(e){const file=e.target.files?.[0];if(!file)return;setUploading(true);try{
 if(file.size>50_000_000||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP below 50 MB');
 const img=await createImageBitmap(file),scale=Math.min(1,4096/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));img.close();if(!blob)throw Error('Image conversion failed');
 const path=activeId+'/'+uid()+'.webp';await read(db.storage.from('battlemap-assets').upload(path,blob,{contentType:'image/webp'}));
 try{await read(db.from('battle_maps').insert({campaign_id:activeId,folder_id:folder,name:file.name.replace(/\.[^.]+$/,''),storage_path:path,width:canvas.width,height:canvas.height,grid_size:70}))}catch(err){await db.storage.from('battlemap-assets').remove([path]);throw err}
 await refreshMaps();}catch(e){fail(e)}finally{setUploading(false);e.target.value=''}}
 async function publishMap(id){try{await read(db.from('campaigns').update({active_map_id:id}).eq('id',activeId));setCamp(x=>({...x,active_map_id:id}));await refreshMaps()}catch(e){fail(e)}}
 async function addToken(){if(!selectedMap)return;try{
  const ch=characters.find(c=>c.user_id===tokenOwner);
  await read(db.from('map_tokens').insert({
   campaign_id:activeId,map_id:selectedMap,name:newToken.trim()||ch?.name||'Token',
   owner_id:tokenOwner||null,character_id:ch?.id||null,
   image_path:ch?.token_path||null,x:1,y:1
  }));refreshTokens();
 }catch(e){fail(e)}}
 async function moveToken(t,x,y){try{await read(db.from('map_tokens').update({x,y}).eq('id',t.id));refreshTokens()}catch(e){fail(e)}}
 async function resizeToken(t,spanX,spanY){
  if(!isDM)return;
  try{await read(db.from('map_tokens').update({span_x:spanX,span_y:spanY}).eq('id',t.id))}
  catch(e){fail(e)}finally{await refreshTokens()}
 }
 async function removeToken(t){
  if(!isDM)return;
  try{await read(db.from('map_tokens').delete().eq('id',t.id));await refreshTokens()}
  catch(e){fail(e)}
 }
 const campaignTabs=['sheet',...(isDM?['designer','maps']:[]),'tabletop'];
 if(!configured())return <div className="center"><h1>Tabletop Forge</h1><p>Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel.</p></div>;
 if(!authReady)return <div className="center">Loading…</div>;
 if(!session)return <div className="auth center"><h1>⚔ Tabletop Forge</h1><p>Campaigns, character sheets, battlemaps and dice — one table.</p><form onSubmit={async e=>{e.preventDefault();try{await read(db.auth.signInWithOtp({email,emailRedirectTo:location.origin}));setSent(true)}catch(err){fail(err)}}}><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><button>Send sign-in link</button></form>{sent&&<p>Check your email for the sign-in link.</p>}{error&&<p className="error">{error}</p>}</div>;
 return <div className={'app '+(sidebarOpen?'':'collapsed')}>
 <aside className="sidebar" aria-label="Campaign and page navigation">
  <button type="button" className="rail-menu-toggle" aria-label={sidebarOpen?'Collapse campaign menu':'Expand campaign menu'}
   aria-expanded={sidebarOpen} title={sidebarOpen?'Collapse sidebar':'Open sidebar'}
   onClick={()=>setSidebarOpen(value=>!value)}>☰</button>
  <div className="sidebar-inner">
   <div className="brand">⚔ Tabletop Forge</div>
   <div className="muted small sidebar-account">{session.user.email}</div>
   <h3>Campaigns</h3>
   {campaigns.map(c=><button type="button" className={'nav campaign-nav '+(activeId===c.id?'active':'')} key={c.id}
     onClick={()=>{setActiveId(c.id);setSidebarOpen(false)}}>
     <span className="campaign-nav-name">{c.name} {roles[c.id]==='dm'?'★':''}</span>
     {activeId===c.id&&<span className="muted tiny">{isDM?'Game master':'Player'} · {members.length} member(s)</span>}
    </button>)}
   {camp&&<div className="sidebar-pages">
    <h3>Campaign pages</h3>
    {campaignTabs.map(page=><button type="button" key={page}
     className={'nav sidebar-page '+(tab===page?'active':'')}
     onClick={()=>{setTab(page);setSidebarOpen(false)}}>
     {page==='sheet'?'▤ Character sheet':page==='designer'?'▦ Sheet designer':page==='maps'?'▧ Map library':'▥ Tabletop'}
    </button>)}
   </div>}
   <div className="sidebar-divider"/>
   <form onSubmit={create} className="stack">
    <input required maxLength={100} placeholder="New campaign name" value={createName} onChange={e=>setCreateName(e.target.value)}/>
    <button disabled={busy}>+ Create campaign</button>
   </form>
   <form onSubmit={join} className="stack">
    <input required placeholder="Invitation code" value={joinCode} onChange={e=>setJoinCode(e.target.value)}/>
    <button disabled={busy} className="secondary">Join campaign</button>
   </form>
   <button className="secondary logout" onClick={()=>db.auth.signOut()}>Sign out</button>
  </div>
 </aside>
 <main>
 {error&&<div className="error alert" onClick={()=>setError('')}>{error} ✕</div>}
 {camp&&<>
 <div className="workarea"><div className="primary">
 {tab==='sheet'&&<section className="panel page-panel"><div className="heading"><div className="character-heading">
 <Artwork db={db} path={character?.portrait_path} alt={character?.name||'Character'} className="character-portrait"/>
 <div><h2>{character?.name||'Character'}</h2><span className="muted small">{saveState}</span></div></div>
 <div className="tools">
 {isDM&&characters.length>0&&<select aria-label="Open a player character sheet as DM" value=""
   onChange={e=>{if(e.target.value)openPlayerCharacter(e.target.value,null)}}>
   <option value="">Open player sheet…</option>
   {characters.map(ch=><option key={ch.id} value={ch.id}>{ch.name||'Unnamed Character'}</option>)}
 </select>}
 <button className="secondary" onClick={()=>setArtStudio(true)}>🎨 Create token / portrait</button>
 </div></div><div className="tabs">{camp.sheet_template.tabs.map(t=><button key={t.id} className={sheetTab===t.id?'selected':''} onClick={()=>setSheetTab(t.id)}>{t.name}</button>)}</div><div className="fields">{(camp.sheet_template.tabs.find(t=>t.id===sheetTab)||camp.sheet_template.tabs[0])?.fields.map(f=><div className={'field span'+(f.span||1)} key={f.id}><label>{f.label}</label>{f.type==='roll'?<button className="rollbtn" onClick={()=>roll(f.formula||'1d20',f.label)}>🎲 {f.label} <small>{f.formula}</small></button>:f.type==='inventory'?<Inventory field={f} value={character?.field_values?.[f.id]||[]} onChange={v=>updateField(f.id,v)}/>:f.type==='checkbox'?<input type="checkbox" checked={!!character?.field_values?.[f.id]} onChange={e=>updateField(f.id,e.target.checked)}/>:f.type==='textarea'?<textarea value={character?.field_values?.[f.id]??''} onChange={e=>updateField(f.id,e.target.value)}/>:<input type={f.type==='number'?'number':'text'} value={character?.field_values?.[f.id]??D(f)} onChange={e=>updateField(f.id,e.target.value)} />}</div>)}</div></section>}
 {tab==='designer'&&isDM&&<section className="panel page-panel"><div className="heading"><h2>Visual sheet designer</h2><button disabled={busy} onClick={saveTemplate}>Save template</button></div><p className="muted">Drag fields to reorder them. Each campaign member keeps their own saved values.</p><div className="tabs">{template?.tabs.map(t=><button key={t.id} className={sheetTab===t.id?'selected':''} onClick={()=>setSheetTab(t.id)}>{t.name}</button>)}<button onClick={()=>{const name=prompt('New tab name');if(name?.trim())changeTemplate(t=>t.tabs.push({id:'tab_'+uid().slice(0,8),name:name.trim(),fields:[]}))}}>+ Tab</button></div><Designer template={template} tabId={sheetTab} changeTemplate={changeTemplate}/></section>}
 {tab==='maps'&&isDM&&<section className="panel page-panel"><div className="heading"><h2>Map library</h2><label className="button">+ Upload map <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadMap}/></label></div>{uploading&&<p>Compressing and uploading…</p>}<div className="library"><div><button className={'nav '+(!folder?'active':'')} onClick={()=>setFolder(null)}>All maps</button>{folders.map(f=><button key={f.id} className={'nav '+(folder===f.id?'active':'')} style={{paddingLeft:f.parent_id?26:10}} onClick={()=>setFolder(f.id)}>📁 {f.name}</button>)}<form className="stack" onSubmit={addFolder}><input required placeholder="Folder name" value={newFolder} onChange={e=>setNewFolder(e.target.value)}/><button className="secondary">+ Folder</button></form></div><div className="mapcards">{maps.filter(m=>m.folder_id===folder).map(m=><article className="mapcard" key={m.id} onClick={()=>{setSelectedMap(m.id);setTab('tabletop')}}>{urls[m.id]?<img src={urls[m.id]}/>:<div className="placeholder">Map</div>}<strong>{m.name}</strong><small>{m.width} × {m.height}</small></article>)}</div></div></section>}
 {tab==='tabletop'&&<section className="panel tabletop-panel map-only-panel">
  {activeMap?<Board db={db} map={activeMap} url={urls[activeMap.id]} tokens={tokens}
   user={user} isDM={isDM} move={moveToken} remove={removeToken}
   onNpcDrop={placeNpc} onTokenEdit={openTokenSheet} resize={resizeToken}
   scale={mapZoom} setScale={setMapZoom} selectedId={selectedTokenId} setSelectedId={setSelectedTokenId}/>
  :<div className="empty-tabletop">
    <p>{isDM?'No map selected. Upload a map to get started.':'The DM has not published a map yet.'}</p>
    {isDM&&<button type="button" onClick={()=>setTab('maps')}>Open map library</button>}
   </div>}
 </section>}
 </div><TabletopSidebar
 db={db} panel={rightTab} onPanelChange={setRightTab} isDM={isDM} user={user}
 messages={msgs} characters={characters} members={members} tokens={tokens}
 selectedToken={selectedToken} onSelectToken={setSelectedTokenId}
 onOpenToken={openTokenSheet} onResizeToken={resizeToken}
 chat={chat} onChatChange={setChat} onSendChat={sendChat}
 npcs={npcs} npcFolders={npcFolders}
 onNewNpcFolder={makeNpcFolder} onNewNpc={makeNpc}
 onEditNpc={n=>setNpcEditor({kind:'template',data:n})}
 onMoveNpc={moveNpcFolder} onPlaceNpc={id=>placeNpc(id)}
 activeMap={activeMap} maps={maps} selectedMap={selectedMap} onSelectMap={id=>{setSelectedMap(id);setTab('tabletop')}}
 publishedMapId={camp.active_map_id} onPublishMap={publishMap}
 onOpenMapLibrary={()=>setTab('maps')}
 newToken={newToken} onChangeTokenName={setNewToken}
 tokenOwner={tokenOwner} onChangeTokenOwner={setTokenOwner} onAddToken={addToken}
 mapZoom={mapZoom} onChangeZoom={setMapZoom}
 onCopyInvite={async()=>{try{await navigator.clipboard.writeText(location.origin+'/?join='+camp.invite_code);setSaveState('Invite link copied')}catch(e){fail(e)}}}
 onNavigate={setTab} onCreatePortrait={()=>{setTab('sheet');setArtStudio(true)}}
 campaignName={camp.name}
 /></div></>}
 </main>
 {artStudio&&character&&<TokenStudio db={db} campaignId={activeId} userId={user}
  mode="players" onSave={savePlayerArtwork} onClose={()=>setArtStudio(false)}/>}
 {characterEditor&&isDM&&<CharacterEditor
  db={db} campaignId={activeId} viewerId={user}
  record={characterEditor.data} template={camp?.sheet_template}
  onSaved={afterPlayerSheetSaved} onClose={()=>setCharacterEditor(null)}
  onRoll={(expression,label)=>roll(expression,label,null)}/>}
 {npcEditor&&isDM&&<NpcEditor db={db} campaignId={activeId} userId={user}
  record={npcEditor} template={camp?.sheet_template}
  onSave={saveNpc} onSaveAsTemplate={async draft=>{
    await read(db.from('npc_templates').insert({
     campaign_id:activeId,name:draft.name.trim(),
     field_values:draft.values,portrait_path:draft.portraitPath,token_path:draft.tokenPath
    }));
    await refreshNpcs();
   }} onClose={()=>setNpcEditor(null)}
  onRoll={(expression,label)=>roll(expression,label,null)}/>}
 </div>;
}
function configured(){return !!db}
function Inventory({field,value,onChange}){const cols=field.columns||['Item','Qty','Notes'];return <div className="inventory"><div className="invrow">{cols.map(c=><b key={c}>{c}</b>)}</div>{(Array.isArray(value)?value:[]).map((row,i)=><div className="invrow" key={i}>{cols.map(c=><input key={c} aria-label={c} value={row[c]||''} onChange={e=>onChange(value.map((r,j)=>j===i?{...r,[c]:e.target.value}:r))}/>)}<button className="secondary" onClick={()=>onChange(value.filter((_,j)=>j!==i))}>×</button></div>)}<button className="secondary" onClick={()=>onChange([...value,{}])}>+ Item</button></div>}
function Designer({template,tabId,changeTemplate}){const t=template?.tabs.find(x=>x.id===tabId)||template?.tabs[0],drag=useRef(null);if(!t)return null;
 const update=(id,key,value)=>changeTemplate(x=>{const f=x.tabs.find(y=>y.id===t.id)?.fields.find(y=>y.id===id);if(f)f[key]=value});
 return <><div className="tools"><input aria-label="Tab name" value={t.name} onChange={e=>changeTemplate(x=>x.tabs.find(y=>y.id===t.id).name=e.target.value)}/><button className="secondary" onClick={()=>{if(template.tabs.length<2)return alert('Keep at least one tab');if(confirm('Delete tab and its fields?'))changeTemplate(x=>x.tabs=x.tabs.filter(y=>y.id!==t.id))}}>Delete tab</button><select id="newfieldtype" defaultValue="text"><option value="text">Text</option><option value="number">Number</option><option value="textarea">Notes</option><option value="checkbox">Checkbox</option><option value="roll">Dice button</option><option value="inventory">Inventory</option></select><button onClick={()=>{const type=document.getElementById('newfieldtype').value;changeTemplate(x=>x.tabs.find(y=>y.id===t.id).fields.push({id:'field_'+uid().slice(0,8),label:'New '+type,type,span:1,...(type==='inventory'?{columns:['Item','Qty','Notes']}:type==='roll'?{formula:'1d20'}:{})}))}}>+ Add field</button></div><div className="designer-grid">{t.fields.map((f,i)=><div className="designfield" draggable onDragStart={()=>drag.current=i} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const from=drag.current;if(from==null||from===i)return;changeTemplate(x=>{const a=x.tabs.find(y=>y.id===t.id).fields;a.splice(i,0,a.splice(from,1)[0])});drag.current=null}} key={f.id}><span className="muted">⠿ Drag to reorder</span><label>Field label<input value={f.label} onChange={e=>update(f.id,'label',e.target.value)}/></label><div className="tools"><label>Width <select value={f.span||1} onChange={e=>update(f.id,'span',Number(e.target.value))}><option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option></select></label><span className="muted">{f.type}</span><button className="secondary" onClick={()=>changeTemplate(x=>x.tabs.find(y=>y.id===t.id).fields=x.tabs.find(y=>y.id===t.id).fields.filter(y=>y.id!==f.id))}>Delete</button></div>{f.type==='roll'&&<label>Dice formula<input value={f.formula||''} onChange={e=>update(f.id,'formula',e.target.value)} placeholder="1d20+@{strength}"/></label>}{f.type==='inventory'&&<label>Columns (comma separated)<input value={(f.columns||[]).join(', ')} onChange={e=>update(f.id,'columns',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))}/></label>}</div>)}</div></>}


function Board({db,map,url,tokens,user,isDM,move,remove,resize,onNpcDrop,onTokenEdit,scale,setScale,selectedId,setSelectedId}){
 const[preview,setPreview]=useState({});
 const boardRef=useRef(null),viewportRef=useRef(null),drag=useRef(null),resizeDrag=useRef(null),zoomRef=useRef(scale);
 useEffect(()=>{zoomRef.current=scale},[scale]);
 useEffect(()=>{setPreview({})},[tokens]);
 useEffect(()=>{setSelectedId(null)},[map.id]);
 useEffect(()=>{if(selectedId&&!tokens.some(t=>t.id===selectedId))setSelectedId(null)},[selectedId,tokens]);
 useEffect(()=>{
  if(!selectedId||!viewportRef.current)return;
  const token=tokens.find(t=>t.id===selectedId);
  if(!token)return;
  const node=viewportRef.current,cell=map.grid_size*scale;
  const x=(Number(token.x)+Number(token.span_x??1)/2)*cell;
  const y=(Number(token.y)+Number(token.span_y??1)/2)*cell;
  const visibleLeft=node.scrollLeft,visibleRight=visibleLeft+node.clientWidth;
  const visibleTop=node.scrollTop,visibleBottom=visibleTop+node.clientHeight;
  if(x<visibleLeft+32||x>visibleRight-32)node.scrollLeft=Math.max(0,x-node.clientWidth/2);
  if(y<visibleTop+32||y>visibleBottom-32)node.scrollTop=Math.max(0,y-node.clientHeight/2);
  node.focus({preventScroll:true});
 },[selectedId,map.id]);
 useEffect(()=>{
  function handleDelete(e){
   if(!isDM||!selectedId||e.key!=='Delete'||e.defaultPrevented||e.repeat)return;
   const el=e.target;
   if(el instanceof Element && el.closest('input,textarea,select,button,[contenteditable="true"],[role="textbox"]'))return;
   if(document.querySelector('.modal-backdrop'))return;
   const t=tokens.find(x=>x.id===selectedId);
   if(!t)return;
   e.preventDefault();e.stopPropagation();setSelectedId(null);remove(t);
  }
  document.addEventListener('keydown',handleDelete);
  return()=>document.removeEventListener('keydown',handleDelete);
 },[selectedId,isDM,tokens,remove]);
 useEffect(()=>{
  const node=viewportRef.current;if(!node)return;
  const wheel=e=>{
   if(!e.ctrlKey)return;
   e.preventDefault();e.stopPropagation();
   const stops=[.25,.35,.5,.7,1,1.5,2,3],before=zoomRef.current;
   const nearest=stops.reduce((best,value,i)=>Math.abs(value-before)<Math.abs(stops[best]-before)?i:best,0);
   const next=stops[Math.max(0,Math.min(stops.length-1,nearest+(e.deltaY<0?1:-1)))];
   if(next===before)return;
   const rect=node.getBoundingClientRect(),vx=e.clientX-rect.left,vy=e.clientY-rect.top;
   const wx=(node.scrollLeft+vx)/before,wy=(node.scrollTop+vy)/before;
   zoomRef.current=next;setScale(next);
   requestAnimationFrame(()=>{
    node.scrollLeft=Math.max(0,wx*next-vx);
    node.scrollTop=Math.max(0,wy*next-vy);
   });
  };
  node.addEventListener('wheel',wheel,{passive:false});
  return()=>node.removeEventListener('wheel',wheel);
 },[]);
 const pos=e=>{
  const rect=boardRef.current.getBoundingClientRect(),cell=zoomRef.current*map.grid_size;
  return{
   x:Math.max(0,Math.min(1000,Math.floor((e.clientX-rect.left)/cell))),
   y:Math.max(0,Math.min(1000,Math.floor((e.clientY-rect.top)/cell)))
  };
 };
 const snapSize=(v)=>Math.max(.25,Math.min(12,Math.round(v*4)/4));
 function dropNpc(e){e.preventDefault();if(!isDM)return;
  const npcId=e.dataTransfer.getData('application/x-forge-npc');
  if(npcId){const p=pos(e);onNpcDrop(npcId,p.x,p.y)}
 }
 return <>
  <div className="mapscroll" ref={viewportRef} aria-label="Battlemap viewport" tabIndex={0}>
   <div ref={boardRef} className="board"
    onPointerDown={e=>{if(e.target===e.currentTarget||e.target.classList.contains('gridlines'))setSelectedId(null)}}
    onDragOver={e=>{if(isDM)e.preventDefault()}}
    onDrop={dropNpc}
    style={{width:map.width*scale,height:map.height*scale,backgroundImage:url?'url('+JSON.stringify(url)+')':undefined,backgroundSize:'100% 100%'}}>
    <div className="gridlines" style={{backgroundSize:(map.grid_size*scale)+'px '+(map.grid_size*scale)+'px'}}/>
    {tokens.filter(t=>isDM||t.visible).map(t=>{
     const p={...t,...preview[t.id]},canMove=isDM||t.owner_id===user;
     const cell=map.grid_size*scale,spanX=Number(p.span_x??1),spanY=Number(p.span_y??1);
     return <div key={t.id} className={'token '+(t.image_path?'token-image':'')+(selectedId===t.id?' token-selected':'')}
      style={{
       left:Number(p.x)*cell,top:Number(p.y)*cell,width:cell*spanX,height:cell*spanY,
       opacity:t.visible?1:.55,cursor:canMove?'grab':'default'
      }}
      title={t.name+(isDM?' · Alt + double-click to edit sheet':'')}
      onDoubleClick={e=>{if(e.altKey&&isDM){e.preventDefault();e.stopPropagation();onTokenEdit(t)}}}
      onPointerDown={e=>{
       e.stopPropagation();setSelectedId(t.id);
       viewportRef.current?.focus({preventScroll:true});
       if(!canMove||e.altKey||e.button!==0)return;
       e.currentTarget.setPointerCapture(e.pointerId);drag.current=t.id;
      }}
      onPointerMove={e=>{
       if(drag.current===t.id){const next=pos(e);setPreview(old=>({...old,[t.id]:{...old[t.id],x:next.x,y:next.y}}))}
      }}
      onPointerUp={e=>{
       if(drag.current!==t.id)return;drag.current=null;
       const next=pos(e);
       if(next.x!==t.x||next.y!==t.y){
        setPreview(old=>({...old,[t.id]:{...old[t.id],x:next.x,y:next.y}}));
        move(t,next.x,next.y);
       }
      }}
      onPointerCancel={()=>{drag.current=null;setPreview({})}}>
      {t.image_path?<Artwork db={db} path={t.image_path} alt={t.name} className="token-art"/>:
       <span className="token-placeholder">{t.name.slice(0,2).toUpperCase()}</span>}
      {isDM&&selectedId===t.id&&<div className="token-resize-handle" role="button"
        aria-label={'Resize '+t.name} title="Drag to change token footprint"
        onPointerDown={e=>{
         e.stopPropagation();e.preventDefault();
         if(e.button!==0)return;
         resizeDrag.current={id:t.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,
          w:Number(t.span_x??1),h:Number(t.span_y??1)};
         e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e=>{
         const d=resizeDrag.current;if(!d||d.id!==t.id||d.pointerId!==e.pointerId)return;
         const cellWidth=map.grid_size*zoomRef.current;
         const w=snapSize(d.w+(e.clientX-d.startX)/cellWidth),
           h=snapSize(d.h+(e.clientY-d.startY)/cellWidth);
         setPreview(old=>({...old,[t.id]:{...old[t.id],span_x:w,span_y:h}}));
        }}
        onPointerUp={e=>{
         const d=resizeDrag.current;if(!d||d.id!==t.id||d.pointerId!==e.pointerId)return;
         resizeDrag.current=null;
         const cellWidth=map.grid_size*zoomRef.current,
          w=snapSize(d.w+(e.clientX-d.startX)/cellWidth),
          h=snapSize(d.h+(e.clientY-d.startY)/cellWidth);
         if(w!==d.w||h!==d.h){
          setPreview(old=>({...old,[t.id]:{...old[t.id],span_x:w,span_y:h}}));
          resize(t,w,h);
         }
        }}
        onPointerCancel={()=>{resizeDrag.current=null;setPreview({})}}>
       <span aria-hidden="true">↘</span>
      </div>}
     </div>;
    })}
   </div>
  </div>
 </>;
}
createRoot(document.getElementById('root')).render(<App/>);
