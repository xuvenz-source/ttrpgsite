import React,{useEffect,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import{createClient}from'@supabase/supabase-js';
import './style.css';
import PersonalTokenLibrary from './PersonalTokenLibrary.jsx';
import Artwork from './Artwork.jsx';
import Bestiary from './Bestiary.jsx';
import NpcEditor from './NpcEditor.jsx';
import CharacterEditor from './CharacterEditor.jsx';
import TabletopSidebar from './TabletopSidebar.jsx';
import {TokenMonitors} from './TokenMonitors.jsx';
import ResourceField from './ResourceField.jsx';
import {DEFAULT_BINDINGS,normalizeBindings,normaliseHotbar,lookupAction,isInputFocused,MacroHotbar} from './TabletopControls.jsx';
import TokenQuickEdit from './TokenQuickEdit.jsx';
import {AuthGate,CampaignHub} from './Welcome.jsx';

const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
const uid=()=>crypto.randomUUID();
const message=e=>e?.message||String(e);
const read=async(q)=>{const{data,error}=await q;if(error)throw error;return data};
const D=(field)=>field.type==='number'?0:field.type==='inventory'?[]:'';
const stamp=s=>new Date(s).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const defaults=[{id:'main',name:'Character',fields:[{id:'character_name',label:'Name',type:'text',span:2},{id:'strength',label:'Strength',type:'number',span:1},{id:'dexterity',label:'Dexterity',type:'number',span:1},{id:'hp',label:'Hit points',type:'number',span:1},{id:'attack',label:'Attack',type:'roll',formula:'1d20+@{strength}',span:1}]},{id:'inventory',name:'Inventory',fields:[{id:'items',label:'Equipment',type:'inventory',columns:['Item','Qty','Weight','Notes'],span:3}]}];
class AppErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={failed:false}}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error,info){console.error('Tabletop Forge UI error',error,info)}
 render(){
  if(this.state.failed)return <div className="welcome-screen">
   <section className="welcome-shell welcome-auth">
    <h2>A tabletop window encountered an error</h2>
    <p className="muted">Your campaign data is still saved. Reloading will reopen Tabletop Forge.</p>
    <button type="button" onClick={()=>location.reload()}>Reload Tabletop Forge</button>
   </section>
  </div>;
  return this.props.children;
 }
}
function QuickEditBoundary({children,onClose}){
 return <LocalErrorBoundary onClose={onClose}>{children}</LocalErrorBoundary>;
}
class LocalErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={failed:false}}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error,info){console.error('Token quick-edit error',error,info)}
 render(){
  if(!this.state.failed)return this.props.children;
  return <div className="modal-backdrop">
   <section className="modal quick-token-modal" role="dialog" aria-modal="true">
    <h2>Could not open token controls</h2>
    <p className="muted small">The tabletop is still available. Close this window and try again.</p>
    <button type="button" onClick={this.props.onClose}>Close</button>
   </section>
  </div>;
 }
}
function App(){
 const[session,setSession]=useState(null),[authReady,setAuthReady]=useState(false),[email,setEmail]=useState(''),[sent,setSent]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const[campaigns,setCampaigns]=useState([]),[campaignsLoading,setCampaignsLoading]=useState(true),[roles,setRoles]=useState({}),[activeId,setActiveId]=useState(''),[camp,setCamp]=useState(null),[members,setMembers]=useState([]),[characters,setCharacters]=useState([]),[character,setCharacter]=useState(null);
 const[createName,setCreateName]=useState(''),[joinCode,setJoinCode]=useState(new URLSearchParams(location.search).get('join')||'');
 const[tab,setTab]=useState('sheet'),[sheetTab,setSheetTab]=useState('main'),[template,setTemplate]=useState(null),[saveState,setSaveState]=useState('Saved');
 const[folders,setFolders]=useState([]),[maps,setMaps]=useState([]),[folder,setFolder]=useState(null),[selectedMap,setSelectedMap]=useState(''),[urls,setUrls]=useState({}),[tokens,setTokens]=useState([]);
 const[artStudio,setArtStudio]=useState(false),[npcEditor,setNpcEditor]=useState(null),[characterEditor,setCharacterEditor]=useState(null);
 const[rightTab,setRightTab]=useState('chat'),[mapZoom,setMapZoom]=useState(.7),[selectedTokenId,setSelectedTokenId]=useState(null);
 const[mapCalibrationPreview,setMapCalibrationPreview]=useState(null);
 const[npcs,setNpcs]=useState([]),[npcFolders,setNpcFolders]=useState([]);
 const[monitorValues,setMonitorValues]=useState({});
 const[quickEditToken,setQuickEditToken]=useState(null);
 const[pendingQuickTokens,setPendingQuickTokens]=useState({});
 const quickWritePatches=useRef(new Map());
 const monitorRequest=useRef(0);
 const[bindings,setBindings]=useState(()=>normalizeBindings(DEFAULT_BINDINGS));
 const[hotbarSlots,setHotbarSlots]=useState(()=>normaliseHotbar([]));
 const[hotbarVisible,setHotbarVisible]=useState(true);
 // Keep the most recent local destination authoritative until the server acknowledges it.
 const movementPending=useRef(new Map()),tokenRefreshSeq=useRef(0),lastKeyboardMove=useRef(0);
 const tokenContextRef=useRef({mapId:'',campaignId:''});
 const[msgs,setMsgs]=useState([]),[chat,setChat]=useState(''),[newFolder,setNewFolder]=useState(''),[uploading,setUploading]=useState(false),[newToken,setNewToken]=useState('Token'),[tokenOwner,setTokenOwner]=useState('');
 const saveTimer=useRef(null),user=session?.user?.id,isDM=roles[activeId]==='dm';
 const activeMap=maps.find(x=>x.id===selectedMap);
 const displayedMap=activeMap&&mapCalibrationPreview?.mapId===activeMap.id
  ?{...activeMap,...mapCalibrationPreview}:activeMap;
 tokenContextRef.current={mapId:selectedMap,campaignId:activeId};
 const selectedToken=tokens.find(x=>x.id===selectedTokenId)||null;
 function fail(e){setError(message(e));console.error(e)}
 async function fetchCampaigns(prefer){if(!db||!user)return;
  setCampaignsLoading(true);
  try{const [cs,ms]=await Promise.all([read(db.from('campaigns').select('*').order('created_at',{ascending:false})),read(db.from('campaign_members').select('campaign_id,role').eq('user_id',user))]);
    setCampaigns(cs);setRoles(Object.fromEntries(ms.map(x=>[x.campaign_id,x.role])));
    setActiveId(old=>prefer&&cs.some(c=>c.id===prefer)?prefer:cs.some(c=>c.id===old)?old:'');
  }catch(e){fail(e)}finally{setCampaignsLoading(false)}
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
   const npcValues=await read(db.rpc('get_npc_token_values',{p_token:t.id}));
   setNpcEditor({kind:'token',data:{...t,npc_values:npcValues||{}}});
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
    name:draft.name.trim(),field_values:draft.values,portrait_path:draft.portraitPath,token_path:draft.tokenPath,
    npc_bars_public:draft.barsPublic
   }).eq('id',npcEditor.data.id));
   await refreshNpcs();
  }else{
   await read(db.from('map_tokens').update({
    name:draft.name.trim(),npc_values:draft.values,image_path:draft.tokenPath,
    npc_bars_public:draft.barsPublic
   }).eq('id',npcEditor.data.id));
   await refreshTokens();
   await refreshMonitors();
  }
 }
 async function placeNpc(npcId,x=1,y=1){
  const npc=npcs.find(n=>n.id===npcId);
  if(!npc||!selectedMap||!isDM)return;
  try{
   await read(db.from('map_tokens').insert({
    campaign_id:activeId,map_id:selectedMap,name:npc.name,
    npc_template_id:npc.id,npc_values:structuredClone(npc.field_values||{}),
    npc_bars_public:npc.npc_bars_public,
    image_path:npc.token_path||null,owner_id:null,x,y
   }));
   await refreshTokens();
   await refreshMonitors();
  }catch(e){fail(e)}
 }
 async function placeCharacterOnMap(characterId,x,y){
  const ch=characters.find(c=>c.id===characterId);
  if(!ch||!selectedMap||!activeId)return;
  if(!isDM&&ch.user_id!==user){fail('You can only place your own character.');return}
  if(!isDM&&camp?.active_map_id!==selectedMap){
   fail('The DM needs to publish this map before players can place tokens.');return;
  }
  try{
   const created=await read(db.from('map_tokens').insert({
    campaign_id:activeId,map_id:selectedMap,character_id:ch.id,
    owner_id:ch.user_id,name:ch.name||'Character',image_path:ch.token_path||null,
    x,y
   }).select('id').single());
   await refreshTokens();
   setSelectedTokenId(created.id);
  }catch(e){fail(e)}
 }
 async function dropExistingUnit(tokenId,x,y){
  const t=tokens.find(t=>t.id===tokenId);
  if(!t||t.map_id!==selectedMap)return;
  if(!isDM&&t.owner_id!==user){fail('You cannot move a token you do not control.');return}
  if(t.x!==x||t.y!==y)await moveToken(t,x,y);
  setSelectedTokenId(t.id);
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
 async function refreshMonitors(){
  const request=++monitorRequest.current;
  if(!selectedMap||!activeId)return setMonitorValues({});
  try{
   const rows=await read(db.rpc('get_token_monitor_values',{p_map:selectedMap}));
   if(request===monitorRequest.current){
    const latest=Object.fromEntries((rows||[]).map(row=>[row.token_id,row.fields||{}]));
    // Server reads can finish before a background edit. Keep local writes visible.
    for(const pending of quickWritePatches.current.values()){
     for(const id of pending.affected){
      if(latest[id])latest[id]={...latest[id],...pending.patch};
     }
    }
    setMonitorValues(latest);
   }
  }catch(e){if(request===monitorRequest.current)console.error('Could not refresh token monitors',e)}
 }
 async function refreshTokens(){
  const request=++tokenRefreshSeq.current;
  const mapId=selectedMap,campaignId=activeId;
  if(!mapId){setTokens([]);return}
  try{
   const rows=await read(db.from('map_tokens').select(
    'id,campaign_id,map_id,owner_id,name,color,x,y,visible,updated_at,npc_template_id,character_id,image_path,span_x,span_y,npc_bars_public'
   ).eq('map_id',mapId));
   // Ignore older requests, including requests started before switching maps.
   if(request!==tokenRefreshSeq.current||
      tokenContextRef.current.mapId!==mapId||
      tokenContextRef.current.campaignId!==campaignId)return;
   // Realtime snapshots may lag behind the newest keyboard or drag destination.
   // Merge the latest local destination until its database write is confirmed.
   setTokens(rows.map(token=>{
    const pending=movementPending.current.get(token.id);
    return pending&&pending.mapId===mapId&&pending.campaignId===campaignId
     ?{...token,x:pending.x,y:pending.y}:token;
   }));
  }catch(e){
   if(request===tokenRefreshSeq.current)fail(e);
  }
 }
 useEffect(()=>{if(!db){setAuthReady(true);return}db.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true)});const{data}=db.auth.onAuthStateChange((_,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);
 useEffect(()=>{if(user)fetchCampaigns();else{setCampaigns([]);setActiveId('')}},[user]);
 useEffect(()=>{if(activeId&&user){setCamp(null);setTab('tabletop');setRightTab('chat');setSelectedTokenId(null);setQuickEditToken(null);setPendingQuickTokens({});
  quickWritePatches.current.clear();++monitorRequest.current;setMapCalibrationPreview(null);setFolder(null);setNpcEditor(null);setCharacterEditor(null);setError('');fetchCampaign(activeId)}else if(!activeId){setCamp(null);setCharacter(null);setMaps([]);setTokens([]);setMsgs([]);setMembers([])}},[activeId,user]);
 useEffect(()=>{
  if(!db||!user){setBindings(normalizeBindings(DEFAULT_BINDINGS));setHotbarVisible(true);return}
  let alive=true;
  db.from('tabletop_user_preferences').select('bindings,hotbar_visible').eq('user_id',user).maybeSingle()
   .then(({data,error})=>{
    if(!alive)return;
    if(error){console.error('Could not load keybindings',error);return}
    setBindings(normalizeBindings(data?.bindings||DEFAULT_BINDINGS));
    setHotbarVisible(data?.hotbar_visible!==false);
   });
  return()=>{alive=false};
 },[user]);
 useEffect(()=>{
  if(!db||!user||!activeId){setHotbarSlots(normaliseHotbar([]));return}
  let alive=true;setHotbarSlots(normaliseHotbar([]));
  db.from('tabletop_hotbars').select('slots').eq('user_id',user).eq('campaign_id',activeId).maybeSingle()
   .then(({data,error})=>{
    if(!alive)return;
    if(error){console.error('Could not load hotbar',error);return}
    setHotbarSlots(normaliseHotbar(data?.slots));
   });
  return()=>{alive=false};
 },[user,activeId]);
 useEffect(()=>{if(!db||!activeId)return;const c=db.channel('vtt-'+activeId).on('postgres_changes',{event:'*',schema:'public',table:'chat_messages',filter:'campaign_id=eq.'+activeId},()=>refreshChat()).on('postgres_changes',{event:'*',schema:'public',table:'map_tokens',filter:'campaign_id=eq.'+activeId},()=>{refreshTokens();refreshMonitors()}).on('postgres_changes',{event:'*',schema:'public',table:'campaigns',filter:'id=eq.'+activeId},()=>{fetchCampaign(activeId);refreshMonitors()})
 .on('postgres_changes',{event:'*',schema:'public',table:'npc_templates',filter:'campaign_id=eq.'+activeId},()=>refreshNpcs())
 .on('postgres_changes',{event:'*',schema:'public',table:'battle_maps',filter:'campaign_id=eq.'+activeId},()=>refreshMaps())
 .subscribe();return()=>db.removeChannel(c)},[activeId,selectedMap,user]);
 useEffect(()=>{refreshTokens();refreshMonitors()},[selectedMap,activeId,user]);
 useEffect(()=>{let done=false;Promise.all(maps.map(async x=>{const{data}=await db.storage.from('battlemap-assets').createSignedUrl(x.storage_path,3600);return[x.id,data?.signedUrl||'']})).then(x=>!done&&setUrls(Object.fromEntries(x)));return()=>{done=true}},[maps]);

 useEffect(()=>{
  if(!user||!camp||tab!=='tabletop')return;
  function onKey(e){
   if(e.defaultPrevented||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||e.isComposing)return;
   if(document.querySelector('.modal-backdrop')||isInputFocused(e.target))return;
   if(e.target instanceof Element&&e.target.closest('.keybind-editor,.hotbar-editor'))return;
   const action=lookupAction(bindings,e.code);
   if(!action)return;
   const isMove=['up','down','left','right'].includes(action);
   if(e.repeat&&!isMove)return;
   if(isMove){
    if(!selectedToken||(!isDM&&selectedToken.owner_id!==user))return;
    if(e.repeat&&performance.now()-lastKeyboardMove.current<115){e.preventDefault();return}
    lastKeyboardMove.current=performance.now();
    e.preventDefault();
    const delta={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[action];
    moveSelectedByKey(delta[0],delta[1]);
   }else if(action==='sheet'){
    e.preventDefault();
    if(isDM&&selectedToken)openTokenSheet(selectedToken);
    else setTab('sheet');
   }else if(action==='hotbar'){
    e.preventDefault();changeHotbarVisibility(!hotbarVisible).catch(fail);
   }else if(action.startsWith('slot')){
    e.preventDefault();useHotbarSlot(Number(action.slice(4))-1);
   }
  }
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
 },[user,activeId,selectedMap,tab,camp,bindings,hotbarSlots,hotbarVisible,selectedTokenId,tokens,isDM,character]);
 useEffect(()=>()=>clearTimeout(saveTimer.current),[]);
 async function saveMyKeybindings(next){
  if(!user)throw Error('Sign in to save your keybindings.');
  const cleaned=normalizeBindings(next);
  await read(db.from('tabletop_user_preferences')
   .upsert({user_id:user,bindings:cleaned,hotbar_visible:hotbarVisible},{onConflict:'user_id'}));
  setBindings(cleaned);
 }
 async function changeHotbarVisibility(visible){
  if(!user)return;
  await read(db.from('tabletop_user_preferences')
   .upsert({user_id:user,bindings,hotbar_visible:visible},{onConflict:'user_id'}));
  setHotbarVisible(visible);
 }
 async function saveMyHotbar(slots){
  if(!user||!activeId)throw Error('Join a campaign before saving a hotbar.');
  const cleaned=normaliseHotbar(slots);
  await read(db.from('tabletop_hotbars')
   .upsert({user_id:user,campaign_id:activeId,slots:cleaned},{onConflict:'user_id,campaign_id'}));
  setHotbarSlots(cleaned);
 }
 async function create(e){e.preventDefault();setBusy(true);try{const id=await read(db.rpc('create_campaign',{p_name:createName.trim()}));setCreateName('');await fetchCampaigns(id)}catch(e){fail(e)}finally{setBusy(false)}}
 async function join(e){e.preventDefault();setBusy(true);try{const id=await read(db.rpc('join_campaign',{p_invite_code:joinCode.trim().toLowerCase()}));setJoinCode('');history.replaceState({},'',location.pathname);await fetchCampaigns(id)}catch(e){fail(e)}finally{setBusy(false)}}
 function updateField(id,value){
  if(!character)return;
  const next={...character,field_values:{...character.field_values,[id]:value}};
  if(id==='character_name')next.name=String(value||'New Character');
  setCharacter(next);
  // Instant, optimistic local monitor update; the server will replicate to others.
  const asNumber=(raw)=>{
   if(raw===null||raw===undefined||raw==='')return null;
   const n=Number(raw);return Number.isFinite(n)?n:null;
  };
  ++monitorRequest.current;
  setMonitorValues(old=>{
   const updated={...old};
   for(const token of tokens){
    if(token.character_id!==character.id||!old[token.id])continue;
    const fields={...old[token.id]};
    const resource=value!==null&&typeof value==='object'&&!Array.isArray(value);
    if(resource){
     const current=asNumber(value.current),max=asNumber(value.max);
     if(current===null)delete fields[id];else fields[id]=current;
     if(max===null)delete fields[id+'__max'];else fields[id+'__max']=max;
    }else{
     const numeric=asNumber(value);
     if(numeric===null)delete fields[id];else fields[id]=numeric;
    }
    updated[token.id]=fields;
   }
   return updated;
  });
  setSaveState('Saving…');clearTimeout(saveTimer.current);
  saveTimer.current=setTimeout(async()=>{
   try{
    await read(db.from('characters').update({field_values:next.field_values,name:next.name}).eq('id',next.id));
    setSaveState('Saved');
   }catch(e){setSaveState('Save failed');fail(e)}
  },200);
}
 async function roll(formula,label='Dice roll',charId=character?.id){try{await read(db.rpc('roll_dice',{p_campaign_id:activeId,p_expression:formula,p_label:label,p_character_id:charId||null}));await refreshChat()}catch(e){fail(e)}}
 async function sendChat(e){e.preventDefault();const raw=chat.trim();if(!raw)return;setChat('');if(/^\/(roll|r)\s+/i.test(raw))return roll(raw.replace(/^\/(roll|r)\s+/i,''),'Dice roll',null);
 if(/^\/macro\s+/i.test(raw)){const label=raw.replace(/^\/macro\s+/i,'').trim().toLowerCase(),field=camp?.sheet_template?.tabs?.flatMap(t=>t.fields).find(f=>f.type==='roll'&&f.label.toLowerCase()===label);if(field)return roll(field.formula||'1d20',field.label);return fail('Macro not found')}
 try{await read(db.from('chat_messages').insert({campaign_id:activeId,user_id:user,body:raw.startsWith('/em ')?'*'+raw.slice(4)+'*':raw}));await refreshChat()}catch(e){fail(e)}}
 function changeTemplate(fn){setTemplate(old=>{const t=structuredClone(old||{tabs:defaults});fn(t);return t})}
 async function linkResourceToToken(field){
  if(!isDM||field?.type!=='resource'||!template)throw Error('Only the DM can link a resource.');
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(field.id))throw Error('Invalid resource field ID');
  const existing=camp?.token_display_config||{playerVisibility:'owner',npcVisibility:'dm',widgets:[]};
  const widgets=Array.isArray(existing.widgets)?existing.widgets:[];
  const found=widgets.some(w=>w.type==='bar'&&w.field===field.id);
  if(!found&&widgets.length>=8)throw Error('The token display already has 8 elements. Remove one in Settings first.');
  const newWidget={id:'resource_'+field.id,type:'bar',label:field.label||'Resource',
    field:field.id,maxField:field.id+'__max',color:'#d94c56',position:'top',icon:'heart',showValue:true};
  const config={...existing,widgets:found?widgets:[...widgets,newWidget]};
  const saved=await read(db.from('campaigns').update({
   sheet_template:template,token_display_config:config
  }).eq('id',activeId).select('sheet_template,token_display_config').single());
  setCamp(prev=>({...prev,...saved}));
  setTemplate(saved.sheet_template);
  return found?'This resource is already linked to a token bar.':'Resource and token bar saved together.';
 }
 async function saveTemplate(){setBusy(true);try{await read(db.from('campaigns').update({sheet_template:template}).eq('id',activeId));setCamp(x=>({...x,sheet_template:template}));setSaveState('Template saved')}catch(e){fail(e)}finally{setBusy(false)}}
 async function addFolder(e){e.preventDefault();if(!newFolder.trim())return;try{await read(db.from('map_folders').insert({campaign_id:activeId,parent_id:folder,name:newFolder.trim()}));setNewFolder('');refreshMaps()}catch(e){fail(e)}}
 async function uploadMap(e){const file=e.target.files?.[0];if(!file)return;setUploading(true);try{
 if(file.size>50_000_000||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP below 50 MB');
 const img=await createImageBitmap(file),scale=Math.min(1,4096/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));img.close();if(!blob)throw Error('Image conversion failed');
 const path=activeId+'/'+uid()+'.webp';await read(db.storage.from('battlemap-assets').upload(path,blob,{contentType:'image/webp'}));
 try{await read(db.from('battle_maps').insert({campaign_id:activeId,folder_id:folder,name:file.name.replace(/\.[^.]+$/,''),storage_path:path,width:canvas.width,height:canvas.height,source_width:canvas.width,source_height:canvas.height,grid_size:70}))}catch(err){await db.storage.from('battlemap-assets').remove([path]);throw err}
 await refreshMaps();}catch(e){fail(e)}finally{setUploading(false);e.target.value=''}}
 async function saveQuickFields(fieldIds){
  if(!isDM||!camp)throw Error('Only the DM can configure quick adjustments.');
  const eligible=(camp.sheet_template?.tabs||[]).flatMap(t=>t.fields||[])
   .filter(f=>['number','resource'].includes(f.type)).map(f=>f.id);
  if(!Array.isArray(fieldIds)||fieldIds.length>8||new Set(fieldIds).size!==fieldIds.length
    ||fieldIds.some(id=>!eligible.includes(id)))throw Error('Select up to 8 valid Number or Resource fields.');
  const next=await read(db.from('campaigns').update({token_quick_fields:fieldIds})
   .eq('id',activeId).select('token_quick_fields').single());
  setCamp(previous=>({...previous,token_quick_fields:next.token_quick_fields}));
 }
 function openQuickToken(t){
  if(!t||(!isDM&&t.owner_id!==user))return;
  if(!isDM&&camp?.active_map_id!==t.map_id)return;
  if(quickWritePatches.current.has(t.id))return;
  setQuickEditToken(t);
 }
 function applyQuickTokenChanges(token,changes){
  if(!token||!selectedMap||token.map_id!==selectedMap)return false;
  if(!isDM&&token.owner_id!==user)return false;
  if(quickWritePatches.current.has(token.id)){
   fail('A quick edit to '+token.name+' is still saving. You can edit another token meanwhile.');
   return false;
  }
  const fieldTypes=new Map((camp?.sheet_template?.tabs||[])
   .flatMap(tab=>tab.fields||[]).map(f=>[f.id,f.type]));
  const patch={};
  for(const [id,parts] of Object.entries(changes)){
   if(!['number','resource'].includes(fieldTypes.get(id)))return false;
   if(Object.hasOwn(parts,'current'))patch[id]=parts.current;
   if(Object.hasOwn(parts,'max'))patch[id+'__max']=parts.max;
  }
  const affected=tokens.filter(t=>t.id===token.id||
   (token.character_id&&t.character_id===token.character_id)).map(t=>t.id);
  const before=Object.fromEntries(affected.map(id=>[id,monitorValues[id]]));
  const entry={affected,patch,before};
  const currentCampaign=activeId,currentMap=selectedMap;
  quickWritePatches.current.set(token.id,entry);
  setPendingQuickTokens(old=>({...old,[token.id]:true}));
  ++monitorRequest.current;
  setMonitorValues(old=>{
   const next={...old};
   for(const id of affected)
    if(old[id])next[id]={...old[id],...patch};
   return next;
  });
  // Update any locally open character sheet immediately as well.
  if(token.character_id){
   const merge=record=>{
    if(record?.id!==token.character_id)return record;
    const values={...record.field_values};
    for(const [id,parts] of Object.entries(changes)){
     if(fieldTypes.get(id)==='resource'){
      const previous=values[id];
      values[id]={
       ...(previous&&typeof previous==='object'&&!Array.isArray(previous)
         ?previous:{current:previous??'',max:''}),
       ...parts
      };
     }else if(Object.hasOwn(parts,'current'))values[id]=parts.current;
    }
    return {...record,field_values:values};
   };
   setCharacter(merge);
   setCharacters(old=>old.map(merge));
  }
  // Never hold the modal open for network traffic. One RPC saves every field atomically.
  void db.rpc('apply_token_quick_changes',{p_token:token.id,p_changes:changes})
   .then(({error})=>{
    if(error)throw error;
    if(quickWritePatches.current.get(token.id)!==entry)return;
    quickWritePatches.current.delete(token.id);
    if(activeId===currentCampaign&&selectedMap===currentMap){
     setPendingQuickTokens(old=>{const next={...old};delete next[token.id];return next});
     void quickTokenSaved(token.id).catch(e=>console.error('Could not refresh saved quick edit',e));
    }
   })
   .catch(e=>{
    if(quickWritePatches.current.get(token.id)!==entry)return;
    quickWritePatches.current.delete(token.id);
    if(activeId!==currentCampaign||selectedMap!==currentMap)return;
    ++monitorRequest.current;
    setMonitorValues(old=>{
     const next={...old};
     for(const id of affected){
      if(before[id]===undefined)delete next[id];
      else next[id]=before[id];
     }
     return next;
    });
    setPendingQuickTokens(old=>{const next={...old};delete next[token.id];return next});
    fail('Could not save '+token.name+'\'s quick changes. Previous values restored. '+message(e));
    void quickTokenSaved(token.id).catch(err=>console.error('Could not reload quick edit values',err));
   });
  return true;
 }
 async function quickTokenSaved(id){
  await refreshMonitors();
  const token=tokens.find(t=>t.id===id);
  if(token?.character_id){
   const {data,error}=await db.from('characters').select('*').eq('id',token.character_id).maybeSingle();
   if(error)throw error;
   if(data){
    setCharacters(previous=>previous.map(ch=>ch.id===data.id?data:ch));
    setCharacter(previous=>previous?.id===data.id?data:previous);
   }
  }
 }
 async function saveTokenDisplay(config){
  if(!isDM||!camp)throw Error('Only the DM can change token display settings.');
  const data=await read(db.from('campaigns')
   .update({token_display_config:config}).eq('id',activeId)
   .select('token_display_config').single());
  setCamp(prev=>({...prev,token_display_config:data.token_display_config}));
  await refreshMonitors();
 }
 async function saveMapCalibration(map,next){
  if(!isDM)throw Error('Only the DM can adjust map calibration.');
  if(!map||map.campaign_id!==activeId)throw Error('Map does not belong to this campaign.');
  const valid=Object.entries({width:[next.width,64,10000],height:[next.height,64,10000],grid_size:[next.grid_size,5,1024]})
   .every(([,range])=>Number.isInteger(range[0])&&range[0]>=range[1]&&range[0]<=range[2]);
  if(!valid)throw Error('Invalid pixel dimensions. Check the width, height, and cell size.');
  const {data,error:dbError}=await db.from('battle_maps')
   .update({width:next.width,height:next.height,grid_size:next.grid_size})
   .eq('id',map.id).eq('campaign_id',activeId)
   .eq('width',map.width).eq('height',map.height).eq('grid_size',map.grid_size)
   .select('*').maybeSingle();
  if(dbError)throw dbError;
  if(!data){
   await refreshMaps();
   throw Error('The map settings changed elsewhere. Please review the latest settings before saving again.');
  }
  setMaps(old=>old.map(item=>item.id===map.id?data:item));
  setMapCalibrationPreview(null);
 }
 async function publishMap(id){try{await read(db.from('campaigns').update({active_map_id:id}).eq('id',activeId));setCamp(x=>({...x,active_map_id:id}));await refreshMaps()}catch(e){fail(e)}}
 async function addToken(){if(!selectedMap)return;try{
  const ch=characters.find(c=>c.user_id===tokenOwner);
  await read(db.from('map_tokens').insert({
   campaign_id:activeId,map_id:selectedMap,name:newToken.trim()||ch?.name||'Token',
   owner_id:tokenOwner||null,character_id:ch?.id||null,
   image_path:ch?.token_path||null,x:1,y:1
  }));refreshTokens();
 }catch(e){fail(e)}}

 async function useHotbarSlot(index){
  const slot=hotbarSlots[index],command=slot?.command?.trim();
  if(!command)return setRightTab('settings');
  if(!activeId||!camp)return;
  try{
   const applyFields=expression=>expression.replace(/@\{([A-Za-z0-9_-]+)\}/g,(_,field)=>{
    const value=character?.field_values?.[field];
    const scalar=value&&typeof value==='object'?value.current:value;
    return /^-?\d+(\.\d+)?$/.test(String(scalar??''))?String(scalar):'0';
   });
   const dice=command.match(/^\/(?:roll|r)\s+([\s\S]+)$/i);
   const macro=command.match(/^\/macro\s+(.+)$/i);
   const say=command.match(/^\/(em|say)\s+([\s\S]+)$/i);
   if(dice){
    await roll(applyFields(dice[1]),slot.label||'Hotbar roll');return;
   }
   if(macro){
    const target=camp.sheet_template?.tabs?.flatMap(t=>t.fields||[])
     .find(field=>field.type==='roll'&&field.label.trim().toLowerCase()===macro[1].trim().toLowerCase());
    if(!target)throw Error('Cannot find sheet macro "'+macro[1]+'". Check its name in Sheet Designer.');
    await roll(applyFields(target.formula||'1d20'),target.label);return;
   }
   if(say){
    const message=say[2].trim();
    if(!message)return;
    await read(db.from('chat_messages').insert({campaign_id:activeId,user_id:user,
     body:say[1].toLowerCase()==='em'?'*'+message+'*':message}));
    await refreshChat();return;
   }
   throw Error('Unsupported hotbar command. Use /roll, /macro, /em or /say.');
  }catch(e){fail(e)}
 }
 function queueTokenMove(token,x,y){
  if(!token||!activeId||!selectedMap||token.map_id!==selectedMap)return;
  if(!isDM&&(token.owner_id!==user||camp?.active_map_id!==selectedMap))return;
  const id=token.id;
  let pending=movementPending.current.get(id);
  if(!pending||pending.mapId!==selectedMap||pending.campaignId!==activeId){
   pending={mapId:selectedMap,campaignId:activeId,
    x:Number(token.x),y:Number(token.y),saving:false};
   movementPending.current.set(id,pending);
  }
  if(pending.x===x&&pending.y===y)return;
  pending.x=x;pending.y=y;
  // Immediate feedback: moving a token never waits for a database round trip.
  setTokens(rows=>rows.map(t=>t.id===id?{...t,x,y}:t));
  if(!pending.saving)void flushTokenMove(id,pending);
 }
 async function flushTokenMove(id,pending){
  pending.saving=true;
  try{
   // At most one write at a time per token. If the user moves again while it
   // saves, skip obsolete intermediary tiles and save the newest destination.
   while(movementPending.current.get(id)===pending){
    const {x,y}=pending;
    const {data,error}=await db.from('map_tokens')
     .update({x,y}).eq('id',id)
     .eq('campaign_id',pending.campaignId).eq('map_id',pending.mapId)
     .select('id,x,y').maybeSingle();
    if(error)throw error;
    if(!data)throw Error('Movement was not permitted for this token.');
    if(pending.x!==x||pending.y!==y)continue;
    // The newest position is now confirmed; invalidate older server reads
    // before releasing the optimistic overlay.
    movementPending.current.delete(id);
    ++tokenRefreshSeq.current;
    if(tokenContextRef.current.mapId===pending.mapId&&
       tokenContextRef.current.campaignId===pending.campaignId){
     void refreshTokens();
    }
    break;
   }
  }catch(e){
   if(movementPending.current.get(id)===pending){
    movementPending.current.delete(id);
    ++tokenRefreshSeq.current;
    if(tokenContextRef.current.mapId===pending.mapId&&
       tokenContextRef.current.campaignId===pending.campaignId){
     fail(e);
     // On a rejected or failed write, restore the actual saved position.
     void refreshTokens();
    }
   }
  }finally{pending.saving=false}
 }
 function moveSelectedByKey(dx,dy){
  const token=selectedToken;
  if(!token||!activeMap||!camp||!user)return;
  if(!isDM&&(token.owner_id!==user||camp.active_map_id!==activeMap.id))return;
  const last=movementPending.current.get(token.id)||{x:Number(token.x),y:Number(token.y)};
  const grid=Number(activeMap.grid_size)||70;
  const boundX=Math.max(0,Math.min(1000,Math.floor(Number(activeMap.width)/grid-Number(token.span_x??1))));
  const boundY=Math.max(0,Math.min(1000,Math.floor(Number(activeMap.height)/grid-Number(token.span_y??1))));
  const x=Math.max(0,Math.min(boundX,Math.round(last.x)+dx));
  const y=Math.max(0,Math.min(boundY,Math.round(last.y)+dy));
  queueTokenMove(token,x,y);
 }
 function moveToken(token,x,y){
  queueTokenMove(token,x,y);
 }
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
 if(!configured())return <div className="center"><h1>Tabletop Forge</h1><p>Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel.</p></div>;
 if(!authReady)return <div className="center">Loading…</div>;
 if(!session)return <AuthGate db={db}/>;
 if(!activeId)return <CampaignHub
  campaigns={campaigns} loading={campaignsLoading} roles={roles}
  accountLabel={session.user?.user_metadata?.username||session.user?.user_metadata?.display_name||session.user?.email||'Adventurer'}
  createName={createName} onCreateName={setCreateName}
  inviteCode={joinCode} onInviteChange={setJoinCode}
  onCreate={create} onJoin={join} onSelect={setActiveId}
  onSignOut={()=>db.auth.signOut()}
  error={error} onClearError={()=>setError('')}/>;
 if(!camp)return <div className="welcome-screen"><div className="welcome-shell"><h2>Opening campaign…</h2><p className="muted small">Loading your maps and character sheets.</p><button className="secondary" onClick={()=>setActiveId('')}>Back to main menu</button></div></div>;
 return <div className="app no-left-rail">
 <main>
 {error&&<div className="error alert" onClick={()=>setError('')}>{error} ✕</div>}
 <div className="workarea"><div className="primary">
 {!camp&&<section className="empty-tabletop campaign-empty">
  <div className="campaign-empty-content">
   <h2>Tabletop Forge</h2>
   <p>{activeId?'Loading campaign…':'Create or join a campaign to begin.'}</p>
   <p className="muted small">Open the Campaigns tab on the right to get started.</p>
   <button className="secondary" type="button" onClick={()=>setRightTab('campaigns')}>Open Campaigns</button>
  </div>
 </section>}
 {camp&&<>
 {tab==='sheet'&&<section className="panel page-panel"><div className="heading"><div className="character-heading">
 <Artwork db={db} path={character?.portrait_path} alt={character?.name||'Character'} className="character-portrait"/>
 <div><h2>{character?.name||'Character'}</h2><span className="muted small">{saveState}</span></div></div>
 <button type="button" className="secondary return-to-game" onClick={()=>setTab('tabletop')}>← Return to Game</button>
</div><div className="tabs">{camp.sheet_template.tabs.map(t=><button key={t.id} className={sheetTab===t.id?'selected':''} onClick={()=>setSheetTab(t.id)}>{t.name}</button>)}</div><div className="fields">{(camp.sheet_template.tabs.find(t=>t.id===sheetTab)||camp.sheet_template.tabs[0])?.fields.map(f=><div className={'field span'+(f.span||1)} key={f.id}><label>{f.label}</label>{f.type==='roll'?<button className="rollbtn" onClick={()=>roll(f.formula||'1d20',f.label)}>🎲 {f.label} <small>{f.formula}</small></button>:f.type==='inventory'?<Inventory field={f} value={character?.field_values?.[f.id]||[]} onChange={v=>updateField(f.id,v)}/>:f.type==='resource'?<ResourceField value={character?.field_values?.[f.id]} onChange={v=>updateField(f.id,v)}/>:f.type==='checkbox'?<input type="checkbox" checked={!!character?.field_values?.[f.id]} onChange={e=>updateField(f.id,e.target.checked)}/>:f.type==='textarea'?<textarea value={character?.field_values?.[f.id]??''} onChange={e=>updateField(f.id,e.target.value)}/>:<input type={f.type==='number'?'number':'text'} value={character?.field_values?.[f.id]??D(f)} onChange={e=>updateField(f.id,e.target.value)} />}</div>)}</div></section>}
 {tab==='designer'&&isDM&&<section className="panel page-panel"><div className="heading"><h2>Visual sheet designer</h2><div className="page-header-actions">
 <button type="button" className="secondary return-to-game" onClick={()=>setTab('tabletop')}>← Return to Game</button>
 <button type="button" disabled={busy} onClick={saveTemplate}>Save template</button>
 </div></div><p className="muted">Drag fields to reorder them. Each campaign member keeps their own saved values.</p><div className="tabs">{template?.tabs.map(t=><button key={t.id} className={sheetTab===t.id?'selected':''} onClick={()=>setSheetTab(t.id)}>{t.name}</button>)}<button onClick={()=>{const name=prompt('New tab name');if(name?.trim())changeTemplate(t=>t.tabs.push({id:'tab_'+uid().slice(0,8),name:name.trim(),fields:[]}))}}>+ Tab</button></div><Designer template={template} tabId={sheetTab} changeTemplate={changeTemplate} onLinkResource={linkResourceToToken}/></section>}
 {tab==='maps'&&isDM&&<section className="panel page-panel"><div className="heading"><h2>Map library</h2><div className="page-header-actions">
 <button type="button" className="secondary return-to-game" onClick={()=>setTab('tabletop')}>← Return to Game</button>
 <label className="button">+ Upload map <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadMap}/></label>
 </div></div>{uploading&&<p>Compressing and uploading…</p>}<div className="library"><div><button className={'nav '+(!folder?'active':'')} onClick={()=>setFolder(null)}>All maps</button>{folders.map(f=><button key={f.id} className={'nav '+(folder===f.id?'active':'')} style={{paddingLeft:f.parent_id?26:10}} onClick={()=>setFolder(f.id)}>📁 {f.name}</button>)}<form className="stack" onSubmit={addFolder}><input required placeholder="Folder name" value={newFolder} onChange={e=>setNewFolder(e.target.value)}/><button className="secondary">+ Folder</button></form></div><div className="mapcards">{maps.filter(m=>m.folder_id===folder).map(m=><article className="mapcard" key={m.id} onClick={()=>{setSelectedMap(m.id);setTab('tabletop')}}>{urls[m.id]?<img src={urls[m.id]}/>:<div className="placeholder">Map</div>}<strong>{m.name}</strong><small>{m.width} × {m.height}</small></article>)}</div></div></section>}
 {tab==='tabletop'&&<section className="panel tabletop-panel map-only-panel">
  {displayedMap?<><Board db={db} map={displayedMap} url={urls[activeMap.id]} tokens={tokens}
   user={user} isDM={isDM} move={moveToken} remove={removeToken}
   onNpcDrop={placeNpc} onCharacterDrop={placeCharacterOnMap}
   onUnitDrop={dropExistingUnit} onTokenEdit={openTokenSheet} onTokenQuick={openQuickToken} resize={resizeToken}
   scale={mapZoom} setScale={setMapZoom} selectedId={selectedTokenId} setSelectedId={setSelectedTokenId}
   displayConfig={camp?.token_display_config} monitorValues={monitorValues}/>
   {Object.keys(pendingQuickTokens).length>0&&<div className="quick-save-status" role="status">
    <span className="quick-save-pulse" aria-hidden="true"/>
    Saving {Object.keys(pendingQuickTokens).length} token{Object.keys(pendingQuickTokens).length===1?'':'s'}…
   </div>}
   {hotbarVisible&&<MacroHotbar slots={hotbarSlots} bindings={bindings}
    onExecute={useHotbarSlot} onConfigure={()=>setRightTab('settings')}/>}
  </>
  :<div className="empty-tabletop">
    <p>{isDM?'No map selected. Upload a map to get started.':'The DM has not published a map yet.'}</p>
    {isDM&&<button type="button" onClick={()=>setTab('maps')}>Open map library</button>}
   </div>}
 </section>}
 </>}
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
 activeMap={activeMap} maps={maps} selectedMap={selectedMap} onSelectMap={id=>{setMapCalibrationPreview(null);setSelectedMap(id);setTab('tabletop')}}
 publishedMapId={camp?.active_map_id||null} onPublishMap={publishMap}
 onOpenMapLibrary={()=>setTab('maps')}
 newToken={newToken} onChangeTokenName={setNewToken}
 tokenOwner={tokenOwner} onChangeTokenOwner={setTokenOwner} onAddToken={addToken}
 mapZoom={mapZoom} onChangeZoom={setMapZoom}
 onMapCalibrationPreview={setMapCalibrationPreview} onSaveMapCalibration={saveMapCalibration}
 onSaveTokenDisplay={saveTokenDisplay} template={camp?.sheet_template}
 quickFields={camp?.token_quick_fields||[]} onSaveQuickFields={saveQuickFields}
 bindings={bindings} onSaveBindings={saveMyKeybindings}
 hotbarSlots={hotbarSlots} onSaveHotbar={saveMyHotbar}
 hotbarVisible={hotbarVisible} onChangeHotbarVisible={visible=>changeHotbarVisibility(visible).catch(fail)}
 onCopyInvite={async()=>{try{await navigator.clipboard.writeText(location.origin+'/?join='+camp?.invite_code);setSaveState('Invite link copied')}catch(e){fail(e)}}}
 onNavigate={setTab} onCreatePortrait={()=>setArtStudio(true)} onReturnToMenu={()=>setActiveId('')}
 onOpenPlayerCharacter={id=>openPlayerCharacter(id,null)} currentPage={tab}
 campaignName={camp?.name||''} campaignTokenDisplay={camp?.token_display_config}
 activeCampaignId={activeId} campaignList={campaigns}
 hasCampaign={!!camp} onSelectCampaign={id=>{setActiveId(id);setTab('tabletop')}}
 createCampaignName={createName} onCreateCampaignNameChange={setCreateName} onCreateCampaign={create}
 inviteCode={joinCode} onInviteCodeChange={setJoinCode} onJoinCampaign={join}
 accountEmail={session.user.email} onSignOut={()=>db.auth.signOut()}
 /></div>
 </main>
 {artStudio&&character&&<PersonalTokenLibrary db={db} campaignId={activeId} userId={user}
  mode="players" currentTokenPath={character.token_path} currentPortraitPath={character.portrait_path}
  defaultName={character.name||'New token'} onApply={savePlayerArtwork} onClose={()=>setArtStudio(false)}/>}
 {characterEditor&&isDM&&<CharacterEditor
  db={db} campaignId={activeId} viewerId={user}
  record={characterEditor.data} template={camp?.sheet_template}
  onSaved={afterPlayerSheetSaved} onClose={()=>setCharacterEditor(null)}
  onRoll={(expression,label)=>roll(expression,label,null)}/>}
 {quickEditToken&&camp&&<QuickEditBoundary key={quickEditToken.id} onClose={()=>setQuickEditToken(null)}>
  <TokenQuickEdit db={db} token={quickEditToken} template={camp.sheet_template}
   allowedFields={camp.token_quick_fields||[]}
   onClose={()=>setQuickEditToken(null)} onApply={applyQuickTokenChanges}/>
 </QuickEditBoundary>}
 {npcEditor&&isDM&&<NpcEditor db={db} campaignId={activeId} userId={user}
  record={npcEditor} template={camp?.sheet_template}
  onSave={saveNpc} onSaveAsTemplate={async draft=>{
    await read(db.from('npc_templates').insert({
     campaign_id:activeId,name:draft.name.trim(),
     field_values:draft.values,portrait_path:draft.portraitPath,token_path:draft.tokenPath,
     npc_bars_public:draft.barsPublic
    }));
    await refreshNpcs();
   }} onClose={()=>setNpcEditor(null)}
  onRoll={(expression,label)=>roll(expression,label,null)}/>}
 </div>;
}
function configured(){return !!db}
function Inventory({field,value,onChange}){const cols=field.columns||['Item','Qty','Notes'];return <div className="inventory"><div className="invrow">{cols.map(c=><b key={c}>{c}</b>)}</div>{(Array.isArray(value)?value:[]).map((row,i)=><div className="invrow" key={i}>{cols.map(c=><input key={c} aria-label={c} value={row[c]||''} onChange={e=>onChange(value.map((r,j)=>j===i?{...r,[c]:e.target.value}:r))}/>)}<button className="secondary" onClick={()=>onChange(value.filter((_,j)=>j!==i))}>×</button></div>)}<button className="secondary" onClick={()=>onChange([...value,{}])}>+ Item</button></div>}
function Designer({template,tabId,changeTemplate,onLinkResource}){
 const t=template?.tabs.find(x=>x.id===tabId)||template?.tabs[0],drag=useRef(null);
 const [fieldType,setFieldType]=useState('text'),[linking,setLinking]=useState(''),[linkMessage,setLinkMessage]=useState('');
 if(!t)return null;
 const update=(id,key,value)=>changeTemplate(x=>{
  const field=x.tabs.find(y=>y.id===t.id)?.fields.find(y=>y.id===id);
  if(field)field[key]=value;
 });
 async function link(field){
  setLinkMessage('');setLinking(field.id);
  try{const response=await onLinkResource(field);setLinkMessage(response)}
  catch(e){setLinkMessage(e?.message||String(e))}
  finally{setLinking('')}
 }
 function createField(){
  const type=fieldType;
  changeTemplate(x=>x.tabs.find(y=>y.id===t.id).fields.push({
   id:'field_'+uid().slice(0,8),
   label:type==='resource'?'Hit Points':'New '+type,type,span:type==='resource'?2:1,
   ...(type==='inventory'?{columns:['Item','Qty','Notes']}:type==='roll'?{formula:'1d20'}:{})
  }));
 }
 return <>
  <div className="tools">
   <input aria-label="Tab name" value={t.name}
    onChange={e=>changeTemplate(x=>x.tabs.find(y=>y.id===t.id).name=e.target.value)}/>
   <button className="secondary" onClick={()=>{
    if(template.tabs.length<2)return alert('Keep at least one tab');
    if(confirm('Delete tab and its fields?'))changeTemplate(x=>x.tabs=x.tabs.filter(y=>y.id!==t.id));
   }}>Delete tab</button>
   <select aria-label="New field type" value={fieldType} onChange={e=>setFieldType(e.target.value)}>
    <option value="text">Text</option><option value="number">Number</option>
    <option value="resource">Resource (Current / Maximum)</option>
    <option value="textarea">Notes</option><option value="checkbox">Checkbox</option>
    <option value="roll">Dice button</option><option value="inventory">Inventory</option>
   </select>
   <button onClick={createField}>+ Add field</button>
  </div>
  <p className="muted small">Resource fields keep Current and Maximum together. Link one to a token bar in a single click, without entering field IDs.</p>
  {linkMessage&&<div className="designer-feedback" role="status">{linkMessage}</div>}
  <div className="designer-grid">{t.fields.map((f,i)=>
   <div className="designfield" key={f.id}
    onDragOver={e=>{if(drag.current?.tabId===t.id){e.preventDefault();e.dataTransfer.dropEffect='move'}}}
    onDrop={e=>{
     if(drag.current?.tabId!==t.id)return;
     e.preventDefault();
     const fromId=drag.current.id;
     drag.current=null;
     changeTemplate(x=>{
      const arr=x.tabs.find(y=>y.id===t.id).fields;
      const from=arr.findIndex(field=>field.id===fromId);
      const to=arr.findIndex(field=>field.id===f.id);
      if(from<0||to<0||from===to)return;
      arr.splice(to,0,arr.splice(from,1)[0]);
     });
    }}>
    <span className="muted designfield-drag-handle" draggable="true"
      title="Drag this handle to reorder the field"
      onDragStart={e=>{
       drag.current={tabId:t.id,id:f.id};
       e.dataTransfer.effectAllowed='move';
       e.dataTransfer.setData('text/plain',f.id);
      }}
      onDragEnd={()=>{drag.current=null}}>⠿ Drag to reorder</span>
    <label>Field label<input value={f.label} onChange={e=>update(f.id,'label',e.target.value)}/></label>
    <div className="tools">
     <label>Width<select value={f.span||1} onChange={e=>update(f.id,'span',Number(e.target.value))}>
      <option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option>
     </select></label>
     <label>Field type<select value={f.type} onChange={e=>update(f.id,'type',e.target.value)}>
      <option value="text">Text</option><option value="number">Number</option>
      <option value="resource">Resource (Current / Maximum)</option>
      <option value="textarea">Notes</option><option value="checkbox">Checkbox</option>
      <option value="roll">Dice button</option><option value="inventory">Inventory</option>
     </select></label>
     <button className="secondary" onClick={()=>changeTemplate(x=>{
      const tab=x.tabs.find(y=>y.id===t.id);tab.fields=tab.fields.filter(y=>y.id!==f.id);
     })}>Delete</button>
    </div>
    {f.type==='resource'&&<>
     <div className="resource-designer-explainer">Two values in one field: <strong>Current / Maximum</strong>.
      <span>Example: {f.label||'Hit Points'} 15 / 22</span></div>
     <button className="resource-link-button" disabled={linking===f.id} onClick={()=>link(f)}>
      {linking===f.id?'Linking…':'↗ Add / link token resource bar'}
     </button>
    </>}
    {f.type==='roll'&&<label>Dice formula<input value={f.formula||''}
      onChange={e=>update(f.id,'formula',e.target.value)} placeholder="1d20+@{strength}"/></label>}
    {f.type==='inventory'&&<label>Columns (comma separated)<input
      value={(f.columns||[]).join(', ')}
      onChange={e=>update(f.id,'columns',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))}/></label>}
   </div>)}
  </div>
 </>;
}

function Board({db,map,url,tokens,user,isDM,move,remove,resize,onNpcDrop,onCharacterDrop,onUnitDrop,onTokenEdit,onTokenQuick,scale,setScale,selectedId,setSelectedId,displayConfig,monitorValues}){
 const[preview,setPreview]=useState({});
 const boardRef=useRef(null),viewportRef=useRef(null),drag=useRef(null),resizeDrag=useRef(null),pan=useRef(null),zoomRef=useRef(scale);
 const [panning,setPanning]=useState(false);
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
 function dropOnMap(e){
  const kinds=['application/x-forge-character','application/x-forge-unit','application/x-forge-npc'];
  const match=kinds.find(k=>e.dataTransfer.types.includes(k));
  if(!match)return;
  e.preventDefault();
  const id=e.dataTransfer.getData(match);
  if(!id)return;
  const p=pos(e);
  if(match==='application/x-forge-character')onCharacterDrop(id,p.x,p.y);
  else if(match==='application/x-forge-unit')onUnitDrop(id,p.x,p.y);
  else if(isDM)onNpcDrop(id,p.x,p.y);
 }
 function allowMapDrop(e){
  const types=e.dataTransfer.types;
  const allowed=types.includes('application/x-forge-character')||
    types.includes('application/x-forge-unit')||
    (isDM&&types.includes('application/x-forge-npc'));
  if(allowed)e.preventDefault();
 }
 function startPan(e){
  if(e.button!==0||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('.token'))return;
  const viewport=viewportRef.current;if(!viewport)return;
  e.preventDefault();
  setSelectedId(null);
  pan.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
  viewport.setPointerCapture(e.pointerId);
  setPanning(true);
 }
 function movePan(e){
  const info=pan.current;
  if(!info||info.id!==e.pointerId)return;
  const viewport=viewportRef.current;
  viewport.scrollLeft=info.left-(e.clientX-info.startX);
  viewport.scrollTop=info.top-(e.clientY-info.startY);
 }
 function endPan(e){
  if(!pan.current||pan.current.id!==e.pointerId)return;
  pan.current=null;setPanning(false);
  const viewport=viewportRef.current;
  if(viewport?.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
 }
 return <>
  <div className={'mapscroll map-pan-region'+(panning?' is-panning':'')} ref={viewportRef}
    aria-label="Battlemap viewport — left-click and drag to pan" tabIndex={0}
    onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan}
    onPointerCancel={endPan} onLostPointerCapture={endPan}>
   <div ref={boardRef} className="board"
    onPointerDown={e=>{if(e.target===e.currentTarget||e.target.classList.contains('gridlines'))setSelectedId(null)}}
    onDragOver={allowMapDrop}
    onDrop={dropOnMap}
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
      onClick={e=>{
       if(e.ctrlKey&&!e.altKey&&canMove){
        e.preventDefault();e.stopPropagation();
        onTokenQuick(t);
       }
      }}
      onPointerDown={e=>{
       e.stopPropagation();setSelectedId(t.id);
       viewportRef.current?.focus({preventScroll:true});
       if(!canMove||e.altKey||e.ctrlKey||e.metaKey||e.button!==0)return;
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
      <TokenMonitors config={displayConfig} fields={monitorValues[t.id]} zoom={scale}/>
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
createRoot(document.getElementById('root')).render(<AppErrorBoundary><App/></AppErrorBoundary>);
