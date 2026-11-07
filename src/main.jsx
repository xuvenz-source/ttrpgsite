import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import{createClient}from'@supabase/supabase-js';
import './style.css';
import './map-environment.css';
import './combat.css';
import PersonalTokenLibrary from './PersonalTokenLibrary.jsx';
import AccountSettings from './AccountSettings.jsx';
import {validMeasurement,liveMeasurementPayload,pointOnBattlemap,
 measurementGeometry,addLineTurn,shouldBendLineOnRightPress,
 acceptMeasurementEvent,applyMeasurementEventToVisible} from './MapMeasurements.js';
import {MeasurementToolBar,MapMeasurementOverlay} from './MapMeasurementTools.jsx';
import Artwork from './Artwork.jsx';
import Bestiary from './Bestiary.jsx';
import NpcEditor from './NpcEditor.jsx';
import CharacterEditor from './CharacterEditor.jsx';
import TabletopSidebar from './TabletopSidebar.jsx';
import CombatTurnOrder from './CombatTurnOrder.jsx';
import useMapCombat from './useMapCombat.js';
import MapSettingPanel from './MapSettingPanel.jsx';
import MapEnvironmentOverlay from './MapEnvironmentOverlay.jsx';
import MapObjectQuickAdjust from './MapObjectQuickAdjust.jsx';
import MapPlayerPreviewOverlay from './MapPlayerPreviewOverlay.jsx';
import {previewViewer,previewVisionPolygon,pointInPolygon} from './MapVisionPreview.js';
import {normalizeEnvironment,withObject,patchObject} from './MapEnvironment.js';
import {eventAffectsMap,createCoalescedRefresh,createAdaptiveReconciler,
 CHAT_RECONCILE_MS,ROSTER_RECONCILE_MS} from './PerformanceScheduling.js';
import {signedAssetStore} from './SignedAssetUrls.js';
import {createDebouncedSerialWriter} from './QueuedWrites.js';
import {normalizeConfig} from './TokenMonitors.jsx';
import TokenMonitorFrames from './TokenMonitorFrames.jsx';
import ResourceField from './ResourceField.jsx';
import AttributeField from './AttributeField.jsx';
import {TemplateListsDesigner,SheetListField,optionLists} from './TemplateOptionLists.jsx';
import {makeProgressionField,makeProficienciesField,enrichSheetValues,
 PERSONAL_RESOURCE_TAB,PERSONAL_RESOURCE_KEY,validateModifierRules,modifierReferenceId,
 numericFieldsWithDerived} from './SheetDerived.js';
import {ProgressionDesigner,ProgressionPanel,ProficienciesDesigner,ProficienciesPanel} from './SheetProgression.jsx';
import PersonalResources from './PersonalResources.jsx';
import {makeMagicDashboardField,MagicDashboardDesigner,MagicDashboard} from './SheetMagic.jsx';
import {makeEquipmentField,makeEquipmentTab,EquipmentDesigner,EquipmentManager,calculateArmor} from './SheetEquipment.jsx';
import FloatingWindow from './FloatingWindow.jsx';
import {movementTopic,allowedMovementPreview,canSendMovementPreview,
 MOVE_PREVIEW_INTERVAL_MS,MOVE_PREVIEW_EXPIRE_MS} from './LiveTokenMovement.js';
import {canControlMapToken,selectionRectangle,selectableTokenIds,
 boundedGroupOffset} from './MapSelection.js';
import {campaignPresenceKey,onlineMemberIds,chatRowsForMap} from './CampaignRealtime.js';
import {MacroManager} from './MacroBuilder.jsx';
import {RepeatingCollection,CollectionDesigner,makeBlankCollection,makeSpellbookField} from './RepeatingCollection.jsx';
import {DEFAULT_BINDINGS,normalizeBindings,normaliseHotbar,
 reorderHotbarSlots,removeHotbarSlot,lookupAction,isInputFocused,MacroHotbar} from './TabletopControls.jsx';
import TokenQuickEdit from './TokenQuickEdit.jsx';
import {TokenStatusBadges,TokenStatusPicker,normalizedEffects,normalizedCatalog,statusTitle} from './TokenStatuses.jsx';
import {parseSheetTemplateFile,serializeSheetTemplate,validateSheetTemplate} from './TemplateFiles.js';
import {sheetQuickcodeReferences,hydrateSheetQuickcodes,configWithSheetQuickcodes} from './SheetQuickcodes.js';
import InventoryPanel from './InventoryPanel.jsx';
import InventoryRulesDesigner from './InventoryRulesDesigner.jsx';
import {DEFAULT_ENCUMBRANCE,evaluateEncumbrance} from './InventoryMath.js';
import {AuthGate,CampaignHub} from './Welcome.jsx';

const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
const uid=()=>crypto.randomUUID();
const message=e=>e?.message||String(e);
const read=async(q)=>{const{data,error}=await q;if(error)throw error;return data};
const D=(field)=>field.type==='number'?0:field.type==='attribute'?10:
 ['inventory','collection'].includes(field.type)?[]:
 ['magic_dashboard','equipment','progression','proficiencies'].includes(field.type)?{}:'';
const stamp=s=>new Date(s).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const defaults=[{id:'main',name:'Character',fields:[{id:'character_name',label:'Name',type:'text',span:2},{id:'strength',label:'Strength',type:'attribute',span:1},{id:'dexterity',label:'Dexterity',type:'attribute',span:1},{id:'hp',label:'Hit points',type:'number',span:1},{id:'attack',label:'Attack',type:'roll',formula:'1d20+@{strength}',span:1}]},{id:'inventory',name:'Inventory',fields:[{id:'items',label:'Equipment',type:'inventory',columns:['Item','Qty','Weight','Notes'],span:3}]}];
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
 const[launchSheet]=useState(()=>{
  const p=new URLSearchParams(location.search);
  return p.get('campaign')&&p.get('sheet')?
   {campaignId:p.get('campaign'),characterId:p.get('sheet')}:null;
 });
 const launchHandled=useRef(false);
 const[launchNpc]=useState(()=>{
  const params=new URLSearchParams(location.search);
  const campaignId=params.get('campaign'),id=params.get('npc');
  const kind=params.get('npc_kind');
  return campaignId&&id&&['token','template'].includes(kind)?
   {campaignId,id,kind}:null;
 });
 const launchNpcHandled=useRef(false);
 const[session,setSession]=useState(null),[authReady,setAuthReady]=useState(false),[email,setEmail]=useState(''),[sent,setSent]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const[campaigns,setCampaigns]=useState([]),[campaignsLoading,setCampaignsLoading]=useState(true),[roles,setRoles]=useState({}),[activeId,setActiveId]=useState(''),[camp,setCamp]=useState(null),[members,setMembers]=useState([]),[characters,setCharacters]=useState([]),[character,setCharacter]=useState(null);
 const[createName,setCreateName]=useState(''),[joinCode,setJoinCode]=useState(new URLSearchParams(location.search).get('join')||'');
 const[tab,setTab]=useState('tabletop'),[sheetTab,setSheetTab]=useState('main'),[template,setTemplate]=useState(null),[saveState,setSaveState]=useState('Saved');
 const[mapAssignments,setMapAssignments]=useState([]),[accountNames,setAccountNames]=useState([]);
 const[onlinePresenceKeys,setOnlinePresenceKeys]=useState([]),
  [memberPresenceHashes,setMemberPresenceHashes]=useState({});
 const rosterRequest=useRef(0),chatRequest=useRef(0),
  campaignFetchRequest=useRef(0),campaignListRequest=useRef(0),
  mapLibraryRequest=useRef(0),npcLibraryRequest=useRef(0),
  latestChatRefresh=useRef(null),latestRosterRefresh=useRef(null);
 const[folders,setFolders]=useState([]),[maps,setMaps]=useState([]),[folder,setFolder]=useState(null),[selectedMap,setSelectedMap]=useState(''),[urls,setUrls]=useState({}),[tokens,setTokens]=useState([]);
 const[artStudio,setArtStudio]=useState(false),[npcEditors,setNpcEditors]=useState([]),
  [characterEditor,setCharacterEditor]=useState(null);
 const[accountSettingsOpen,setAccountSettingsOpen]=useState(false);
 const[newCharacterName,setNewCharacterName]=useState('');
 const[rightTab,setRightTab]=useState('chat'),[mapZoom,setMapZoom]=useState(.7),[selectedTokenId,setSelectedTokenId]=useState(null);
 const[mapCalibrationPreview,setMapCalibrationPreview]=useState(null);
 const[mapEnvironment,setMapEnvironment]=useState(null);
 const mapEnvironmentCurrent=useRef(null);
 const[mapEnvironmentMapId,setMapEnvironmentMapId]=useState('');
 const[mapEnvironmentStatus,setMapEnvironmentStatus]=useState('Choose a map');
 const[mapSettingPopped,setMapSettingPopped]=useState(false);
 const mapEnvironmentWriter=useRef(null);
 const[mapSettingEditor,setMapSettingEditor]=useState({
  enabled:false,layer:'light',tool:'wall-line',showLight:true,showBackground:true,
  lockLight:false,lockBackground:true,snap:false,preset:'solid',previewing:false,previewTokenId:'',
  selectedId:null,lightBright:20,lightDim:20
 });
 const[npcs,setNpcs]=useState([]),[npcFolders,setNpcFolders]=useState([]);
 const[monitorValues,setMonitorValues]=useState({});
 const[encumbranceBadges,setEncumbranceBadges]=useState({});
 const[quickEditToken,setQuickEditToken]=useState(null);
 const[statusEditToken,setStatusEditToken]=useState(null);
 const[statusSavingTokens,setStatusSavingTokens]=useState({});
 const statusPatches=useRef(new Map());
 const[pendingQuickTokens,setPendingQuickTokens]=useState({});
 const quickWritePatches=useRef(new Map());
 const monitorRequest=useRef(0),campaignMetadataRequest=useRef(0);
 const navigationChannel=useRef(null),navigationRequest=useRef(0);
 const latestMonitorRefresh=useRef(null),latestTokenRefresh=useRef(null);
 const latestCampaignMetadataRefresh=useRef(null),latestMapsRefresh=useRef(null),latestNpcsRefresh=useRef(null);
 const[remoteTokenPositions,setRemoteTokenPositions]=useState({});
 const[remoteMeasurements,setRemoteMeasurements]=useState({});
 const measureExpiry=useRef(new Map()),lastMeasureSent=useRef(0);
 const measureSequence=useRef(0),measureRevisions=useRef(new Map()),
  measureClearRevisions=useRef(new Map());
 const liveMapChannel=useRef(null),liveMapReady=useRef(false);
 const liveMovementSeq=useRef(0),lastMovementPreview=useRef(new Map());
 const remoteMoveExpiry=useRef(new Map()),latestMovementAccess=useRef({});
 const[bindings,setBindings]=useState(()=>normalizeBindings(DEFAULT_BINDINGS));
 const[hotbarSlots,setHotbarSlots]=useState(()=>normaliseHotbar([]));
 const latestHotbar=useRef(normaliseHotbar([])),hotbarWriteQueue=useRef(Promise.resolve());
 const[macros,setMacros]=useState([]);
 const[macroBuilderOpen,setMacroBuilderOpen]=useState(false);
 const[hotbarVisible,setHotbarVisible]=useState(true);
 const[uiScale,setUiScale]=useState(.9);
 const quickCache=useRef(new Map());
 // Keep the most recent local destination authoritative until the server acknowledges it.
 const movementPending=useRef(new Map()),tokenRefreshSeq=useRef(0),lastKeyboardMove=useRef(0);
 const tokenContextRef=useRef({mapId:'',campaignId:''});
 if(!mapEnvironmentWriter.current){
  mapEnvironmentWriter.current=createDebouncedSerialWriter(
   async (prepared,{mapId,campaignId})=>{
    const {error:saveError}=await db.from('map_environments').upsert({
     map_id:mapId,campaign_id:campaignId,prepared,
     updated_at:new Date().toISOString()
    },{onConflict:'map_id'});
    if(saveError)throw saveError;
   },{
    onSaved:({context})=>{
     if(tokenContextRef.current.mapId===context.mapId&&
        tokenContextRef.current.campaignId===context.campaignId)
      setMapEnvironmentStatus('Saved');
    },
    onError:(error,{context})=>{
     console.error('Could not save map environment',error);
     if(tokenContextRef.current.mapId===context.mapId&&
        tokenContextRef.current.campaignId===context.campaignId)
      setMapEnvironmentStatus('Save failed: '+message(error));
    }
   }
  );
 }
 const[msgs,setMsgs]=useState([]),[chat,setChat]=useState(''),[newFolder,setNewFolder]=useState(''),[uploading,setUploading]=useState(false),[newToken,setNewToken]=useState('Token'),[tokenOwner,setTokenOwner]=useState('');
 const saveTimer=useRef(null),pendingSheetSave=useRef(null),
  sheetWriteQueue=useRef(Promise.resolve()),user=session?.user?.id,isDM=roles[activeId]==='dm';
 const playerMapId=mapAssignments.find(a=>a.user_id===user)?.map_id||camp?.active_map_id||null;
 const activeMap=maps.find(x=>x.id===selectedMap);
 const displayedMap=activeMap&&mapCalibrationPreview?.mapId===activeMap.id
  ?{...activeMap,...mapCalibrationPreview}:activeMap;
 tokenContextRef.current={mapId:selectedMap,campaignId:activeId,userId:user};
 const selectedToken=tokens.find(x=>x.id===selectedTokenId)||null;
 const onlineMembers=onlineMemberIds(members,memberPresenceHashes,onlinePresenceKeys);
 const combatTracker=useMapCombat({
  db,campaignId:activeId,mapId:selectedMap,userId:user,isDM,
  onError:fail,onRefreshChat:refreshChat,
  beforeRoll:async entryId=>{
   // Roll initiative from the latest saved character sheet if this user is
   // editing the participating character in the same session.
   const roster=combatTracker.combat?.entries||[];
   const entry=roster.find(e=>e.id===entryId);
   const privateId=isDM?combatTracker.privateEntries.find(e=>e.entry_id===entryId)?.token_id:null;
   const token=tokens.find(t=>t.id===(privateId||entry?.tokenId));
   if(token?.character_id&&token.character_id===character?.id)
    await flushSheetForCast(character.id);
  }
 });
 const currentCombatEntry=combatTracker.combat?.entries.find(e=>
  e.id===combatTracker.combat?.currentEntryId);
 const combatActiveTokenId=currentCombatEntry?.tokenId||
  (isDM?combatTracker.privateEntries.find(e=>
   e.entry_id===combatTracker.combat?.currentEntryId)?.token_id:null);
 function fail(e){setError(message(e));console.error(e)}
 async function accountUpdated(){
  const {data,error:identityError}=await db.auth.getUser();
  if(identityError)throw identityError;
  if(data?.user)setSession(previous=>previous?{...previous,user:data.user}:previous);
  if(activeId)void latestRosterRefresh.current?.();
 }
 async function fetchCampaigns(prefer){if(!db||!user)return;
  const request=++campaignListRequest.current,currentUser=user;
  setCampaignsLoading(true);
  try{const [cs,ms]=await Promise.all([read(db.from('campaigns').select('*').order('created_at',{ascending:false})),read(db.from('campaign_members').select('campaign_id,role').eq('user_id',user))]);
    if(request!==campaignListRequest.current||tokenContextRef.current.userId!==currentUser)return;
    setCampaigns(cs);setRoles(Object.fromEntries(ms.map(x=>[x.campaign_id,x.role])));
    setActiveId(old=>prefer&&cs.some(c=>c.id===prefer)?prefer:cs.some(c=>c.id===old)?old:'');
  }catch(e){if(request===campaignListRequest.current)fail(e)}finally{
   if(request===campaignListRequest.current)setCampaignsLoading(false)
  }
 }
 async function fetchCampaign(id){if(!id)return;
  const request=++campaignFetchRequest.current,currentUser=user;
  try{const [c,m,ch,f,b,chat,npcList,npcFolderList,assignments,views,names]=await Promise.all([
  read(db.from('campaigns').select('*').eq('id',id).single()),
  read(db.from('campaign_members').select('user_id,role').eq('campaign_id',id)),
  read(db.from('characters').select('*').eq('campaign_id',id)),
  read(db.from('map_folders').select('*').eq('campaign_id',id)),
  read(db.from('battle_maps').select('*').eq('campaign_id',id).order('created_at',{ascending:false})),
  read(db.from('chat_messages').select('*').eq('campaign_id',id).order('created_at',{ascending:false}).limit(100)),
  read(db.from('npc_templates').select('*').eq('campaign_id',id).order('name')),
  read(db.from('npc_folders').select('*').eq('campaign_id',id).order('name')),
  read(db.from('campaign_player_maps').select('campaign_id,user_id,map_id').eq('campaign_id',id)),
  read(db.from('campaign_map_views').select('map_id,user_id').eq('campaign_id',id)),
  read(db.rpc('get_campaign_account_names',{p_campaign:id}))]);
   if(request!==campaignFetchRequest.current||
      tokenContextRef.current.campaignId!==id||tokenContextRef.current.userId!==currentUser)return;
   const dm=m.some(member=>member.user_id===user&&member.role==='dm');
   const defaultMap=c.active_map_id||null;
   const desired=dm?(views.find(v=>v.user_id===user)?.map_id||defaultMap):
     (assignments.find(a=>a.user_id===user)?.map_id||defaultMap);
   setCamp(c);setTemplate(hydrateSheetQuickcodes(c.sheet_template,c.token_display_config?.references));setMembers(m);setCharacters(ch);setAccountNames(names);
   setCharacter(previous=>ch.find(x=>x.id===previous?.id&&x.user_id===user)||ch.find(x=>x.user_id===user)||null);
   setMapAssignments(assignments);setFolders(f);setMaps(b);
   setMsgs(chat.filter(x=>x.map_id===((dm&&b.some(map=>map.id===selectedMap)?selectedMap:desired)||null)).reverse());
   setNpcs(npcList);setNpcFolders(npcFolderList);
   setSelectedMap(old=>(dm&&b.some(x=>x.id===old))?old:(b.some(x=>x.id===desired)?desired:''));
  }catch(e){fail(e)}
 }
 // Campaign metadata updates must not reload the entire campaign, chat,
 // NPCs, character roster, and map library.
 async function refreshCampaignMetadata(){
  const campaignId=activeId,request=++campaignMetadataRequest.current;
  if(!db||!campaignId)return;
  try{
   const next=await read(db.from('campaigns').select('*').eq('id',campaignId).single());
   if(request!==campaignMetadataRequest.current||
      tokenContextRef.current.campaignId!==campaignId)return;
   setCamp(next);
   setTemplate(hydrateSheetQuickcodes(next.sheet_template,
    next.token_display_config?.references));
  }catch(e){
   if(request===campaignMetadataRequest.current)
    console.warn('Could not refresh campaign metadata',e);
  }
 }
 /** Server-authorized routing: incoming broadcasts carry no private map IDs. */
 async function refreshPlayerMapRouting(){
  const request=++navigationRequest.current;
  if(!db||!activeId||!user||isDM)return;
  try{
   const [campaign,own,availableMaps]=await Promise.all([
    read(db.from('campaigns').select('active_map_id').eq('id',activeId).single()),
    read(db.from('campaign_player_maps').select('campaign_id,user_id,map_id')
     .eq('campaign_id',activeId).eq('user_id',user).maybeSingle()),
    read(db.from('battle_maps').select('*').eq('campaign_id',activeId)
     .order('created_at',{ascending:false}))
   ]);
   if(request!==navigationRequest.current)return;
   const target=own?.map_id||campaign.active_map_id||'';
   const visible=availableMaps.some(m=>m.id===target)?target:'';
   setCamp(old=>old?{...old,active_map_id:campaign.active_map_id}:old);
   setMapAssignments(old=>[...old.filter(a=>a.user_id!==user),...(own?[own]:[])]);
   setMaps(availableMaps);
   setSelectedMap(old=>old===visible?old:visible);
  }catch(e){if(request===navigationRequest.current)console.error('Could not refresh map routing',e)}
 }
 function notifyMonitorRefresh(){
  // No character values leave this broadcast. Every listener re-fetches
  // only the token monitors visible under their own map permissions.
  const c=navigationChannel.current;
  if(c)void c.send({type:'broadcast',event:'monitors-changed',payload:{}})
   .catch(e=>console.warn('Monitor refresh notification unavailable',e));
 }
 function notifyMapRouting(payload){
  const c=navigationChannel.current;
  if(c)void c.send({type:'broadcast',event:'routing-changed',payload})
   .catch(e=>console.warn('Map routing notification unavailable',e));
 }
 async function refreshMaps(){if(!activeId)return;
  const campaignId=activeId,currentUser=user,request=++mapLibraryRequest.current;
  try{
   const [f,m]=await Promise.all([
    read(db.from('map_folders').select('*').eq('campaign_id',campaignId)),
    read(db.from('battle_maps').select('*').eq('campaign_id',campaignId)
     .order('created_at',{ascending:false}))
   ]);
   if(request!==mapLibraryRequest.current||
      tokenContextRef.current.campaignId!==campaignId||
      tokenContextRef.current.userId!==currentUser)return;
   setFolders(f);setMaps(m);
   setSelectedMap(old=>m.some(x=>x.id===old)?old:
    (isDM?m[0]?.id||'':m.some(x=>x.id===playerMapId)?playerMapId:''));
  }catch(e){if(request===mapLibraryRequest.current)fail(e)}
 }
 async function refreshNpcs(){if(!activeId)return;
  const campaignId=activeId,currentUser=user,request=++npcLibraryRequest.current;
  try{
   const [all,allFolders]=await Promise.all([
    read(db.from('npc_templates').select('*').eq('campaign_id',campaignId).order('name')),
    read(db.from('npc_folders').select('*').eq('campaign_id',campaignId).order('name'))
   ]);
   if(request!==npcLibraryRequest.current||
      tokenContextRef.current.campaignId!==campaignId||
      tokenContextRef.current.userId!==currentUser)return;
   setNpcs(all);setNpcFolders(allFolders);
  }catch(e){if(request===npcLibraryRequest.current)fail(e)}
 }
 async function makeNpcFolder(name,parentId){try{
   await read(db.from('npc_folders').insert({campaign_id:activeId,name,parent_id:parentId}));
   await refreshNpcs();
  }catch(e){fail(e)}}
 function openNpcBrowserWindow(record){
  if(!isDM||!record?.data?.id)return;
  const url=new URL(location.origin+location.pathname);
  url.searchParams.set('campaign',activeId);
  url.searchParams.set('npc',record.data.id);
  url.searchParams.set('npc_kind',record.kind);
  window.open(url.toString(),'_blank','popup,width=920,height=760,noopener,noreferrer');
 }
 function openNpcEditor(record){
  const key=record.kind+':'+record.data.id;
  setNpcEditors(previous=>{
   const existing=previous.find(item=>item.kind+':'+item.data.id===key);
   if(existing)return previous.map(item=>item===existing?
    {...item,focusSignal:(item.focusSignal||0)+1}:item);
   return [...previous,{...record,focusSignal:0}];
  });
 }
 function closeNpcEditor(record){
  if(launchNpc&&launchNpc.id===record.data.id&&launchNpc.kind===record.kind){
   window.close();return;
  }
  const key=record.kind+':'+record.data.id;
  setNpcEditors(previous=>previous.filter(item=>item.kind+':'+item.data.id!==key));
 }
 async function makeNpc(name,folderId){try{
   const created=await read(db.from('npc_templates').insert({
    campaign_id:activeId,folder_id:folderId,name,
    field_values:{character_name:name}
   }).select('*').single());
   await refreshNpcs();openNpcEditor({kind:'template',data:created});
  }catch(e){fail(e)}}
 async function moveNpcFolder(id,folderId){try{
  await read(db.from('npc_templates').update({folder_id:folderId}).eq('id',id));await refreshNpcs();
 }catch(e){fail(e)}}
 function openSheetBrowserTab(characterId){
  if(!activeId||!characters.some(ch=>ch.id===characterId&&(ch.user_id===user||isDM)))
   return fail('You cannot open that character.');
  const url=new URL(location.origin+location.pathname);
  url.searchParams.set('campaign',activeId);
  url.searchParams.set('sheet',characterId);
  window.open(url.toString(),'_blank',
   'popup=yes,width=920,height=760,resizable=yes,scrollbars=yes,noopener,noreferrer');
 }
 async function openOwnCharacter(characterId){
  const target=characters.find(ch=>ch.id===characterId&&ch.user_id===user);
  if(!target)throw Error('Character sheet not found.');
  if(character?.id&&character.id!==target.id)await flushSheetForCast(character.id);
  setCharacter(target);setSaveState('Saved');setSheetTab('main');setTab('sheet');
 }
 async function createNewCharacter(name){
  const clean=String(name||'').trim();
  if(!clean||clean.length>100)return fail('Enter a character name up to 100 characters.');
  try{
   if(character?.id)await flushSheetForCast(character.id);
   const created=await read(db.from('characters').insert({
    campaign_id:activeId,user_id:user,name:clean,field_values:{character_name:clean}
   }).select('*').single());
   setCharacters(old=>[...old,created]);setCharacter(created);
   setNewCharacterName('');setSheetTab('main');setSaveState('Saved');setTab('sheet');
   void refreshMonitors();
  }catch(e){fail(e)}
 }
 async function openPlayerCharacter(characterId,ownerId){
  if(!isDM)return;
  try{
   let row=null;
   if(characterId){
    row=await read(db.from('characters').select('*').eq('campaign_id',activeId).eq('id',characterId).maybeSingle());
   }
   // Old tokens stored an owner but not a character_id. Resolve by campaign membership.
   if(!row&&ownerId){
    row=await read(db.from('characters').select('*').eq('campaign_id',activeId).eq('user_id',ownerId).order('updated_at',{ascending:false}).limit(1).maybeSingle());
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
   openNpcEditor({kind:'token',data:{...t,npc_values:npcValues||{}}});
  }
 }
 function afterPlayerSheetSaved(updated){
  setCharacters(prev=>prev.map(ch=>ch.id===updated.id?updated:ch));
  setCharacter(prev=>prev?.id===updated.id?updated:prev);
  void refreshMonitors();
  notifyMonitorRefresh();
 }
 async function saveNpc(record,draft){
  if(!record)return;
  if(record.kind==='template'){
   await read(db.from('npc_templates').update({
    name:draft.name.trim(),field_values:draft.values,portrait_path:draft.portraitPath,token_path:draft.tokenPath,
    npc_bars_public:draft.barsPublic
   }).eq('id',record.data.id));
   await refreshNpcs();
   // Template edits can propagate unchanged defaults to existing NPC copies.
   await refreshTokens();
   await refreshMonitors();
  }else{
   await read(db.from('map_tokens').update({
    name:draft.name.trim(),npc_values:draft.values,image_path:draft.tokenPath,
    npc_bars_public:draft.barsPublic
   }).eq('id',record.data.id));
   await refreshTokens();
   await refreshMonitors();
  }
  const editorKey=record.kind+':'+record.data.id;
  setNpcEditors(current=>current.map(editor=>editor.kind+':'+editor.data.id===editorKey?
   {...editor,data:{
    ...editor.data,name:draft.name.trim(),npc_bars_public:draft.barsPublic,
    ...(editor.kind==='template'?{
     field_values:draft.values,portrait_path:draft.portraitPath,token_path:draft.tokenPath
    }:{npc_values:draft.values,image_path:draft.tokenPath})
   }}:editor));
 }
 async function placeNpc(npcId,x=1,y=1){
  if(!npcId||!selectedMap||!isDM)return;
  try{
   // Always start from the current bestiary sheet, not cached sidebar data.
   const npc=await read(db.from('npc_templates')
    .select('id,name,field_values,token_path,npc_bars_public')
    .eq('id',npcId).eq('campaign_id',activeId).single());
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
  if(!isDM&&playerMapId!==selectedMap){
   fail('The DM needs to publish this map before players can place tokens.');return;
  }
  try{
   const created=await read(db.from('map_tokens').insert({
    campaign_id:activeId,map_id:selectedMap,character_id:ch.id,
    owner_id:ch.user_id,name:ch.name||'Character',image_path:ch.token_path||null,
    x,y
   }).select('id').single());
   await refreshTokens();
   await refreshMonitors();
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
  const owner=character;
  if(!owner?.id||!activeId||!user)
   throw Error('Open a character sheet before using a library token.');
  if(owner.user_id!==user||owner.campaign_id!==activeId)
   throw Error('This character belongs to another account or campaign.');
  const changed=await read(db.from('characters').update({
    portrait_path:art.portraitPath,token_path:art.tokenPath
  }).eq('id',owner.id).eq('campaign_id',activeId).eq('user_id',user)
   .select('*').single());
  setCharacter(old=>old?.id===changed.id?{
   ...old,portrait_path:changed.portrait_path,token_path:changed.token_path
  }:old);
  setCharacters(old=>old.map(x=>x.id===changed.id?{
   ...x,portrait_path:changed.portrait_path,token_path:changed.token_path
  }:x));
  // Keep any current visible map token in sync with the sheet artwork.
  // RLS still limits edits to the player's own authorised tokens.
  try{
   await read(db.from('map_tokens').update({image_path:art.tokenPath})
    .eq('campaign_id',activeId).eq('character_id',owner.id).eq('owner_id',user));
   void refreshTokens();
  }catch(error){console.warn('Sheet artwork saved, but map token image could not refresh',error)}
  void refreshMonitors();
 }
 // A sheet pop-out runs under its own Supabase session,
 // with normal character RLS and account permissions.
 useEffect(()=>{
  if(!launchSheet||launchHandled.current||!camp||activeId!==launchSheet.campaignId)return;
  const row=characters.find(ch=>ch.id===launchSheet.characterId);
  if(!row)return;
  launchHandled.current=true;
  if(row.user_id===user)void openOwnCharacter(row.id).catch(fail);
  else if(isDM)void openPlayerCharacter(row.id,null);
  else fail('This sheet is not accessible from your account.');
 },[camp,characters,activeId,user,isDM]);
 // The browser popup is an independent authenticated client with DM-only RLS.
 // Only the requested NPC editor is visible; no campaign-wide private fields
 // are passed to the URL, and no state is shared unsafely between windows.
 useEffect(()=>{
  if(!launchNpc||launchNpcHandled.current||!camp||
   activeId!==launchNpc.campaignId||!isDM)return;
  launchNpcHandled.current=true;
  const load=async()=>{
   if(launchNpc.kind==='template'){
    const row=await read(db.from('npc_templates').select('*')
     .eq('campaign_id',activeId).eq('id',launchNpc.id).maybeSingle());
    if(!row)throw Error('This NPC template is no longer available.');
    openNpcEditor({kind:'template',data:row});
   }else{
    const row=await read(db.from('map_tokens').select('*')
     .eq('campaign_id',activeId).eq('id',launchNpc.id).maybeSingle());
    if(!row||row.character_id||row.owner_id)
     throw Error('Only NPC tokens can open in an NPC pop-out.');
    const vals=await read(db.rpc('get_npc_token_values',{p_token:row.id}));
    openNpcEditor({kind:'token',data:{...row,npc_values:vals||{}}});
   }
  };
  void load().catch(fail);
 },[launchNpc,camp,activeId,isDM]);
 // A previous map's slower request must never overwrite chat for a new map.
 async function refreshChat(){
  const request=++chatRequest.current,campaignId=activeId,mapId=selectedMap||null;
  if(!db||!campaignId){setMsgs([]);return}
  try{
   let q=db.from('chat_messages').select('*').eq('campaign_id',campaignId);
   q=mapId?q.eq('map_id',mapId):q.is('map_id',null);
   const rows=(await read(q.order('created_at',{ascending:false}).limit(100))).reverse();
   if(request===chatRequest.current)setMsgs(chatRowsForMap(rows,mapId));
  }catch(e){
   if(request===chatRequest.current)console.error('Could not refresh chat',e);
  }
 }
 async function refreshCampaignRoster(){
  const request=++rosterRequest.current,campaignId=activeId;
  if(!db||!campaignId)return;
  try{
   const [roster,sheets,names]=await Promise.all([
    read(db.from('campaign_members').select('user_id,role').eq('campaign_id',campaignId)),
    read(db.from('characters').select('*').eq('campaign_id',campaignId)),
    read(db.rpc('get_campaign_account_names',{p_campaign:campaignId}))
   ]);
   if(request!==rosterRequest.current)return;
   setMembers(roster);setCharacters(sheets);setAccountNames(names||[]);
   setCharacter(current=>sheets.find(ch=>ch.id===current?.id&&ch.user_id===user)||
    sheets.find(ch=>ch.user_id===user)||null);
  }catch(e){
   if(request===rosterRequest.current)
    console.warn('Could not refresh campaign roster',e);
  }
 }
 async function refreshMonitors(){
  const request=++monitorRequest.current;
  if(!selectedMap||!activeId){setMonitorValues({});setEncumbranceBadges({});return}
  try{
   const [rows,badges]=await Promise.all([
    read(db.rpc('get_token_monitor_values',{p_map:selectedMap})),
    read(db.rpc('get_token_encumbrance_badges',{p_map:selectedMap}))
   ]);
   if(request===monitorRequest.current){
    const latest=Object.fromEntries((rows||[]).map(row=>[row.token_id,row.fields||{}]));
    // Server reads can finish before a background edit. Keep local writes visible.
    for(const pending of quickWritePatches.current.values()){
     for(const id of pending.affected){
      if(latest[id])latest[id]={...latest[id],...pending.patch};
     }
    }
    setMonitorValues(latest);
    setEncumbranceBadges(Object.fromEntries((badges||[]).map(b=>[b.token_id,{
     icon:b.icon,label:b.label
    }])));
   }
  }catch(e){if(request===monitorRequest.current)console.error('Could not refresh token monitors',e)}
 }
 async function refreshTokens(){
  const request=++tokenRefreshSeq.current;
  const mapId=selectedMap,campaignId=activeId;
  if(!mapId){setTokens([]);return}
  try{
   const rows=await read(db.from('map_tokens').select(
    'id,campaign_id,map_id,owner_id,name,color,x,y,visible,updated_at,npc_template_id,character_id,image_path,span_x,span_y,npc_bars_public,status_effects'
   ).eq('map_id',mapId));
   // Ignore older requests, including requests started before switching maps.
   if(request!==tokenRefreshSeq.current||
      tokenContextRef.current.mapId!==mapId||
      tokenContextRef.current.campaignId!==campaignId)return;
   // Realtime snapshots may lag behind the newest keyboard or drag destination.
   // Merge the latest local destination until its database write is confirmed.
   setTokens(rows.map(token=>{
    const pending=movementPending.current.get(token.id);
    let projected=token;
    if(pending&&pending.mapId===mapId&&pending.campaignId===campaignId){
     // Preserve local movement until the snapshot actually confirms it.
     if(pending.confirmed&&Number(token.x)===pending.x&&Number(token.y)===pending.y)
      movementPending.current.delete(token.id);
     else projected={...projected,x:pending.x,y:pending.y};
    }
    const status=statusPatches.current.get(token.id);
    if(status&&status.mapId===mapId&&status.campaignId===campaignId){
     if(status.confirmed&&
        JSON.stringify(normalizedEffects(token.status_effects))===JSON.stringify(status.effects)){
      statusPatches.current.delete(token.id);
     }else projected={...projected,status_effects:status.effects};
    }
    return projected;
   }));
  }catch(e){
   if(request===tokenRefreshSeq.current)fail(e);
  }
 }
 useEffect(()=>{
  if(!db){setAuthReady(true);return}
  db.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true)});
  const {data}=db.auth.onAuthStateChange((event,s)=>{
   // Signed asset URLs carry access permissions: reset across identities.
   if(event==='SIGNED_IN'||event==='SIGNED_OUT')signedAssetStore.clear();
   setSession(s);
  });
  return()=>data.subscription.unsubscribe();
 },[]);
 useEffect(()=>{if(user)fetchCampaigns(launchSheet?.campaignId||launchNpc?.campaignId);else{setCampaigns([]);setActiveId('')}},[user]);
 useEffect(()=>{if(activeId&&user){setCamp(null);setTab('tabletop');setRightTab('chat');setMapSettingPopped(false);setSelectedTokenId(null);setQuickEditToken(null);setStatusEditToken(null);
  setPendingQuickTokens({});setStatusSavingTokens({});statusPatches.current.clear();
  setMacroBuilderOpen(false);setMacros([]);
  quickWritePatches.current.clear();quickCache.current.clear();setTab('tabletop');
  ++monitorRequest.current;setMapCalibrationPreview(null);setFolder(null);setNpcEditors([]);setCharacterEditor(null);setError('');fetchCampaign(activeId)}else if(!activeId){setMapSettingPopped(false);setCamp(null);setCharacter(null);setMaps([]);setTokens([]);setMsgs([]);setMembers([])}},[activeId,user]);
 useEffect(()=>{
  if(!db||!user){setBindings(normalizeBindings(DEFAULT_BINDINGS));setHotbarVisible(true);setUiScale(.9);return}
  let alive=true;
  db.from('tabletop_user_preferences').select('bindings,hotbar_visible,ui_scale').eq('user_id',user).maybeSingle()
   .then(({data,error})=>{
    if(!alive)return;
    if(error){console.error('Could not load keybindings',error);return}
    setBindings(normalizeBindings(data?.bindings||DEFAULT_BINDINGS));
    setHotbarVisible(data?.hotbar_visible!==false);
    setUiScale(Math.max(.8,Math.min(1.25,Number(data?.ui_scale)||.9)));
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
 useEffect(()=>{
  if(!db||!activeId||!user){setMacros([]);return}
  let live=true;
  setMacros([]);
  db.from('tabletop_macros').select('*').eq('campaign_id',activeId)
   .eq('user_id',user).order('updated_at',{ascending:false})
   .then(({data,error})=>{
    if(!live)return;
    if(error){console.error('Could not load personal macros',error);return}
    setMacros(data||[]);
   });
  return()=>{live=false};
 },[user,activeId]);
 // This listener survives selected-map changes; a map switch must never
 // unsubscribe navigation notifications during the transition.
 useEffect(()=>{
  if(!db||!activeId||!user)return;
  const channel=db.channel('vtt-routing-'+activeId,{
   config:{broadcast:{ack:true}}
  }).on('broadcast',{event:'routing-changed'},({payload})=>{
   if(!isDM&&(payload?.kind==='party'||payload?.targetId===user))
    void refreshPlayerMapRouting();
  }).on('broadcast',{event:'monitors-changed'},()=>{
   void latestMonitorRefresh.current?.();
  }).on('postgres_changes',{
   event:'*',schema:'public',table:'campaign_player_maps',
   filter:'campaign_id=eq.'+activeId
  },event=>{
   if(!isDM&&event.new?.user_id===user)void refreshPlayerMapRouting();
  }).on('postgres_changes',{
   event:'UPDATE',schema:'public',table:'campaigns',
   filter:'id=eq.'+activeId
  },()=>{if(!isDM)void refreshPlayerMapRouting()})
  .subscribe(status=>{
   // A reconnect reconciles notifications missed while a user was offline.
   if(status==='SUBSCRIBED'&&!isDM)void refreshPlayerMapRouting();
  });
  navigationChannel.current=channel;
  return()=>{
   if(navigationChannel.current===channel)navigationChannel.current=null;
   ++navigationRequest.current;
   void db.removeChannel(channel);
  };
 },[db,activeId,user,isDM]);
 // Fast ephemeral movement updates: a separate, PRIVATE map channel prevents
 // solo-map coordinates being broadcast to unauthorized players.
 useEffect(()=>{
  setRemoteTokenPositions({});
  setRemoteMeasurements({});
  for(const timer of measureExpiry.current.values())clearTimeout(timer);
  measureExpiry.current.clear();lastMeasureSent.current=0;
  measureRevisions.current.clear();measureClearRevisions.current.clear();
  for(const timer of remoteMoveExpiry.current.values())clearTimeout(timer);
  remoteMoveExpiry.current.clear();lastMovementPreview.current.clear();
  liveMapReady.current=false;
  if(!db||!activeId||!selectedMap||!user)return;
  const channel=db.channel(movementTopic(selectedMap),{
   config:{private:true,broadcast:{ack:false,self:false}}
  }).on('broadcast',{event:'token-preview'},({payload})=>{
   const access=latestMovementAccess.current;
   if(!allowedMovementPreview(payload,selectedMap,
    access.tokens||[],access.members||[],user))return;
   const id=payload.id;
   setRemoteTokenPositions(prev=>{
    if(prev[id]?.actor===payload.actor&&prev[id].seq>=payload.seq)return prev;
    return {...prev,[id]:{x:payload.x,y:payload.y,seq:payload.seq,actor:payload.actor}};
   });
   const last=remoteMoveExpiry.current.get(id);
   if(last)clearTimeout(last);
   const seq=payload.seq;
   const timer=setTimeout(()=>{
    remoteMoveExpiry.current.delete(id);
    setRemoteTokenPositions(prev=>{
     if(prev[id]?.seq!==seq)return prev;
     const copy={...prev};delete copy[id];return copy;
    });
    void latestTokenRefresh.current?.();
   },payload.final?3000:MOVE_PREVIEW_EXPIRE_MS);
   remoteMoveExpiry.current.set(id,timer);
  }).on('broadcast',{event:'map-measure'},({payload})=>{
   if(!validMeasurement(payload,selectedMap)||payload.actor===user)return;
   if(!acceptMeasurementEvent(payload,measureRevisions.current,
    measureClearRevisions.current))return;
   if(payload.phase==='clear'){
    for(const [key,timer] of measureExpiry.current){
     if(key.startsWith(payload.actor+':')){
      clearTimeout(timer);measureExpiry.current.delete(key);
     }
    }
   }else{
    const key=payload.actor+':'+payload.id;
    const oldTimer=measureExpiry.current.get(key);
    if(oldTimer)clearTimeout(oldTimer);
    measureExpiry.current.delete(key);
    if(payload.phase==='preview'){
     // This timer is ONLY a network-disconnect recovery fallback.
     // Normal left-button release broadcasts remove immediately.
     const timer=setTimeout(()=>{
      measureExpiry.current.delete(key);
      setRemoteMeasurements(previous=>{
       if(previous[payload.id]?.seq!==payload.seq)return previous;
       const next={...previous};delete next[payload.id];return next;
      });
     },4500);
     measureExpiry.current.set(key,timer);
    }
    // Pinned drawings have NO automatic removal timer.
   }
   setRemoteMeasurements(previous=>
    applyMeasurementEventToVisible(previous,payload));
  }).subscribe((status,error)=>{
   liveMapReady.current=status==='SUBSCRIBED';
   if(status==='CHANNEL_ERROR')console.warn('Fast map movement unavailable',error);
  });
  liveMapChannel.current=channel;
  return()=>{
   if(liveMapChannel.current===channel)liveMapChannel.current=null;
   liveMapReady.current=false;
   for(const timer of remoteMoveExpiry.current.values())clearTimeout(timer);
   remoteMoveExpiry.current.clear();
   for(const timer of measureExpiry.current.values())clearTimeout(timer);
   measureExpiry.current.clear();setRemoteMeasurements({});
   void db.removeChannel(channel);
  };
 },[db,activeId,selectedMap,user]);
 function sendLiveMovement(token,x,y,final=false){
  if(!canSendMovementPreview(token,user,selectedMap,isDM)||
    !Number.isInteger(x)||!Number.isInteger(y)||!liveMapReady.current)return;
  const now=Date.now(),last=lastMovementPreview.current.get(token.id)||0;
  if(!final&&now-last<MOVE_PREVIEW_INTERVAL_MS)return;
  lastMovementPreview.current.set(token.id,now);
  const channel=liveMapChannel.current;
  if(!channel)return;
  void channel.send({type:'broadcast',event:'token-preview',payload:{
   id:token.id,mapId:selectedMap,actor:user,x,y,
   seq:++liveMovementSeq.current,final
  }}).catch(e=>console.warn('Movement preview unavailable',e));
 }
 function sendLiveMeasurement(measure,phase='preview',force=false){
  if(!liveMapReady.current||!liveMapChannel.current||!displayedMap||!user)return;
  const now=Date.now();
  if(phase==='preview'&&!force&&now-lastMeasureSent.current<65)return;
  // Revisions keep out-of-order network previews from reappearing after clear.
  measureSequence.current=Math.max(now*1000,measureSequence.current+1);
  const data=liveMeasurementPayload(measure,measure?.id,user,selectedMap,
   phase,measureSequence.current);
  if(!validMeasurement(data,selectedMap,
   displayedMap.width/displayedMap.grid_size,
   displayedMap.height/displayedMap.grid_size))return;
  lastMeasureSent.current=now;
  void liveMapChannel.current.send({type:'broadcast',event:'map-measure',
   payload:data}).catch(error=>console.warn('Live measurement not delivered',error));
 }
 useEffect(()=>{
  if(!db||!activeId)return;
  const tokenUpdates=createCoalescedRefresh(()=>{
   void latestTokenRefresh.current?.();
   void latestMonitorRefresh.current?.();
  },100);
  const campaignUpdates=createCoalescedRefresh(()=>{
   void latestCampaignMetadataRefresh.current?.();
   void latestMonitorRefresh.current?.();
  },100);
  const c=db.channel('vtt-'+activeId)
   .on('postgres_changes',{event:'*',schema:'public',table:'map_tokens',
    filter:'campaign_id=eq.'+activeId},event=>{
    if(eventAffectsMap(event,tokenContextRef.current.mapId))
     tokenUpdates.request();
   })
   .on('postgres_changes',{event:'*',schema:'public',table:'campaigns',
    filter:'id=eq.'+activeId},()=>campaignUpdates.request())
   .on('postgres_changes',{event:'*',schema:'public',table:'npc_templates',
    filter:'campaign_id=eq.'+activeId},()=>void latestNpcsRefresh.current?.())
   .on('postgres_changes',{event:'*',schema:'public',table:'battle_maps',
    filter:'campaign_id=eq.'+activeId},()=>void latestMapsRefresh.current?.())
   .subscribe();
  return()=>{
   tokenUpdates.cancel();campaignUpdates.cancel();
   void db.removeChannel(c);
  };
 },[db,activeId,user]);

 // Keep the latest closures without tearing down network subscriptions on each
 // map change. Healthy Realtime uses sparse backstop polls; failures retain
 // the original faster backstop cadence and focus triggers reconciliation.
 latestChatRefresh.current=refreshChat;
 latestRosterRefresh.current=refreshCampaignRoster;
 useEffect(()=>{
  if(!db||!activeId||!user)return;
  const campaignId=activeId;
  const reconcile=createAdaptiveReconciler(
   ()=>latestChatRefresh.current?.(),
   {...CHAT_RECONCILE_MS,healthyMs:CHAT_RECONCILE_MS.healthy,
    fallbackMs:CHAT_RECONCILE_MS.fallback,
    isVisible:()=>document.visibilityState==='visible'}
  );
  const channel=db.channel('vtt-chat-'+campaignId)
   .on('postgres_changes',{event:'*',schema:'public',table:'chat_messages',
    filter:'campaign_id=eq.'+campaignId},()=>void latestChatRefresh.current?.())
   .subscribe(status=>{
    reconcile.setConnected(status==='SUBSCRIBED');
    if(status==='SUBSCRIBED')reconcile.refreshNow();
    if(status==='CHANNEL_ERROR')console.warn('Chat Realtime temporarily unavailable; using reconciliation.');
   });
  const focus=()=>{if(document.visibilityState==='visible')reconcile.refreshNow()};
  document.addEventListener('visibilitychange',focus);
  return()=>{
   reconcile.dispose();document.removeEventListener('visibilitychange',focus);
   void db.removeChannel(channel);
  };
 },[db,activeId,user]);
 useEffect(()=>{
  if(!db||!activeId||!user)return;
  const campaignId=activeId;
  // Character changes are published by the database. Presence detects new
  // member connections; reconciliation catches silent joins and disconnects.
  const reconcile=createAdaptiveReconciler(
   ()=>latestRosterRefresh.current?.(),
   {...ROSTER_RECONCILE_MS,healthyMs:ROSTER_RECONCILE_MS.healthy,
    fallbackMs:ROSTER_RECONCILE_MS.fallback,
    isVisible:()=>document.visibilityState==='visible'}
  );
  const channel=db.channel('vtt-roster-'+campaignId)
   .on('postgres_changes',{event:'*',schema:'public',table:'characters',
    filter:'campaign_id=eq.'+campaignId},()=>void latestRosterRefresh.current?.())
   .subscribe(status=>{
    reconcile.setConnected(status==='SUBSCRIBED');
    if(status==='SUBSCRIBED')reconcile.refreshNow();
   });
  const focus=()=>{if(document.visibilityState==='visible')reconcile.refreshNow()};
  document.addEventListener('visibilitychange',focus);
  return()=>{
   reconcile.dispose();document.removeEventListener('visibilitychange',focus);
   ++rosterRequest.current;
   void db.removeChannel(channel);
  };
 },[db,activeId,user]);
 useEffect(()=>{
  let alive=true;
  setOnlinePresenceKeys([]);
  if(!db||!activeId||!user)return;
  const campaignId=activeId;
  let channel=null;
  void campaignPresenceKey(campaignId,user).then(key=>{
   if(!alive||!key)return;
   // Public presence carries only a SHA-256 campaign-specific pseudonym.
   // No account identifiers, names or protected map information are broadcast.
   channel=db.channel('vtt-presence-'+campaignId,{
    config:{presence:{key}}
   });
   const sync=()=>{
    if(!alive)return;
    setOnlinePresenceKeys(Object.keys(channel.presenceState()));
    void latestRosterRefresh.current?.();
   };
   channel.on('presence',{event:'sync'},sync)
    .subscribe(async status=>{
     if(!alive)return;
     if(status==='SUBSCRIBED'){
      try{await channel.track({online:true})}
      catch(error){console.warn('Could not publish online status',error)}
     }else if(status==='CHANNEL_ERROR'){
      setOnlinePresenceKeys([]);
      console.warn('Player presence will retry',campaignId);
     }
    });
  }).catch(error=>console.warn('Player presence unavailable',error));
  return()=>{
   alive=false;setOnlinePresenceKeys([]);
   if(channel)void db.removeChannel(channel);
  };
 },[db,activeId,user]);
 useEffect(()=>{
  let alive=true;
  void Promise.all(members.map(async m=>[
   m.user_id,await campaignPresenceKey(activeId,m.user_id)
  ])).then(entries=>{if(alive)setMemberPresenceHashes(Object.fromEntries(entries))})
   .catch(error=>console.warn('Could not map party presence',error));
  return()=>{alive=false};
 },[activeId,members]);
 useEffect(()=>{
  movementPending.current.clear();
  ++tokenRefreshSeq.current;
 },[selectedMap,activeId,user]);
 useEffect(()=>{refreshTokens();refreshMonitors();refreshChat()},[selectedMap,activeId,user]);
 useEffect(()=>{
  let live=true;
  setMapEnvironment(null);mapEnvironmentCurrent.current=null;setMapEnvironmentMapId('');
  setMapSettingEditor(old=>({...old,enabled:false,previewing:false,previewTokenId:'',selectedId:null}));
  if(!db||!isDM||!activeId||!selectedMap){
   setMapEnvironmentStatus('Choose a map');return()=>{live=false};
  }
  setMapEnvironmentStatus('Loading map environment…');
  (async()=>{
   const {data,error:loadError}=await db.from('map_environments').select('prepared')
    .eq('campaign_id',activeId).eq('map_id',selectedMap).maybeSingle();
   if(!live)return;
   if(loadError){
    setMapEnvironmentStatus('Map storage unavailable: apply the staged environment migration first.');
    console.warn('Map environment loading failed',loadError);return;
   }
   mapEnvironmentCurrent.current=normalizeEnvironment(data?.prepared);
   setMapEnvironment(mapEnvironmentCurrent.current);
   setMapEnvironmentMapId(selectedMap);
   setMapEnvironmentStatus('Saved');
  })().catch(e=>{if(live){setMapEnvironmentStatus('Environment load failed');fail(e)}});
  return()=>{live=false};
 },[selectedMap,activeId,isDM,user]);
 useEffect(()=>{
  if(rightTab==='units')void refreshCampaignRoster();
  if(rightTab==='chat')void refreshChat();
 },[rightTab,activeId,user]);
 useEffect(()=>{
  latestMonitorRefresh.current=refreshMonitors;
  latestTokenRefresh.current=refreshTokens;
  latestCampaignMetadataRefresh.current=refreshCampaignMetadata;
  latestMapsRefresh.current=refreshMaps;
  latestNpcsRefresh.current=refreshNpcs;
  latestMovementAccess.current={tokens,members,mapId:selectedMap,user};
 });
 useEffect(()=>{
  if(!db||!user){setUrls({});return}
  setUrls(previous=>Object.fromEntries(maps.map(m=>[m.id,previous[m.id]||''])));
  const unsubscribe=maps.filter(m=>m.storage_path).map(m=>
   signedAssetStore.subscribe(db,'battlemap-assets',m.storage_path,url=>{
    setUrls(previous=>previous[m.id]===url?previous:{...previous,[m.id]:url});
   }));
  return()=>unsubscribe.forEach(stop=>stop());
 },[maps,user]);

 useEffect(()=>{
  if(!user||!camp||!['tabletop','sheet'].includes(tab))return;
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
    else if(character)setTab('sheet');
    else setRightTab('units');
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
 useEffect(()=>{
  const flush=()=>void mapEnvironmentWriter.current?.flush();
  const onVisibility=()=>{
   if(document.visibilityState==='hidden')flush();
  };
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('pagehide',flush);
  return()=>{
   document.removeEventListener('visibilitychange',onVisibility);
   window.removeEventListener('pagehide',flush);
   flush();
  };
 },[]);
 // Flush the previous map's final queued snapshot before switching targets.
 useEffect(()=>()=>{void mapEnvironmentWriter.current?.flush()},[selectedMap,activeId]);
 async function saveMyKeybindings(next){
  if(!user)throw Error('Sign in to save your keybindings.');
  const cleaned=normalizeBindings(next);
  await read(db.from('tabletop_user_preferences')
   .upsert({user_id:user,bindings:cleaned,hotbar_visible:hotbarVisible,ui_scale:uiScale},{onConflict:'user_id'}));
  setBindings(cleaned);
 }
 async function changeHotbarVisibility(visible){
  if(!user)return;
  await read(db.from('tabletop_user_preferences')
   .upsert({user_id:user,bindings,hotbar_visible:visible,ui_scale:uiScale},{onConflict:'user_id'}));
  setHotbarVisible(visible);
 }
 async function changeInterfaceScale(next){
  const value=Number(next);
  if(![.8,.9,1,1.1,1.25].includes(value))throw Error('Invalid interface scale');
  if(!user)return;
  const previous=uiScale;
  setUiScale(value);
  try{
   await read(db.from('tabletop_user_preferences')
    .upsert({user_id:user,bindings,hotbar_visible:hotbarVisible,ui_scale:value},
     {onConflict:'user_id'}));
  }catch(e){setUiScale(previous);fail(e)}
 }
 async function saveMacro(payload){
  if(!user||!activeId)throw Error('Select a campaign to save a macro.');
  const data={
   id:payload.id,campaign_id:activeId,user_id:user,
   name:String(payload.name||'').slice(0,80),
   subtitle:String(payload.subtitle||'').slice(0,100),
   source_type:payload.source_type||'none',
   source_id:payload.source_type==='none'?null:payload.source_id,
   rows:payload.rows
  };
  const saved=await read(db.from('tabletop_macros')
   .upsert(data,{onConflict:'id'}).select('*').single());
  setMacros(previous=>[saved,...previous.filter(m=>m.id!==saved.id)]
   .sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)));
  return saved;
 }
 async function deleteMacro(id){
  if(!macros.some(m=>m.id===id))throw Error('Macro not found.');
  await read(db.from('tabletop_macros').delete().eq('id',id)
   .eq('campaign_id',activeId).eq('user_id',user));
  setMacros(old=>old.filter(m=>m.id!==id));
  const command='/builder '+id;
  if(hotbarSlots.some(s=>s.command===command)){
   await saveMyHotbar(hotbarSlots.map(slot=>slot.command===command?{label:'',command:''}:slot));
  }
 }
 async function runMacro(id){
  if(!activeId)throw Error('No campaign selected.');
  await read(db.rpc('run_tabletop_macro',{p_macro_id:id}));
  await refreshChat();
 }
 async function assignMacro(payload,index=null){
  const id=String(payload?.id||'');
  const macro=macros.find(x=>x.id===id)||
   (payload?.campaign_id===activeId&&payload?.user_id===user?payload:null);
  if(!macro)throw Error('Save the macro before adding it to the hotbar.');
  const slotIndex=index===null?hotbarSlots.findIndex(s=>!s.command):index;
  if(!Number.isInteger(slotIndex)||slotIndex<0||slotIndex>=8)
   throw Error('Hotbar is full. Drag the macro onto a slot to replace it.');
  const entry={label:macro.name.slice(0,40),command:'/builder '+macro.id};
  const previous=hotbarSlots;
  const next=normaliseHotbar(previous).map((s,i)=>i===slotIndex?entry:s);
  setHotbarSlots(next);
  try{
   await saveMyHotbar(next);
   if(!hotbarVisible)await changeHotbarVisibility(true);
   return slotIndex;
  }catch(e){setHotbarSlots(previous);throw e}
 }
 async function saveMyHotbar(slots,{optimistic=false}={}){
  if(!user||!activeId)throw Error('Join a campaign before saving a hotbar.');
  const cleaned=normaliseHotbar(slots),owner=user,campaign=activeId;
  // Serialize writes so rapid drags cannot save an older order last.
  const work=hotbarWriteQueue.current.catch(()=>{}).then(()=>read(db.from('tabletop_hotbars')
   .upsert({user_id:owner,campaign_id:campaign,slots:cleaned},{onConflict:'user_id,campaign_id'})));
  hotbarWriteQueue.current=work.catch(()=>{});
  await work;
  if(!optimistic&&owner===user&&campaign===activeId){
   latestHotbar.current=cleaned;
   setHotbarSlots(cleaned);
  }
 }
 useEffect(()=>{latestHotbar.current=hotbarSlots},[hotbarSlots]);
 async function changeHotbarByDrag(transform){
  if(!user||!activeId)throw Error('Join a campaign before editing your hotbar.');
  const previous=latestHotbar.current;
  const next=transform(previous);
  if(JSON.stringify(next)===JSON.stringify(previous))return;
  latestHotbar.current=next;
  setHotbarSlots(next);
  try{await saveMyHotbar(next,{optimistic:true})}
  catch(e){
   // Don't undo a newer drag while an older save is completing.
   if(latestHotbar.current===next){
    latestHotbar.current=previous;
    setHotbarSlots(previous);
   }
   throw e;
  }
 }
 function rearrangeHotbar(from,to){
  return changeHotbarByDrag(slots=>reorderHotbarSlots(slots,from,to));
 }
 function clearHotbarSlot(index){
  return changeHotbarByDrag(slots=>removeHotbarSlot(slots,index));
 }
 async function create(e){e.preventDefault();setBusy(true);try{const id=await read(db.rpc('create_campaign',{p_name:createName.trim()}));setCreateName('');await fetchCampaigns(id)}catch(e){fail(e)}finally{setBusy(false)}}
 async function join(e){e.preventDefault();setBusy(true);try{const id=await read(db.rpc('join_campaign',{p_invite_code:joinCode.trim().toLowerCase()}));setJoinCode('');history.replaceState({},'',location.pathname);await fetchCampaigns(id)}catch(e){fail(e)}finally{setBusy(false)}}
 function writeSheetSnapshot(snapshot){
  // Preserve write order, even when a queued autosave and an immediate spell
  // cast try to persist different versions of the same character.
  const write=sheetWriteQueue.current.then(()=>read(db.from('characters')
   .update({field_values:snapshot.field_values,name:snapshot.name}).eq('id',snapshot.id)))
   .then(result=>{notifyMonitorRefresh();return result});
  sheetWriteQueue.current=write.catch(()=>{});
  return write;
 }
 function updateField(id,value){
  if(!character)return;
  const next={...character,field_values:enrichSheetValues(
    camp?.sheet_template,{...character.field_values,[id]:value}
  )};
  if(id==='character_name')next.name=String(value||'New Character');
  setCharacter(next);
  setCharacters(old=>old.map(ch=>ch.id===next.id?next:ch));
  // Instant, optimistic local monitor update; the server will replicate to others.
  const enc=evaluateEncumbrance(camp?.sheet_template,next.field_values);
  setEncumbranceBadges(old=>{
   const nextBadges={...old};
   for(const token of tokens.filter(t=>t.character_id===character.id)){
    if(enc.enabled&&enc.tier?.showOnToken===true)
     nextBadges[token.id]={icon:enc.tier.icon||'⚖️',label:enc.tier.label||'Encumbered'};
    else delete nextBadges[token.id];
   }
   return nextBadges;
  });
  const asNumber=(raw)=>{
   if(raw===null||raw===undefined||raw==='')return null;
   const n=Number(raw);return Number.isFinite(n)?n:null;
  };
  ++monitorRequest.current;
  setMonitorValues(old=>{
   const updated={...old};
   const referenceDefs=camp?.token_display_config?.references||[];
   const equipmentFields=(camp?.sheet_template?.tabs||[]).flatMap(t=>t.fields||[]);
   for(const token of tokens){
    if(token.character_id!==character.id||!old[token.id])continue;
    const fields={...old[token.id]};
    for(const ref of referenceDefs){
     if(!/^=@[a-z][a-z0-9_]{0,31}$/i.test(ref.code||''))continue;
     if(ref.source==='equipment_ac'){
      const equipment=equipmentFields.find(f=>f.id===ref.fieldId&&f.type==='equipment');
      if(equipment)fields[ref.code]=calculateArmor(equipment,next.field_values[ref.fieldId],next.field_values).total;
     }else if(ref.source==='field'){
      const item=next.field_values[ref.fieldId];
      const raw=item&&typeof item==='object'&&!Array.isArray(item)?item.current:item;
      if(raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw)))
       fields[ref.code]=Number(raw);
     }
    }
    const resource=value!==null&&typeof value==='object'&&!Array.isArray(value);
    if(resource){
     const current=asNumber(value.current),max=asNumber(value.max);
     if(current===null)delete fields[id];else fields[id]=current;
     if(max===null)delete fields[id+'__max'];else fields[id+'__max']=max;
    }else{
     const numeric=asNumber(value);
     if(numeric===null)delete fields[id];else fields[id]=numeric;
    }
    for(const [key,raw] of Object.entries(next.field_values)){
     if(key===id||!Number.isFinite(Number(raw))||raw===null||raw==='')continue;
     if(Number(old[token.id]?.[key])!==Number(raw))fields[key]=Number(raw);
    }
    updated[token.id]=fields;
   }
   return updated;
  });
  pendingSheetSave.current=next;
  setSaveState('Saving…');clearTimeout(saveTimer.current);
  saveTimer.current=setTimeout(async()=>{
   try{
    await writeSheetSnapshot(next);
    if(pendingSheetSave.current===next){pendingSheetSave.current=null;setSaveState('Saved');}
    refreshMonitors();
   }catch(e){setSaveState('Save failed');fail(e)}
  },200);
}
 async function flushSheetForCast(sourceId){
  // Flush the most recent locally visible spell. A pending older autosave
  // finishes first, preventing stale values from winning a later race.
  while(pendingSheetSave.current?.id===sourceId){
   const pending=pendingSheetSave.current;
   clearTimeout(saveTimer.current);
   await writeSheetSnapshot(pending);
   if(pendingSheetSave.current===pending){
    pendingSheetSave.current=null;setSaveState('Saved');
   }
  }
  await sheetWriteQueue.current;
 }
 async function castSpell({sourceType='character',sourceId,collectionId,entryId,mode='cast'}){
  if(!activeId||!sourceId)throw Error('No spell caster selected.');
  if(sourceType==='character')await flushSheetForCast(sourceId);
  await read(db.rpc('cast_collection_spell',{
   p_campaign_id:activeId,p_source_id:sourceId,p_source_type:sourceType,
   p_collection_id:collectionId,p_entry_id:entryId,p_mode:mode
  }));
  await refreshChat();
 }
 async function attackWithWeapon({sourceType='character',sourceId,fieldId,weaponId}){
  if(!activeId||!sourceId||!fieldId||!weaponId)throw Error('Select a saved weapon first.');
  if(sourceType==='character')await flushSheetForCast(sourceId);
  await read(db.rpc('roll_equipment_weapon',{
   p_campaign_id:activeId,p_source_type:sourceType,p_source_id:sourceId,
   p_field_id:fieldId,p_weapon_id:weaponId
  }));
  await refreshChat();
 }
 function spellHotbarPayload(payload){
  const {sourceType,sourceId,collectionId,entryId}=payload||{};
  if(!['character','npc_token','npc_template'].includes(sourceType)||
     !/^[0-9a-f-]{36}$/i.test(String(sourceId||''))||
     !/^[a-zA-Z0-9_-]{1,100}$/.test(String(collectionId||''))||
     !/^[a-zA-Z0-9-]{1,100}$/.test(String(entryId||'')))
   throw Error('This spell has an invalid hotbar reference.');
  const hasAccess=sourceType==='character'
   ?characters.some(ch=>ch.id===sourceId&&(ch.user_id===user||isDM))
   :isDM&&(sourceType==='npc_token'
     ?tokens.some(token=>token.id===sourceId)
     :npcs.some(npc=>npc.id===sourceId));
  if(!hasAccess)throw Error('That spell is not on a character or NPC you can control.');
  return {label:String(payload.label||'Spell').slice(0,40),
   command:'/spell '+sourceType+' '+sourceId+' '+collectionId+' '+entryId};
 }
 async function assignSpellToHotbar(payload,slotIndex=null){
  const slot=spellHotbarPayload(payload);
  const index=slotIndex===null?hotbarSlots.findIndex(item=>!item.command):slotIndex;
  if(!Number.isInteger(index)||index<0||index>=8)
   throw Error('Your hotbar is full. Drag the spell onto a slot to replace it.');
  const prior=hotbarSlots;
  const next=normaliseHotbar(prior).map((item,i)=>i===index?slot:item);
  setHotbarSlots(next);
  try{
   await saveMyHotbar(next);
   if(!hotbarVisible)await changeHotbarVisibility(true);
   return index;
  }catch(e){setHotbarSlots(prior);throw e}
 }
 async function roll(formula,label='Dice roll',charId=character?.id){try{await read(db.rpc('roll_dice',{p_campaign_id:activeId,p_expression:formula,p_label:label,p_character_id:charId||null}));await refreshChat()}catch(e){fail(e)}}
 async function sendChat(e){e.preventDefault();const raw=chat.trim();if(!raw)return;
 setChat('');
 const reference=raw.match(/^=@([a-z][a-z0-9_]{0,31})$/i);
 if(reference){
  try{
   if(!selectedToken||selectedToken.map_id!==selectedMap)
    throw Error('Select your token on the battlemap to use a reference code.');
   if(selectedToken.character_id===character?.id)await flushSheetForCast(character.id);
   await read(db.rpc('post_token_reference',{
    p_token:selectedToken.id,p_code:'=@'+reference[1]
   }));
   await refreshChat();
  }catch(e){fail(e)}
  return;
 }
 const builder=raw.match(/^\/builder\s+([0-9a-f-]{36})$/i);
 if(builder){try{await runMacro(builder[1])}catch(e){fail(e)}return}
 const spell=raw.match(/^\/spell\s+(character|npc_token|npc_template)\s+([0-9a-f-]{36})\s+([a-zA-Z0-9_-]{1,100})\s+([a-zA-Z0-9-]{1,100})$/i);
 if(spell){try{await castSpell({sourceType:spell[1],sourceId:spell[2],collectionId:spell[3],entryId:spell[4]})}catch(e){fail(e)}return}
 if(/^\/(roll|r)\s+/i.test(raw))return roll(raw.replace(/^\/(roll|r)\s+/i,''),'Dice roll',null);
 if(/^\/macro\s+/i.test(raw)){
  const label=raw.replace(/^\/macro\s+/i,'').trim().toLowerCase();
  const saved=macros.find(m=>m.name.toLowerCase()===label);
  if(saved){try{await runMacro(saved.id)}catch(e){fail(e)}return}
  const field=camp?.sheet_template?.tabs?.flatMap(t=>t.fields)
   .find(f=>f.type==='roll'&&f.label.toLowerCase()===label);
  if(field)return roll(field.formula||'1d20',field.label);
  return fail('Macro not found');
 }
 try{await read(db.from('chat_messages').insert({campaign_id:activeId,user_id:user,body:raw.startsWith('/em ')?'*'+raw.slice(4)+'*':raw,map_id:selectedMap||null}));await refreshChat()}catch(e){fail(e)}}
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
 function exportTemplate(){
  try{
   const json=serializeSheetTemplate(template);
   const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
   const a=document.createElement('a');
   a.href=url;a.download=(camp?.name||'tabletop-forge').replace(/[^a-z0-9_-]+/gi,'-').slice(0,60)+'-sheet-template.json';
   document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setSaveState('Template exported to your device.');
  }catch(e){fail(e)}
 }
 async function importTemplateFile(event){
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file)return;
  try{
   if(file.size>2_000_000)throw Error('Choose a JSON template smaller than 2 MB.');
   const imported=parseSheetTemplateFile(await file.text());
   if(!confirm('Replace the current template in the designer? Your campaign will not change until you click Save template.'))return;
   setTemplate(imported);
   setSheetTab(imported.tabs[0].id);
   setSaveState('Imported locally — click Save template to apply to campaign.');
  }catch(e){fail(e)}
 }
 async function saveTemplate(){setBusy(true);try{
  validateSheetTemplate(template);
  validateModifierRules(template);
  sheetQuickcodeReferences(template);
  const config=configWithSheetQuickcodes(camp?.token_display_config,template);
  const saved=await read(db.from('campaigns').update({
   sheet_template:template,token_display_config:config
  }).eq('id',activeId).select('sheet_template,token_display_config').single());
  setCamp(x=>({...x,...saved}));setSaveState('Template and quickcodes saved');
  await refreshMonitors();
 }catch(e){fail(e)}finally{setBusy(false)}}
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
 function getLocalQuickValues(token){
  if(!token)return {};
  const cached=quickCache.current.get(token.id)||{};
  const allowed=camp?.token_quick_fields||[];
  const fields=(camp?.sheet_template?.tabs||[]).flatMap(t=>t.fields||[])
   .filter(f=>allowed.includes(f.id));
  const visible=monitorValues[token.id]||{};
  const record=characters.find(ch=>ch.id===token.character_id);
  const fromSheet=(character?.id===token.character_id?character?.field_values:null)
   ||record?.field_values||{};
  const result={...cached};
  for(const field of fields){
   if(Object.prototype.hasOwnProperty.call(fromSheet,field.id)){
    result[field.id]=fromSheet[field.id];continue;
   }
   if(Object.prototype.hasOwnProperty.call(result,field.id))continue;
   if(Object.prototype.hasOwnProperty.call(visible,field.id)){
    result[field.id]=field.type==='resource'
     ?{current:visible[field.id],max:visible[field.id+'__max']??''}
     :visible[field.id];
   }
  }
  return result;
 }
 function openQuickToken(t){
  if(!t||(!isDM&&t.owner_id!==user))return;
  if(!isDM&&playerMapId!==t.map_id)return;
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
  const prior=quickCache.current.get(token.id)||{};
  const nextCache={...prior};
  for(const [id,parts] of Object.entries(changes)){
   if(fieldTypes.get(id)==='resource'){
    const old=prior[id];
    nextCache[id]={
     ...(old&&typeof old==='object'&&!Array.isArray(old)?old:{current:old??'',max:''}),
     ...parts
    };
   }else nextCache[id]=parts.current;
  }
  quickCache.current.set(token.id,nextCache);
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
    quickCache.current.delete(token.id);
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
 async function saveStatusCatalog(next){
  if(!isDM||!camp)throw Error('Only the DM can configure campaign effects.');
  if(!Array.isArray(next)||next.length>24)throw Error('At most 24 custom effects are supported.');
  const cleaned=normalizedCatalog(next);
  if(cleaned.length!==next.length)throw Error('An effect contains invalid settings.');
  const result=await read(db.from('campaigns')
   .update({token_status_catalog:cleaned}).eq('id',activeId)
   .select('token_status_catalog').single());
  setCamp(previous=>({...previous,token_status_catalog:result.token_status_catalog}));
 }
 function openTokenStatuses(token){
  if(!token||!activeId)return;
  if(!isDM&&(token.map_id!==playerMapId||!token.visible))return;
  if(statusPatches.current.has(token.id)&&!statusPatches.current.get(token.id)?.confirmed){
   fail('Status changes for '+token.name+' are still saving. You can edit another token.');
   return;
  }
  setStatusEditToken(token);
 }
 function applyTokenStatuses(token,next){
  if(!token||token.map_id!==selectedMap||!activeId)return false;
  if(!isDM&&(token.owner_id!==user||token.map_id!==playerMapId))return false;
  if(statusPatches.current.has(token.id)){
   fail('Please let '+token.name+' finish its previous status save.');
   return false;
  }
  const effects=normalizedEffects(next);
  if(effects.length!==next.length)throw Error('Invalid or duplicate effects.');
  const currentCampaign=activeId,currentMap=selectedMap;
  const entry={effects,confirmed:false,mapId:currentMap,campaignId:currentCampaign};
  statusPatches.current.set(token.id,entry);
  setStatusSavingTokens(previous=>({...previous,[token.id]:true}));
  setTokens(previous=>previous.map(t=>t.id===token.id?{...t,status_effects:effects}:t));
  void db.rpc('set_token_statuses',{p_token:token.id,p_statuses:effects})
   .then(({error})=>{
    if(error)throw error;
    if(statusPatches.current.get(token.id)!==entry)return;
    entry.confirmed=true;
    if(tokenContextRef.current.mapId===currentMap&&tokenContextRef.current.campaignId===currentCampaign){
     setStatusSavingTokens(previous=>{const updated={...previous};delete updated[token.id];return updated});
     void refreshTokens();
    }
   }).catch(e=>{
    if(statusPatches.current.get(token.id)!==entry)return;
    statusPatches.current.delete(token.id);
    if(tokenContextRef.current.mapId===currentMap&&tokenContextRef.current.campaignId===currentCampaign){
     setStatusSavingTokens(previous=>{const updated={...previous};delete updated[token.id];return updated});
     fail('Could not save '+token.name+'\'s status effects. Server values restored: '+message(e));
     void refreshTokens();
    }
   });
  return true;
 }
 async function saveTokenDisplay(config){
  if(!isDM||!camp)throw Error('Only the DM can change token display settings.');
  // The Sheet Designer owns quickcodes. Token layout edits must preserve them.
  const latest={...config,references:camp?.token_display_config?.references||[]};
  const data=await read(db.from('campaigns')
   .update({token_display_config:latest}).eq('id',activeId)
   .select('token_display_config').single());
  setCamp(prev=>({...prev,token_display_config:data.token_display_config}));
  await refreshMonitors();
 }
 function saveMapEnvironment(nextValue,{immediate=false}={}){
  if(!isDM||!selectedMap||mapEnvironmentMapId!==selectedMap){
   setMapEnvironmentStatus('Map settings are not loaded or cannot be edited.');return;
  }
  const next=normalizeEnvironment(nextValue);
  const mapId=selectedMap,campaignId=activeId;
  mapEnvironmentCurrent.current=next;
  setMapEnvironment(next);setMapEnvironmentStatus('Saving…');
  mapEnvironmentWriter.current.schedule(next,{mapId,campaignId},{immediate});
 }
 function addEnvironmentObject(object){
  if(mapEnvironmentMapId!==selectedMap||!mapEnvironmentCurrent.current)return;
  saveMapEnvironment(withObject(mapEnvironmentCurrent.current,object),{immediate:true});
 }
 function patchEnvironmentObject(id,change,{immediate=false}={}){
  if(!isDM||mapEnvironmentMapId!==selectedMap||!mapEnvironmentCurrent.current)return;
  if(!mapEnvironmentCurrent.current.objects.some(object=>object.id===id))return;
  saveMapEnvironment(patchObject(mapEnvironmentCurrent.current,id,change),{immediate});
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
 async function selectMap(id){
  if(!isDM||!maps.some(map=>map.id===id))throw Error('Only the DM can select any campaign map.');
  await read(db.from('campaign_map_views').upsert({
   campaign_id:activeId,user_id:user,map_id:id
  },{onConflict:'campaign_id,user_id'}));
  setMapCalibrationPreview(null);setSelectedTokenId(null);
  setSelectedMap(id);setTab('tabletop');
 }
 async function assignPlayerMap(memberId,mapId){
  if(!isDM||!members.some(member=>member.user_id===memberId&&member.role==='player'))
   return fail('Only the DM can assign players to maps.');
  if(mapId&&!maps.some(map=>map.id===mapId))return fail('Choose a campaign map.');
  try{
   const item=await read(db.from('campaign_player_maps').upsert({
    campaign_id:activeId,user_id:memberId,map_id:mapId||null
   },{onConflict:'campaign_id,user_id'}).select('*').single());
   setMapAssignments(old=>[...old.filter(x=>x.user_id!==memberId),item]);
    notifyMapRouting({targetId:memberId});
  }catch(e){fail(e)}
 }
 async function publishMap(id){try{
  await read(db.from('campaigns').update({active_map_id:id}).eq('id',activeId));
  setCamp(x=>({...x,active_map_id:id}));
  notifyMapRouting({kind:'party'});
  await refreshMaps();
 }catch(e){fail(e)}}
 async function moveEntireParty(id){
  if(!isDM||!maps.some(map=>map.id===id))return fail('Choose a campaign map for the party.');
  try{
   await read(db.rpc('move_entire_party_to_map',{p_campaign:activeId,p_map:id}));
   setCamp(x=>({...x,active_map_id:id}));
   setMapAssignments([]);
   notifyMapRouting({kind:'party'});
   await refreshMaps();
  }catch(e){fail(e)}
 }
 async function addToken(){if(!selectedMap)return;try{
  const ch=characters.find(c=>c.id===tokenOwner);
  await read(db.from('map_tokens').insert({
   campaign_id:activeId,map_id:selectedMap,name:newToken.trim()||ch?.name||'Token',
   owner_id:ch?.user_id||null,character_id:ch?.id||null,
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
   const spell=command.match(/^\/spell\s+(character|npc_token|npc_template)\s+([0-9a-f-]{36})\s+([a-zA-Z0-9_-]{1,100})\s+([a-zA-Z0-9-]{1,100})$/i);
   const builder=command.match(/^\/builder\s+([0-9a-f-]{36})$/i);
   const macro=command.match(/^\/macro\s+(.+)$/i);
   const say=command.match(/^\/(em|say)\s+([\s\S]+)$/i);
   if(builder){await runMacro(builder[1]);return;}
   if(spell){
    await castSpell({sourceType:spell[1],sourceId:spell[2],
     collectionId:spell[3],entryId:spell[4]});return;
   }
   if(dice){
    await roll(applyFields(dice[1]),slot.label||'Hotbar roll');return;
   }
   if(macro){
    const saved=macros.find(m=>m.name.toLowerCase()===macro[1].trim().toLowerCase());
    if(saved){await runMacro(saved.id);return}
    const target=camp.sheet_template?.tabs?.flatMap(t=>t.fields||[])
     .find(field=>field.type==='roll'&&field.label.trim().toLowerCase()===macro[1].trim().toLowerCase());
    if(!target)throw Error('Cannot find sheet macro "'+macro[1]+'". Check its name in Sheet Designer.');
    await roll(applyFields(target.formula||'1d20'),target.label);return;
   }
   if(say){
    const message=say[2].trim();
    if(!message)return;
    await read(db.from('chat_messages').insert({campaign_id:activeId,user_id:user,
     body:say[1].toLowerCase()==='em'?'*'+message+'*':message,map_id:selectedMap||null}));
    await refreshChat();return;
   }
   throw Error('Unsupported hotbar command. Use /builder, /spell, /roll, /macro, /em or /say.');
  }catch(e){fail(e)}
 }
 function queueTokenMove(token,x,y){
  if(!token||!activeId||!selectedMap||token.map_id!==selectedMap)return;
  if(!isDM&&(token.owner_id!==user||playerMapId!==selectedMap))return;
  const id=token.id;
  let pending=movementPending.current.get(id);
  if(!pending||pending.mapId!==selectedMap||pending.campaignId!==activeId){
   pending={mapId:selectedMap,campaignId:activeId,
    x:Number(token.x),y:Number(token.y),saving:false,confirmed:false};
   movementPending.current.set(id,pending);
  }
  if(pending.x===x&&pending.y===y)return;
  pending.x=x;pending.y=y;pending.confirmed=false;
  // Immediate feedback: moving a token never waits for a database round trip.
  setTokens(rows=>rows.map(t=>t.id===id?{...t,x,y}:t));
  sendLiveMovement(token,x,y,true);
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
    // Server acknowledged the destination; keep drawing it until a fresh
    // authoritative snapshot actually contains it (no post-ack rubberband).
    pending.confirmed=true;
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
 if(!activeId)return <><CampaignHub
  campaigns={campaigns} loading={campaignsLoading} roles={roles}
  accountLabel={session.user?.user_metadata?.username||session.user?.user_metadata?.display_name||session.user?.email||'Adventurer'}
  createName={createName} onCreateName={setCreateName}
  inviteCode={joinCode} onInviteChange={setJoinCode}
  onCreate={create} onJoin={join} onSelect={setActiveId}
  onSignOut={()=>db.auth.signOut()}
  onOpenAccountSettings={()=>setAccountSettingsOpen(true)}
  error={error} onClearError={()=>setError('')}/>
  {accountSettingsOpen&&<AccountSettings db={db} user={session.user}
   onClose={()=>setAccountSettingsOpen(false)} onUpdated={accountUpdated}/>}
 </>;
 if(launchNpc&&!isDM&&camp)return <div className="center" role="alert">
  Only the campaign DM can open an NPC pop-out.
 </div>;
 if(!camp)return <div className="welcome-screen"><div className="welcome-shell"><h2>Opening campaign…</h2><p className="muted small">Loading your maps and character sheets.</p><button className="secondary" onClick={()=>setActiveId('')}>Back to main menu</button></div></div>;
 return <div className={'app no-left-rail'+(launchNpc?' npc-popup-app':'')+
  (launchSheet?' sheet-popup-app':'')} style={{'--ui-scale':uiScale}}>
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
 {tab==='sheet'&&<FloatingWindow kind="sheet" onClose={()=>launchSheet?window.close():setTab('tabletop')}>
 <section className="panel page-panel floating-sheet-content"><div className="heading"><div className="character-heading">
 <Artwork db={db} path={character?.portrait_path} alt={character?.name||'Character'} className="character-portrait"/>
 <div><h2>{character?.name||'Character'}</h2><span className="muted small">{saveState}</span></div></div>
 <label className="character-sheet-switch">Sheet
   <select aria-label="Switch character sheet" value={character?.id||''}
    onChange={e=>openOwnCharacter(e.target.value).catch(fail)}>
    {characters.filter(ch=>ch.user_id===user).map(ch=>
     <option key={ch.id} value={ch.id}>{ch.name||'Unnamed character'}</option>)}
   </select>
  </label>
  <button type="button" className="secondary" disabled={!character}
   onClick={()=>openSheetBrowserTab(character.id)} title="Open this character sheet in a separate browser window">
   ↗ Pop out</button>
  <button type="button" className="secondary" disabled={!character}
   onClick={()=>setArtStudio(true)}>My Token Library</button>
  <button type="button" className="secondary return-to-game" onClick={()=>launchSheet?window.close():setTab('tabletop')}>{launchSheet?'Close window':'← Return to Game'}</button>
</div><div className="tabs">{camp.sheet_template.tabs.map(t=><button key={t.id} className={sheetTab===t.id?'selected':''} onClick={()=>setSheetTab(t.id)}>{t.name}</button>)}
 <button className={sheetTab===PERSONAL_RESOURCE_TAB?'selected':''}
  onClick={()=>setSheetTab(PERSONAL_RESOURCE_TAB)}>Resources</button></div>
 {sheetTab===PERSONAL_RESOURCE_TAB?
 <div className="fields"><div className="field span3">
  <PersonalResources value={character?.field_values?.[PERSONAL_RESOURCE_KEY]||[]}
   onChange={v=>updateField(PERSONAL_RESOURCE_KEY,v)}/>
 </div></div>:
 <div className="fields">{(camp.sheet_template.tabs.find(t=>t.id===sheetTab)||camp.sheet_template.tabs[0])?.fields.map(f=><div className={'field span'+(f.span||1)+(f.type==='inventory'&&f.inventoryPreset==='grid'?' inventory-grid-field':'')} key={f.id}><label>{f.label}</label>{f.type==='roll'?<button className="rollbtn" onClick={()=>roll(f.formula||'1d20',f.label)}>🎲 {f.label} <small>{f.formula}</small></button>:f.type==='inventory'?<InventoryPanel field={f} value={character?.field_values?.[f.id]||[]}
       template={camp?.sheet_template} sheetValues={character?.field_values}
       onChange={v=>updateField(f.id,v)}/>:
 f.type==='magic_dashboard'?<MagicDashboard field={f}
  value={character?.field_values?.[f.id]||{}}
  sheetValues={character?.field_values||{}}
  onChange={v=>updateField(f.id,v)}/>:
 f.type==='equipment'?<EquipmentManager field={f} template={camp.sheet_template}
  value={character?.field_values?.[f.id]||{}} sheetValues={character?.field_values||{}}
  onChange={v=>updateField(f.id,v)}
  onAttack={({fieldId,weaponId})=>attackWithWeapon({
   sourceType:'character',sourceId:character?.id,fieldId,weaponId
  })}/>:
 f.type==='progression'?<ProgressionPanel field={f}
  value={character?.field_values?.[f.id]||{}} sheetValues={character?.field_values||{}}
  onChange={v=>updateField(f.id,v)}/>:
 f.type==='proficiencies'?<ProficienciesPanel field={f}
  value={character?.field_values?.[f.id]||{}} sheetValues={character?.field_values||{}}
  template={camp.sheet_template} onChange={v=>updateField(f.id,v)}
  onRoll={(formula,label)=>roll(formula,label)}/>:
 f.type==='collection'?<RepeatingCollection field={f}
 value={character?.field_values?.[f.id]||[]} sheetValues={character?.field_values||{}}
 sourceType="character" sourceId={character?.id}
 onChange={v=>updateField(f.id,v)} onRoll={(formula,label)=>roll(formula,label)}
 onCastSpell={({collectionId,entryId,mode})=>castSpell({
  sourceType:'character',sourceId:character?.id,collectionId,entryId,mode
 })}
 onAddSpellToHotbar={assignSpellToHotbar}/>:
 f.type==='attribute'?<AttributeField field={f}
  value={character?.field_values?.[f.id]} values={character?.field_values||{}}
  template={camp.sheet_template} onChange={v=>updateField(f.id,v)}
  onProficiencyChange={v=>updateField(f.id+'__save_prof',v)}
  onRoll={(formula,label)=>roll(formula,label)}/>:
 f.type==='list'?<SheetListField field={f} template={camp.sheet_template}
  value={character?.field_values?.[f.id]} onChange={v=>updateField(f.id,v)}/>:
 f.type==='resource'?<ResourceField value={character?.field_values?.[f.id]} onChange={v=>updateField(f.id,v)}/>:f.type==='checkbox'?<input type="checkbox" checked={!!character?.field_values?.[f.id]} onChange={e=>updateField(f.id,e.target.checked)}/>:f.type==='textarea'?<textarea value={character?.field_values?.[f.id]??''} onChange={e=>updateField(f.id,e.target.value)}/>:<input type={f.type==='number'?'number':'text'} value={character?.field_values?.[f.id]??D(f)} onChange={e=>updateField(f.id,e.target.value)} />}</div>)}</div>}</section>
 </FloatingWindow>}
 {tab==='designer'&&isDM&&<section className="panel page-panel"><div className="heading"><h2>Visual sheet designer</h2><div className="page-header-actions">
 <button type="button" className="secondary return-to-game" onClick={()=>setTab('tabletop')}>← Return to Game</button>
 <button type="button" className="secondary" onClick={exportTemplate}>Export JSON</button>
 <label className="button secondary">Import JSON
  <input type="file" hidden accept=".json,application/json"
   onChange={importTemplateFile} aria-label="Import local sheet template JSON"/>
 </label>
 <button type="button" disabled={busy} onClick={saveTemplate}>Save template</button>
 </div></div><p className="muted">Drag fields to reorder them. Each campaign member keeps their own saved values.</p><div className="tabs">{template?.tabs.map(t=><button key={t.id} className={sheetTab===t.id?'selected':''} onClick={()=>setSheetTab(t.id)}>{t.name}</button>)}<button onClick={()=>{const name=prompt('New tab name');if(name?.trim())changeTemplate(t=>t.tabs.push({id:'tab_'+uid().slice(0,8),name:name.trim(),fields:[]}))}}>+ Tab</button>
 <button type="button" className="secondary" onClick={()=>{
  const existing=template.tabs.find(t=>t.name.toLowerCase()==='equipment');
  if(existing){
   changeTemplate(x=>x.tabs.find(t=>t.id===existing.id).fields.push(makeEquipmentField()));
   setSheetTab(existing.id);
  }else{
   const preset=makeEquipmentTab();
   changeTemplate(x=>x.tabs.push(preset));setSheetTab(preset.id);
  }
 }}>+ Equipment tab</button>
 <button type="button" className="secondary" onClick={()=>{
  const progression=makeProgressionField(),proficiencies=makeProficienciesField();
  proficiencies.progressionField=progression.id;
  const tab={id:'tab_'+uid().slice(0,8),name:'Advancement',
   fields:[progression,proficiencies]};
  changeTemplate(x=>x.tabs.push(tab));setSheetTab(tab.id);
 }}>+ Advancement tab</button></div><Designer template={template} tabId={sheetTab} changeTemplate={changeTemplate} onLinkResource={linkResourceToToken}/></section>}
 {tab==='maps'&&isDM&&<section className="panel page-panel"><div className="heading"><h2>Map library</h2><div className="page-header-actions">
 <button type="button" className="secondary return-to-game" onClick={()=>setTab('tabletop')}>← Return to Game</button>
 <label className="button">+ Upload map <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadMap}/></label>
 </div></div>{uploading&&<p>Compressing and uploading…</p>}<div className="library"><div><button className={'nav '+(!folder?'active':'')} onClick={()=>setFolder(null)}>All maps</button>{folders.map(f=><button key={f.id} className={'nav '+(folder===f.id?'active':'')} style={{paddingLeft:f.parent_id?26:10}} onClick={()=>setFolder(f.id)}>📁 {f.name}</button>)}<form className="stack" onSubmit={addFolder}><input required placeholder="Folder name" value={newFolder} onChange={e=>setNewFolder(e.target.value)}/><button className="secondary">+ Folder</button></form></div><div className="mapcards">{maps.filter(m=>m.folder_id===folder).map(m=><article className="mapcard" key={m.id} onClick={()=>selectMap(m.id).catch(fail)}>{urls[m.id]?<img src={urls[m.id]}/>:<div className="placeholder">Map</div>}<strong>{m.name}</strong><small>{m.width} × {m.height}</small></article>)}</div></div></section>}
 {/* Preserve the same map and viewport across other workspace tabs. Keep the
     signed image mounted; only hide the tabletop until it is needed again. */}
 <section className="panel tabletop-panel map-only-panel"
  style={tab==='tabletop'||tab==='sheet'?undefined:{display:'none'}}
  aria-hidden={tab!=='tabletop'&&tab!=='sheet'}>
  {displayedMap?<><Board db={db} map={displayedMap} url={urls[activeMap.id]} tokens={tokens}
   environment={mapEnvironmentMapId===selectedMap?mapEnvironment:null}
   active={tab==='tabletop'||tab==='sheet'} combatActiveTokenId={combatActiveTokenId}
   environmentEditor={mapSettingEditor} onAddEnvironmentObject={addEnvironmentObject}
   onPatchEnvironmentObject={patchEnvironmentObject} characters={characters}
   template={camp?.sheet_template} onSelectEnvironmentObject={id=>setMapSettingEditor(old=>({...old,selectedId:id}))}
   user={user} isDM={isDM} move={moveToken} remove={removeToken}
   onNpcDrop={placeNpc} onCharacterDrop={placeCharacterOnMap}
    onMovementPreview={sendLiveMovement} remotePositions={remoteTokenPositions}
    onMeasurementPreview={sendLiveMeasurement} remoteMeasurements={remoteMeasurements}
   onUnitDrop={dropExistingUnit} onTokenEdit={openTokenSheet} onTokenQuick={openQuickToken}
   onTokenStatus={openTokenStatuses} statusCatalog={camp?.token_status_catalog}
   resize={resizeToken}
   scale={mapZoom} setScale={setMapZoom} selectedId={selectedTokenId} setSelectedId={setSelectedTokenId}
   displayConfig={camp?.token_display_config} monitorValues={monitorValues}
   encumbranceBadges={encumbranceBadges} hotbarInset={hotbarVisible}/>
   {(Object.keys(pendingQuickTokens).length+Object.keys(statusSavingTokens).length)>0&&
    <div className="quick-save-status" role="status">
     <span className="quick-save-pulse" aria-hidden="true"/>
     Saving token changes…
    </div>}
   {hotbarVisible&&<MacroHotbar slots={hotbarSlots} bindings={bindings}
    onExecute={useHotbarSlot} onConfigure={()=>setRightTab('settings')}
    onAssignSpell={(index,payload)=>assignSpellToHotbar(payload,index).catch(fail)}
    onAssignMacro={(index,payload)=>assignMacro(payload,index).catch(fail)}
    onReorderSlot={(from,to)=>rearrangeHotbar(from,to).catch(fail)}
    onRemoveSlot={index=>clearHotbarSlot(index).catch(fail)}/>}
  </>
  :<div className="empty-tabletop">
    <p>{isDM?'No map selected. Upload a map to get started.':'The DM has not published a map yet.'}</p>
    {isDM&&<button type="button" onClick={()=>setTab('maps')}>Open map library</button>}
   </div>}
 </section>
 </>}
 </div><TabletopSidebar
 db={db} panel={rightTab} onPanelChange={setRightTab} isDM={isDM} user={user}
 messages={msgs} characters={characters} members={members} accountNames={accountNames}
 onlineMembers={onlineMembers} tokens={tokens}
 selectedToken={selectedToken} onSelectToken={setSelectedTokenId}
 onOpenToken={openTokenSheet} onResizeToken={resizeToken}
 onOpenStatus={openTokenStatuses}
 chat={chat} onChatChange={setChat} onSendChat={sendChat}
 npcs={npcs} npcFolders={npcFolders}
 onNewNpcFolder={makeNpcFolder} onNewNpc={makeNpc}
 onEditNpc={n=>openNpcEditor({kind:'template',data:n})}
 onMoveNpc={moveNpcFolder} onPlaceNpc={id=>placeNpc(id)}
 activeMap={activeMap} maps={maps} selectedMap={selectedMap} onSelectMap={id=>selectMap(id).catch(fail)}
 mapEnvironment={mapEnvironmentMapId===selectedMap?mapEnvironment:null}
 mapEnvironmentStatus={mapEnvironmentStatus}
 mapSettingEditor={mapSettingEditor} onMapSettingEditorChange={setMapSettingEditor}
 mapSettingPopped={mapSettingPopped}
 combat={combatTracker.combat} combatPrivateEntries={combatTracker.privateEntries}
 combatBusy={combatTracker.busy} combatStatus={combatTracker.status}
 combatOpen={combatTracker.open}
 onCombatBegin={combatTracker.begin} onCombatAdd={combatTracker.add}
 onCombatCommand={combatTracker.command} onCombatRoll={combatTracker.roll}
 onCombatRollNpcs={combatTracker.rollNpc}
 onOpenCombat={()=>combatTracker.setOpen(true)}
 onCloseCombat={()=>combatTracker.setOpen(false)}
 onPopOutMapSetting={()=>setMapSettingPopped(true)}
 onDockMapSetting={()=>{setMapSettingPopped(false);setRightTab('dm')}}
 onMapEnvironmentChange={saveMapEnvironment}
 publishedMapId={camp?.active_map_id||null} onPublishMap={publishMap}
  onMoveEntireParty={moveEntireParty}
  mapAssignments={mapAssignments} onAssignPlayerMap={assignPlayerMap}
 onOpenMapLibrary={()=>setTab('maps')}
 newToken={newToken} onChangeTokenName={setNewToken}
 tokenOwner={tokenOwner} onChangeTokenOwner={setTokenOwner} onAddToken={addToken}
 mapZoom={mapZoom} onChangeZoom={setMapZoom}
 onMapCalibrationPreview={setMapCalibrationPreview} onSaveMapCalibration={saveMapCalibration}
 onSaveTokenDisplay={saveTokenDisplay}
 statusCatalog={camp?.token_status_catalog} onSaveStatusCatalog={saveStatusCatalog}
 template={camp?.sheet_template}
 quickFields={camp?.token_quick_fields||[]} onSaveQuickFields={saveQuickFields}
 bindings={bindings} onSaveBindings={saveMyKeybindings}
 hotbarSlots={hotbarSlots} onSaveHotbar={saveMyHotbar}
 macroCount={macros.length} onOpenMacros={()=>setMacroBuilderOpen(true)}
  activeCharacterId={character?.id||null}
  newCharacterName={newCharacterName} onChangeNewCharacterName={setNewCharacterName}
  onCreateCharacter={createNewCharacter}
  onOpenOwnCharacter={id=>openOwnCharacter(id).catch(fail)}
  onOpenCharacterTab={openSheetBrowserTab}
 hotbarVisible={hotbarVisible} onChangeHotbarVisible={visible=>changeHotbarVisibility(visible).catch(fail)}
 onDistributedItem={async()=>{await fetchCampaign(activeId);await refreshMonitors()}}
 onCopyInvite={async()=>{try{await navigator.clipboard.writeText(location.origin+'/?join='+camp?.invite_code);setSaveState('Invite link copied')}catch(e){fail(e)}}}
 onNavigate={setTab} onCreatePortrait={()=>setArtStudio(true)} onReturnToMenu={()=>setActiveId('')}
 onOpenAccountSettings={()=>setAccountSettingsOpen(true)}
 uiScale={uiScale} onChangeUiScale={changeInterfaceScale}
 onOpenPlayerCharacter={id=>openPlayerCharacter(id,null)} currentPage={tab}
 campaignName={camp?.name||''} campaignTokenDisplay={camp?.token_display_config}
 activeCampaignId={activeId} campaignList={campaigns}
 hasCampaign={!!camp} onSelectCampaign={id=>{setActiveId(id);setTab('tabletop')}}
 createCampaignName={createName} onCreateCampaignNameChange={setCreateName} onCreateCampaign={create}
 inviteCode={joinCode} onInviteCodeChange={setJoinCode} onJoinCampaign={join}
 accountEmail={session.user.email} onSignOut={()=>db.auth.signOut()}
 /></div>
 </main>
 {combatTracker.combat?.active&&combatTracker.open&&
  <CombatTurnOrder combat={combatTracker.combat}
   privateEntries={combatTracker.privateEntries}
   tokens={tokens} user={user} isDM={isDM} busy={combatTracker.busy}
   onClose={()=>combatTracker.setOpen(false)}
   onNext={()=>combatTracker.command('next')}
   onPrevious={()=>combatTracker.command('previous')}
   onSort={()=>combatTracker.command('sort')}
   onOpenSettings={()=>{setRightTab('dm');setTab('tabletop')}}
   onRollEntry={combatTracker.roll} onRollNpc={combatTracker.rollNpc}
   onLocate={tokenId=>{if(tokens.some(t=>t.id===tokenId&&(isDM||t.visible!==false))){
    setTab('tabletop');setSelectedTokenId(tokenId);
   }}}/>}
 {isDM&&mapSettingPopped&&<FloatingWindow kind="mapsetting"
  onClose={()=>{setMapSettingPopped(false);setRightTab('dm')}}>
  <section className="panel floating-map-setting-content" aria-label="Floating DM Map setting">
   <div className="heading">
    <h2>Map setting</h2>
    <button type="button" className="secondary map-setting-dock-button"
     onClick={()=>{setMapSettingPopped(false);setRightTab('dm')}}
     aria-label="Dock Map setting back to DM sidebar"
     title="Return Map setting to the DM sidebar">↙ Dock</button>
   </div>
   <div className="map-setting-pop-body">
    <MapSettingPanel key={activeMap?.id||'no-map'}
     map={activeMap}
     environment={mapEnvironmentMapId===selectedMap?mapEnvironment:null}
     editor={mapSettingEditor} onEditorChange={setMapSettingEditor}
     onEnvironmentChange={saveMapEnvironment}
     onMapCalibrationPreview={setMapCalibrationPreview}
     onSaveMapCalibration={saveMapCalibration}
     template={camp?.sheet_template} saveStatus={mapEnvironmentStatus} tokens={tokens}/>
   </div>
  </section>
 </FloatingWindow>}
 {accountSettingsOpen&&<AccountSettings db={db} user={session.user}
  onClose={()=>setAccountSettingsOpen(false)} onUpdated={accountUpdated}/>}
 {macroBuilderOpen&&<MacroManager macros={macros}
  characters={characters} npcs={npcs} tokens={tokens}
  template={camp?.sheet_template} user={user} isDM={isDM}
  onSave={saveMacro} onDelete={deleteMacro} onRun={runMacro} onAssign={assignMacro}
  onClose={()=>setMacroBuilderOpen(false)}/>}
 {artStudio&&character&&<PersonalTokenLibrary db={db} campaignId={activeId} userId={user}
  mode="players" currentTokenPath={character.token_path} currentPortraitPath={character.portrait_path}
  defaultName={character.name||'New token'} onApply={savePlayerArtwork} onClose={()=>setArtStudio(false)}/>}
 {characterEditor&&isDM&&<CharacterEditor
  db={db} campaignId={activeId} viewerId={user}
  record={characterEditor.data} template={camp?.sheet_template}
  onSaved={afterPlayerSheetSaved} onClose={()=>launchSheet?window.close():setCharacterEditor(null)}
   onOpenBrowserTab={()=>openSheetBrowserTab(characterEditor.data.id)}
  onRoll={(expression,label)=>roll(expression,label,null)}
  onCastSpell={({collectionId,entryId,mode})=>castSpell({
   sourceType:'character',sourceId:characterEditor.data.id,collectionId,entryId,mode
  })}
  onEquipmentAttack={({fieldId,weaponId})=>attackWithWeapon({
   sourceType:'character',sourceId:characterEditor.data.id,fieldId,weaponId
  })}
  onAddSpellToHotbar={assignSpellToHotbar}/>}
 {statusEditToken&&camp&&<QuickEditBoundary key={'status_'+statusEditToken.id}
   onClose={()=>setStatusEditToken(null)}>
    <TokenStatusPicker token={statusEditToken} catalog={camp.token_status_catalog}
     canEdit={isDM||(statusEditToken.owner_id===user&&playerMapId===statusEditToken.map_id)}
     onClose={()=>setStatusEditToken(null)} onApply={applyTokenStatuses}/>
   </QuickEditBoundary>}
 {quickEditToken&&camp&&<QuickEditBoundary key={quickEditToken.id} onClose={()=>setQuickEditToken(null)}>
  <TokenQuickEdit db={db} token={quickEditToken} template={camp.sheet_template}
   allowedFields={camp.token_quick_fields||[]}
   initialValues={getLocalQuickValues(quickEditToken)}
    statusCatalog={camp.token_status_catalog}
    canEditStatuses={isDM||(quickEditToken.owner_id===user&&quickEditToken.map_id===playerMapId)}
    onApplyStatuses={applyTokenStatuses}
   onRemember={values=>quickCache.current.set(quickEditToken.id,values)}
   onClose={()=>setQuickEditToken(null)} onApply={applyQuickTokenChanges}/>
 </QuickEditBoundary>}
 {launchNpc&&!npcEditors.length&&<div className="npc-popout-loading" role="status">
  {error||'Opening NPC sheet…'}
 </div>}
 {isDM&&npcEditors.map(editor=><NpcEditor
  key={editor.kind+':'+editor.data.id} focusSignal={editor.focusSignal}
  onPopOut={launchNpc?undefined:()=>openNpcBrowserWindow(editor)}
  db={db} campaignId={activeId} userId={user}
  record={editor} template={camp?.sheet_template}
  onSave={draft=>saveNpc(editor,draft)} onSaveAsTemplate={async draft=>{
   await read(db.from('npc_templates').insert({
    campaign_id:activeId,name:draft.name.trim(),
    field_values:draft.values,portrait_path:draft.portraitPath,token_path:draft.tokenPath,
    npc_bars_public:draft.barsPublic
   }));
   await refreshNpcs();
  }} onClose={()=>closeNpcEditor(editor)}
  onRoll={(expression,label)=>roll(expression,label,null)}
  onCastSpell={({collectionId,entryId,mode})=>castSpell({
   sourceType:editor.kind==='token'?'npc_token':'npc_template',
   sourceId:editor.data.id,collectionId,entryId,mode
  })}
  onEquipmentAttack={({fieldId,weaponId})=>attackWithWeapon({
   sourceType:editor.kind==='token'?'npc_token':'npc_template',
   sourceId:editor.data.id,fieldId,weaponId
  })}
  onAddSpellToHotbar={assignSpellToHotbar}/>)}
 </div>;
}
function configured(){return !!db}

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
  if(type==='collection'){
   changeTemplate(x=>x.tabs.find(y=>y.id===t.id).fields.push(makeBlankCollection()));
   return;
  }
  if(['magic_dashboard','equipment','progression','proficiencies'].includes(type)){
   changeTemplate(x=>x.tabs.find(y=>y.id===t.id).fields.push(
    type==='equipment'?makeEquipmentField():
    type==='magic_dashboard'?makeMagicDashboardField():
    type==='progression'?makeProgressionField():makeProficienciesField()));
   return;
  }
  changeTemplate(x=>x.tabs.find(y=>y.id===t.id).fields.push({
   id:'field_'+uid().slice(0,8),
   label:type==='resource'?'Hit Points':'New '+type,type,span:type==='resource'?2:1,
   ...(type==='attribute'?{proficiencyField:''}:type==='list'?{listId:''}:{}),
   ...(type==='inventory'?{columns:['Item','Qty','Weight','Notes'],inventoryPreset:'list',gridColumns:8,gridRows:5}:type==='roll'?{formula:'1d20'}:{})
  }));
 }
 return <>
  <div className="modifier-rule-settings">
   <strong>Ability modifier formula</strong>
   <span className="muted tiny">DM-only formula: floor((score − base) / points per +1). D&D uses base 10 and step 2.</span>
   <label>Base score<input type="number" min="0" max="100" step="1"
    value={template.modifierRules?.base??10}
    onChange={e=>changeTemplate(x=>x.modifierRules={...x.modifierRules,base:Number(e.target.value)})}/></label>
   <label>Points per +1<input type="number" min="1" max="20" step="1"
    value={template.modifierRules?.step??2}
    onChange={e=>changeTemplate(x=>x.modifierRules={...x.modifierRules,step:Number(e.target.value)})}/></label>
  </div>
  <TemplateListsDesigner template={template} changeTemplate={changeTemplate}/>
  <InventoryRulesDesigner template={template} changeTemplate={changeTemplate}/>
  <div className="tools">
   <input aria-label="Tab name" value={t.name}
    onChange={e=>changeTemplate(x=>x.tabs.find(y=>y.id===t.id).name=e.target.value)}/>
   <button className="secondary" onClick={()=>{
    if(template.tabs.length<2)return alert('Keep at least one tab');
    if(confirm('Delete tab and its fields?'))changeTemplate(x=>x.tabs=x.tabs.filter(y=>y.id!==t.id));
   }}>Delete tab</button>
   <select aria-label="New field type" value={fieldType} onChange={e=>setFieldType(e.target.value)}>
    <option value="text">Text</option><option value="number">Number</option>
    <option value="attribute">Attribute (score + saving throw)</option>
    <option value="list">List (DM-defined dropdown)</option>
    <option value="resource">Resource (Current / Maximum)</option>
    <option value="collection">Repeating Collection (spellbooks, abilities…)</option>
    <option value="magic_dashboard">Magic resources dashboard</option>
    <option value="equipment">Equipment and armour rules</option>
    <option value="progression">Class levels & automatic progression</option>
    <option value="proficiencies">Skills & proficiencies</option>
    <option value="textarea">Notes</option><option value="checkbox">Checkbox</option>
    <option value="roll">Dice button</option><option value="inventory">Inventory</option>
   </select>
   <button type="button" onClick={createField}>+ Add field</button>
   <button type="button" className="secondary" onClick={()=>changeTemplate(x=>
    x.tabs.find(y=>y.id===t.id).fields.push(makeSpellbookField()))}>+ Spellbook preset</button>
   <button type="button" className="secondary" onClick={()=>changeTemplate(x=>
    x.tabs.find(y=>y.id===t.id).fields.push(makeMagicDashboardField()))}>+ Magic dashboard</button>
   <button type="button" className="secondary" onClick={()=>changeTemplate(x=>
    x.tabs.find(y=>y.id===t.id).fields.push(makeProgressionField()))}>+ Class levels</button>
  </div>
  <p className="muted small">Create ordinary fields, Current/Maximum resources, or repeating collections with nested controls. Choose the Spellbook preset for level tabs, spell entries, detail panels, and roll buttons.</p>
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
    <label className="sheet-quickcode-field">Quickcode (optional)
     <input value={f.quickcode||''} maxLength={34}
      aria-label={'Quickcode for '+f.label} placeholder="=@AC"
      onChange={e=>update(f.id,'quickcode',e.target.value.trim().toUpperCase())}/>
     <small className="muted tiny">Use in chat or token field IDs. Resources resolve Current;
      equipment resolves calculated armour class.</small>
    </label>
    <div className="tools">
     <label>Width<select value={f.span||1} onChange={e=>update(f.id,'span',Number(e.target.value))}>
      <option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option>
     </select></label>
     <label>Field type<select value={f.type} onChange={e=>{
      const next=e.target.value;
      changeTemplate(tpl=>{
       const field=tpl.tabs.find(tab=>tab.id===t.id).fields.find(item=>item.id===f.id);
       if(!field)return;
       if(['magic_dashboard','equipment','progression','proficiencies'].includes(next)){
        const replacement=next==='magic_dashboard'?makeMagicDashboardField():
          next==='equipment'?makeEquipmentField():
          next==='progression'?makeProgressionField():makeProficienciesField();
        Object.assign(field,replacement,{id:field.id,label:field.label});
       }else field.type=next;
      });
     }}>
      <option value="text">Text</option><option value="number">Number</option>
      <option value="attribute">Attribute (score + saving throw)</option>
      <option value="list">List (DM-defined dropdown)</option>
      <option value="resource">Resource (Current / Maximum)</option>
      <option value="collection">Repeating Collection</option>
      <option value="magic_dashboard">Magic dashboard</option>
      <option value="equipment">Equipment & armour</option>
      <option value="progression">Class levels & progression</option>
      <option value="proficiencies">Skills & proficiencies</option>
      <option value="textarea">Notes</option><option value="checkbox">Checkbox</option>
      <option value="roll">Dice button</option><option value="inventory">Inventory</option>
     </select></label>
     <button className="secondary" onClick={()=>changeTemplate(x=>{
      const tab=x.tabs.find(y=>y.id===t.id);tab.fields=tab.fields.filter(y=>y.id!==f.id);
     })}>Delete</button>
    </div>
    {f.type==='progression'&&<ProgressionDesigner field={f} template={template}
      onChange={next=>changeTemplate(x=>{
       const target=x.tabs.find(tab=>tab.id===t.id)?.fields.find(v=>v.id===f.id);
       if(target)Object.assign(target,next);
      })}/>}
    {f.type==='proficiencies'&&<ProficienciesDesigner field={f} template={template}
      onChange={next=>changeTemplate(x=>{
       const target=x.tabs.find(tab=>tab.id===t.id)?.fields.find(v=>v.id===f.id);
       if(target)Object.assign(target,next);
      })}/>}
    {f.type==='magic_dashboard'&&<MagicDashboardDesigner field={f} onChange={next=>
      changeTemplate(x=>{const target=x.tabs.find(tab=>tab.id===t.id)?.fields.find(v=>v.id===f.id);
       if(target)Object.assign(target,next);})}/>}
    {f.type==='equipment'&&<EquipmentDesigner field={f} template={template}
      onChange={next=>changeTemplate(x=>{
       const target=x.tabs.find(tab=>tab.id===t.id)?.fields.find(v=>v.id===f.id);
       if(target)Object.assign(target,next);
      })}/>}
    {f.type==='collection'&&<CollectionDesigner field={f}
      onChange={next=>changeTemplate(x=>{
       const child=x.tabs.find(y=>y.id===t.id).fields.find(y=>y.id===f.id);
       if(child)Object.assign(child,next);
      })}/>}
    {f.type==='resource'&&<>
     <div className="resource-designer-explainer">Two values in one field: <strong>Current / Maximum</strong>.
      <span>Example: {f.label||'Hit Points'} 15 / 22</span></div>
     <button className="resource-link-button" disabled={linking===f.id} onClick={()=>link(f)}>
      {linking===f.id?'Linking…':'↗ Add / link token resource bar'}
     </button>
    </>}
    {f.type==='attribute'&&<div className="ability-modifier-designer">
     <p className="muted tiny">A numeric ability score with its calculated modifier,
      a saving-throw proficiency checkbox, and a one-click d20 saving throw.
      Proficiency is taken from class progression unless you choose a field below.</p>
     <label>Saving throw proficiency bonus source
      <select value={f.proficiencyField||''}
       onChange={e=>update(f.id,'proficiencyField',e.target.value)}>
       <option value="">Campaign progression / proficiency_bonus</option>
       {numericFieldsWithDerived(template).filter(item=>item.id!==f.id).map(item=>
        <option value={item.id} key={item.id}>{item.label} ({item.id})</option>)}
      </select>
     </label>
     <p className="muted tiny">Calculated references: <code>{f.id+'_mod'}</code> and
      <code>{f.id+'_save_bonus'}</code>.</p>
    </div>}
    {f.type==='list'&&<div className="ability-modifier-designer">
     <label>Predefined list
      <select value={f.listId||''} onChange={e=>update(f.id,'listId',e.target.value)}>
       <option value="">Choose a reusable list</option>
       {optionLists(template).map(list=><option key={list.id} value={list.id}>{list.name}</option>)}
      </select>
     </label>
     <p className="muted tiny">Edit options in Reusable lists above; players only see this
      dropdown on their sheet.</p>
    </div>}
    {f.type==='number'&&<div className="ability-modifier-designer">
      <label className="ability-modifier-enable"><input type="checkbox"
       checked={f.modifierEnabled===true} onChange={e=>update(f.id,'modifierEnabled',e.target.checked)}/>
       Calculate a hidden modifier from this score</label>
      {f.modifierEnabled===true&&<>
       <label>Modifier reference ID
        <input value={f.modifierCode??modifierReferenceId(f)??''}
         maxLength={76} onChange={e=>update(f.id,'modifierCode',e.target.value)}
         placeholder="dexterity"/></label>
       <p className="muted tiny">Use <code>@{'{'+(modifierReferenceId(f)||'dexterity')+'_mod}'}</code> in macros. No extra player field.</p>
      </>}
     </div>}
     {f.type==='roll'&&<label>Dice formula<input value={f.formula||''}
      onChange={e=>update(f.id,'formula',e.target.value)} placeholder="1d20+@{strength}"/></label>}
    {f.type==='inventory'&&<div className="inventory-designer-options">
     <label>Inventory preset<select value={f.inventoryPreset||'list'}
      onChange={e=>update(f.id,'inventoryPreset',e.target.value)}>
      <option value="list">Classic list (Roll20 style)</option>
      <option value="grid">Slot grid (drag items)</option>
     </select></label>
     {f.inventoryPreset==='grid'&&<>
      <label>Grid columns<input type="number" min="2" max="20"
       value={f.gridColumns||8} onChange={e=>update(f.id,'gridColumns',Number(e.target.value))}/></label>
      <label>Grid rows<input type="number" min="2" max="20"
       value={f.gridRows||5} onChange={e=>update(f.id,'gridRows',Number(e.target.value))}/></label>
     </>}
     <label>List columns (comma separated)<input
      value={(f.columns||[]).join(', ')}
      onChange={e=>update(f.id,'columns',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))}/></label>
     <p className="muted tiny">Use Item, Qty, Weight, Notes for carry weight and DM item distribution.
      Switching layouts keeps the same saved items.</p>
    </div>}
   </div>)}
  </div>
 </>;
}

function Board({db,map,url,tokens,user,isDM,move,remove,resize,onNpcDrop,onCharacterDrop,onUnitDrop,onTokenEdit,onTokenQuick,onTokenStatus,statusCatalog,scale,setScale,selectedId,setSelectedId,displayConfig,monitorValues,encumbranceBadges={},onMovementPreview,remotePositions={},
 onMeasurementPreview,remoteMeasurements={},hotbarInset=false,
 environment,environmentEditor,onAddEnvironmentObject,onSelectEnvironmentObject,
 onPatchEnvironmentObject,characters=[],template,active=true,combatActiveTokenId=null}){
 const[preview,setPreview]=useState({});
 const[selectedIds,setSelectedIds]=useState([]);
 const[marquee,setMarquee]=useState(null);
 const[activeMeasureTool,setActiveMeasureTool]=useState(null),
  [localMeasurements,setLocalMeasurements]=useState([]);
 const measureDrag=useRef(null),toolDrag=useRef(null);
 const lastCenteredMap=useRef(null);
 const boardRef=useRef(null),viewportRef=useRef(null),
  drag=useRef(null),resizeDrag=useRef(null),pan=useRef(null),
  selection=useRef(null),primaryRef=useRef(null),zoomRef=useRef(scale);
 const [panning,setPanning]=useState(false);
 // Reuse derived rendering data during drag, measurement and marquee updates.
 const previewToken=isDM&&environmentEditor?.previewing?
  tokens.find(t=>t.id===(environmentEditor.previewTokenId||tokens.find(x=>x.visible!==false)?.id)):null;
 const viewer=useMemo(()=>previewViewer(previewToken,characters),[previewToken,characters]);
 const previewActive=!!(isDM&&environmentEditor?.previewing&&viewer&&environment);
 const previewPolygon=useMemo(()=>previewActive?
  previewVisionPolygon({map,environment,viewer,maxFeet:60}):[],
  [previewActive,map,environment,viewer]);
 const visibleTokens=useMemo(()=>{
  const allowed=isDM?tokens:tokens.filter(t=>t.visible);
  if(!previewActive)return allowed;
  return allowed.filter(t=>t.visible!==false&&
   (t.id===previewToken?.id||pointInPolygon({
    x:Number(t.x)+Number(t.span_x??1)/2,
    y:Number(t.y)+Number(t.span_y??1)/2},previewPolygon)));
 },[tokens,isDM,previewActive,previewToken?.id,previewPolygon]);
 const displaySettings=useMemo(()=>normalizeConfig(displayConfig),[displayConfig]);
 const statusPosition=displaySettings.statusPosition;
 const measures=useMemo(()=>[...Object.values(remoteMeasurements),...localMeasurements],[remoteMeasurements,localMeasurements]);
 const environmentHandlers=useRef({onAddEnvironmentObject,onSelectEnvironmentObject,onPatchEnvironmentObject});
 environmentHandlers.current={onAddEnvironmentObject,onSelectEnvironmentObject,onPatchEnvironmentObject};
 const handleEnvironmentAdd=useCallback(object=>environmentHandlers.current.onAddEnvironmentObject?.(object),[]);
 const handleEnvironmentSelect=useCallback(id=>environmentHandlers.current.onSelectEnvironmentObject?.(id),[]);
 const handleEnvironmentPatch=useCallback((id,change,opts)=>
  environmentHandlers.current.onPatchEnvironmentObject?.(id,change,opts),[]);
 function selectTokens(ids){
  const unique=[...new Set(ids)];
  setSelectedIds(unique);
  primaryRef.current=unique[0]||null;
  setSelectedId(primaryRef.current);
 }
 // Keep selections made elsewhere (new tokens, keyboard actions) in sync.
 useEffect(()=>{
  if(selectedId!==primaryRef.current){
   primaryRef.current=selectedId;
   setSelectedIds(selectedId?[selectedId]:[]);
  }
 },[selectedId]);
 // Pinned measurements remain until the creator clears them.
 useEffect(()=>{
  setActiveMeasureTool(null);setLocalMeasurements([]);
  measureDrag.current=null;toolDrag.current=null;
 },[map.id]);
 useEffect(()=>{
  function onEscape(event){
   if(!active||event.key!=='Escape'||!activeMeasureTool)return;
   event.preventDefault();
   const current=measureDrag.current;
   if(current){
    setLocalMeasurements(existing=>existing.filter(m=>m.id!==current.measure.id));
    onMeasurementPreview?.(current.measure,'remove');
   }
   setActiveMeasureTool(null);
   measureDrag.current=null;toolDrag.current=null;
  }
  window.addEventListener('keydown',onEscape);
  return()=>window.removeEventListener('keydown',onEscape);
 },[active,activeMeasureTool,onMeasurementPreview]);
 // Recenter only when opening a different map, not during zoom/pan.
 useLayoutEffect(()=>{
  if(!active||lastCenteredMap.current===map.id)return;
  const vp=viewportRef.current;
  if(!vp||!vp.clientWidth||!vp.clientHeight)return;
  vp.scrollLeft=Math.max(0,(vp.scrollWidth-vp.clientWidth)/2);
  vp.scrollTop=Math.max(0,(vp.scrollHeight-vp.clientHeight)/2);
  lastCenteredMap.current=map.id;
 },[map.id,active]);
 useEffect(()=>{zoomRef.current=scale},[scale]);
 useEffect(()=>{setPreview({})},[tokens]);
 useEffect(()=>{
  primaryRef.current=null;setSelectedId(null);setSelectedIds([]);
  setMarquee(null);selection.current=null;drag.current=null;
 },[map.id]);
 useEffect(()=>{
  setSelectedIds(old=>old.filter(id=>tokens.some(t=>
   t.id===id&&canControlMapToken(t,user,isDM,map.id))));
  if(selectedId&&!tokens.some(t=>t.id===selectedId))selectTokens([]);
 },[selectedId,tokens,user,isDM,map.id]);
 useEffect(()=>{
  if(!selectedId||!viewportRef.current)return;
  const token=tokens.find(t=>t.id===selectedId);
  if(!token)return;
  const node=viewportRef.current,cell=map.grid_size*scale;
  const x=(Number(token.x)+Number(token.span_x??1)/2)*cell;
  const y=(Number(token.y)+Number(token.span_y??1)/2)*cell;
  const visibleLeft=node.scrollLeft,visibleRight=visibleLeft+node.clientWidth;
  const visibleTop=node.scrollTop;
  const clearance=hotbarInset?78:0;
  const visibleBottom=visibleTop+Math.max(35,node.clientHeight-clearance);
  if(x<visibleLeft+32||x>visibleRight-32)node.scrollLeft=Math.max(0,x-node.clientWidth/2);
  if(y<visibleTop+32||y>visibleBottom-32)
   node.scrollTop=Math.max(0,y-(node.clientHeight-clearance)/2);
  node.focus({preventScroll:true});
 },[selectedId,map.id,hotbarInset]);
 useEffect(()=>{
  function handleDelete(e){
   if(!active||!isDM||!selectedId||e.key!=='Delete'||e.defaultPrevented||e.repeat)return;
   const el=e.target;
   if(el instanceof Element && el.closest('input,textarea,select,button,[contenteditable="true"],[role="textbox"]'))return;
   if(document.querySelector('.modal-backdrop'))return;
   const t=tokens.find(x=>x.id===selectedId);
   if(!t)return;
   e.preventDefault();e.stopPropagation();setSelectedId(null);remove(t);
  }
  document.addEventListener('keydown',handleDelete);
  return()=>document.removeEventListener('keydown',handleDelete);
 },[active,selectedId,isDM,tokens,remove]);
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
 const boardPoint=e=>{
  const rect=boardRef.current?.getBoundingClientRect();
  return rect?{
   x:Math.max(0,Math.min(map.width*zoomRef.current,e.clientX-rect.left)),
   y:Math.max(0,Math.min(map.height*zoomRef.current,e.clientY-rect.top))
  }:{x:0,y:0};
 };
 const mapPointInCells=e=>pointOnBattlemap(e.clientX,e.clientY,
  boardRef.current?.getBoundingClientRect(),map.width,map.height,
  map.grid_size,zoomRef.current);
 function beginMeasurement(pointerId,tool,point,pinned=false,sourceButton=0){
  if(!point||measureDrag.current)return;
  const measure={id:crypto.randomUUID(),tool,start:point,end:point};
  measureDrag.current={pointerId,measure,pinned,sourceButton};
  setLocalMeasurements(existing=>[...existing,{...measure,isLocal:true}]);
  onMeasurementPreview?.(measure,'preview');
 }
 function updateMeasurement(e){
  const current=measureDrag.current;
  if(!current||current.pointerId!==e.pointerId)return;
  const point=mapPointInCells(e);
  if(!point)return;
  if(current.measure.end.x===point.x&&current.measure.end.y===point.y)return;
  const next={...current.measure,end:point};
  current.measure=next;
  setLocalMeasurements(existing=>existing.map(m=>m.id===next.id?
   {...next,isLocal:true}:m));
  onMeasurementPreview?.(next,'preview');
 }
 function finishMeasurement(e,cancel=false){
  const current=measureDrag.current;
  if(!current||current.pointerId!==e.pointerId)return;
  // Releasing the secondary button while primary remains down must NOT
  // finish a multi-leg movement measurement.
  if(!cancel&&e.button===2&&current.sourceButton===0)return;
  measureDrag.current=null;
  const point=cancel?current.measure.end:
   mapPointInCells(e)||current.measure.end;
  const done={...current.measure,end:point};
  const meaningful=done.tool==='line'?
   (measurementGeometry(done)?.feet||0)>0:
   Math.hypot(done.end.x-done.start.x,done.end.y-done.start.y)>=.5;
  if(!cancel&&meaningful&&current.pinned){
   setLocalMeasurements(existing=>existing.map(m=>m.id===done.id?
    {...done,isLocal:true,pinned:true}:m));
   onMeasurementPreview?.(done,'pin');
  }else{
   // Remove is broadcast without throttling; local removal is immediate.
   setLocalMeasurements(existing=>existing.filter(m=>m.id!==done.id));
   onMeasurementPreview?.(done,'remove');
  }
 }
 function clearMyPinnedMeasurements(){
  setLocalMeasurements(existing=>existing.filter(m=>!m.pinned));
  onMeasurementPreview?.(null,'clear');
 }
 function onToolPointerDown(e,tool){
  if(e.button!==0&&e.button!==2)return;
  setActiveMeasureTool(tool);
  e.preventDefault();e.stopPropagation();
  toolDrag.current={pointerId:e.pointerId,tool,pinned:e.button===2,sourceButton:e.button};
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
 }
 function onToolPointerMove(e){
  const current=toolDrag.current;
  if(!current||current.pointerId!==e.pointerId)return;
  const rect=boardRef.current?.getBoundingClientRect();
  if(!rect)return;
  if(!measureDrag.current){
   if(e.clientX<rect.left||e.clientX>rect.right||
      e.clientY<rect.top||e.clientY>rect.bottom)return;
   beginMeasurement(e.pointerId,current.tool,mapPointInCells(e),current.pinned,current.sourceButton);
  }else updateMeasurement(e);
 }
 function onToolPointerUp(e,cancel=false){
  if(toolDrag.current?.pointerId!==e.pointerId)return;
  if(!cancel&&e.button===2&&measureDrag.current?.sourceButton===0)return;
  finishMeasurement(e,cancel);
  toolDrag.current=null;
  try{if(e.currentTarget.hasPointerCapture(e.pointerId))
   e.currentTarget.releasePointerCapture(e.pointerId)}catch{}
 }
 function startMeasurementCapture(e){
  if(!activeMeasureTool||(e.button!==0&&e.button!==2)||
   pan.current||measureDrag.current)return;
  e.preventDefault();e.stopPropagation();
  beginMeasurement(e.pointerId,activeMeasureTool,mapPointInCells(e),
   e.button===2,e.button);
  try{viewportRef.current?.setPointerCapture(e.pointerId)}catch{}
 }
 function pinCurrentMeasurementOnRightClick(e){
  // A secondary click during a held primary-button line measurement
  // creates a snapped bend rather than pinning the line. A right-button
  // measurement started on its own still pins as before.
  if(!activeMeasureTool||e.button!==2||!measureDrag.current)return;
  e.preventDefault();e.stopPropagation();
  const current=measureDrag.current;
  if(shouldBendLineOnRightPress(current,e.button)){
   const next=addLineTurn(current.measure,mapPointInCells(e)||current.measure.end);
   if(next!==current.measure){
    current.measure=next;
    setLocalMeasurements(existing=>existing.map(m=>m.id===next.id?
     {...next,isLocal:true}:m));
    onMeasurementPreview?.(next,'preview',true);
   }
   return;
  }
  measureDrag.current.pinned=true;
 }
 // When a measurement begins on the floating toolbar, the button captures
 // its pointer while the user drags onto the map. A second mouse button can
 // therefore be retargeted to the toolbar rather than the map viewport.
 // Catch chorded right-clicks globally during a measurement, without affecting
 // standalone right-drag pinning or interactions outside the battlemap.
 useEffect(()=>{
  if(!active||!activeMeasureTool)return;
  function onMouseDown(e){
   if(e.button!==2||!measureDrag.current)return;
   const rect=boardRef.current?.getBoundingClientRect();
   if(!rect||e.clientX<rect.left||e.clientX>rect.right||
    e.clientY<rect.top||e.clientY>rect.bottom)return;
   pinCurrentMeasurementOnRightClick(e);
  }
  // Some browsers delay pointerup until both mouse buttons are released.
  // Native left mouseup always terminates a left-drag measurement promptly.
  function onMouseUp(e){
   const current=measureDrag.current;
   if(e.button!==0||current?.sourceButton!==0)return;
   finishMeasurement({pointerId:current.pointerId,button:0,
    clientX:e.clientX,clientY:e.clientY});
   if(toolDrag.current?.pointerId===current.pointerId)toolDrag.current=null;
  }
  // Continue tracking even when a second mouse button drops pointer capture.
  function onMouseMove(e){
   const current=measureDrag.current;
   if(current?.sourceButton!==0)return;
   updateMeasurement({pointerId:current.pointerId,clientX:e.clientX,clientY:e.clientY});
  }
  window.addEventListener('mousedown',onMouseDown,true);
  window.addEventListener('mousemove',onMouseMove,true);
  window.addEventListener('mouseup',onMouseUp,true);
  return()=>{
   window.removeEventListener('mousedown',onMouseDown,true);
   window.removeEventListener('mousemove',onMouseMove,true);
   window.removeEventListener('mouseup',onMouseUp,true);
  };
 },[active,activeMeasureTool]);
 function startPan(e){
  // Middle mouse pans even if it starts over a token. Touch keeps one-finger
  // panning because touchscreens do not have a middle mouse button.
  if(e.button!==1&&!(e.pointerType==='touch'&&e.button===0))return;
  const viewport=viewportRef.current;if(!viewport)return;
  e.preventDefault();e.stopPropagation();
  pan.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,
   left:viewport.scrollLeft,top:viewport.scrollTop};
  viewport.setPointerCapture(e.pointerId);
  setPanning(true);
 }
 function startMarquee(e){
  if(environmentEditor?.enabled||previewActive)return;
  if(activeMeasureTool||e.button!==0||e.pointerType==='touch'||pan.current||drag.current||
     e.altKey||e.ctrlKey||e.metaKey||e.target.closest('.token'))return;
  const viewport=viewportRef.current;
  if(!viewport||!boardRef.current)return;
  const start=boardPoint(e);
  e.preventDefault();
  selection.current={id:e.pointerId,start,originX:e.clientX,
   originY:e.clientY,additive:e.shiftKey,originalIds:selectedIds};
  setMarquee({start,end:start});
  viewport.setPointerCapture(e.pointerId);
 }
 function moveViewportPointer(e){
  const info=pan.current;
  if(info&&info.id===e.pointerId){
   const viewport=viewportRef.current;
   viewport.scrollLeft=info.left-(e.clientX-info.startX);
   viewport.scrollTop=info.top-(e.clientY-info.startY);
   return;
  }
  const select=selection.current;
  if(select?.id===e.pointerId)
   setMarquee({start:select.start,end:boardPoint(e)});
 }
 function endViewportPointer(e,cancel=false){
  if(pan.current?.id===e.pointerId){
   pan.current=null;setPanning(false);
  }
  const info=selection.current;
  if(info?.id===e.pointerId){
   selection.current=null;setMarquee(null);
   if(!cancel){
    const dragged=Math.hypot(e.clientX-info.originX,e.clientY-info.originY)>=4;
    if(dragged){
     const rect=selectionRectangle(info.start,boardPoint(e));
     const found=selectableTokenIds(tokens,rect,map.grid_size*zoomRef.current,
      user,isDM,map.id);
     selectTokens(info.additive?[...info.originalIds,...found]:found);
    }else if(!info.additive)selectTokens([]);
   }
  }
  const viewport=viewportRef.current;
  if(viewport?.hasPointerCapture(e.pointerId))
   viewport.releasePointerCapture(e.pointerId);
 }
 function startTokenDrag(e,t,canMove){
  e.stopPropagation();
  if(previewActive)return;
  if(e.button!==0)return;
  const group=canMove&&selectedIds.includes(t.id)&&selectedIds.length>1?
   selectedIds.filter(id=>tokens.some(other=>other.id===id&&
    canControlMapToken(other,user,isDM,map.id))):[t.id];
  if(!canMove)primaryRef.current=t.id;
  if(canMove)selectTokens(group);
  else{setSelectedIds([]);setSelectedId(t.id)}
  viewportRef.current?.focus({preventScroll:true});
  if(!canMove||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  const members=tokens.filter(token=>group.includes(token.id));
  e.currentTarget.setPointerCapture(e.pointerId);
  drag.current={id:t.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,
   members,dx:0,dy:0};
 }
 function moveTokenDrag(e,t){
  const info=drag.current;
  if(!info||info.id!==t.id||info.pointerId!==e.pointerId)return;
  const cell=map.grid_size*zoomRef.current;
  const delta=boundedGroupOffset(info.members,
   (e.clientX-info.startX)/cell,(e.clientY-info.startY)/cell,
   map.width,map.height,map.grid_size);
  if(info.dx===delta.dx&&info.dy===delta.dy)return;
  info.dx=delta.dx;info.dy=delta.dy;
  setPreview(old=>{
   const next={...old};
   for(const token of info.members)
    next[token.id]={...old[token.id],
     x:Number(token.x)+delta.dx,y:Number(token.y)+delta.dy};
   return next;
  });
  for(const t of info.members){
   const next={x:Number(t.x)+delta.dx,y:Number(t.y)+delta.dy};
   onMovementPreview?.(t,next.x,next.y,false);
  }
 }
 function finishTokenDrag(e,t,cancel=false){
  const info=drag.current;
  if(!info||info.id!==t.id||info.pointerId!==e.pointerId)return;
  drag.current=null;
  if(e.currentTarget.hasPointerCapture(e.pointerId))
   e.currentTarget.releasePointerCapture(e.pointerId);
  if(cancel){
   setPreview(old=>{
    const next={...old};
    for(const member of info.members)delete next[member.id];
    return next;
   });
  }
  if(info.dx===0&&info.dy===0&&!cancel)return;
  for(const t of info.members){
   const next=cancel?{x:Number(t.x),y:Number(t.y)}:
    {x:Number(t.x)+info.dx,y:Number(t.y)+info.dy};
   onMovementPreview?.(t,next.x,next.y,true);
   if(!cancel)move(t,next.x,next.y);
  }
 }
 return <>
  <MeasurementToolBar tool={activeMeasureTool}
   onPointerDown={onToolPointerDown} onPointerMove={onToolPointerMove}
   onPointerUp={e=>onToolPointerUp(e)}
   onPointerCancel={e=>{
    if(measureDrag.current?.sourceButton===0)return;
    onToolPointerUp(e,true);
   }}
   onKeySelect={setActiveMeasureTool} onClearPins={clearMyPinnedMeasurements}/>
  <div className={'mapscroll map-pan-region'+(panning?' is-panning':'')+
    (marquee?' is-selecting':'')} ref={viewportRef}
    aria-label="Battlemap viewport — middle mouse drag to pan, left drag to select tokens" tabIndex={0}
    onMouseDownCapture={pinCurrentMeasurementOnRightClick}
    onMouseDown={e=>{if(e.button===1)e.preventDefault()}}
    onContextMenu={e=>{if(activeMeasureTool)e.preventDefault()}}
    onAuxClick={e=>{if(e.button===1)e.preventDefault()}}
    onPointerDownCapture={e=>{
     if(e.button===1||e.pointerType==='touch'&&!activeMeasureTool)startPan(e);
     else if(!environmentEditor?.enabled&&!previewActive)startMeasurementCapture(e);
    }} onPointerDown={startMarquee}
    onPointerMove={e=>{moveViewportPointer(e);updateMeasurement(e)}}
    onPointerUp={e=>{finishMeasurement(e);endViewportPointer(e)}}
    onPointerCancel={e=>{finishMeasurement(e,true);endViewportPointer(e,true)}}
    onLostPointerCapture={e=>{
     // Native mouseup, not lost capture, completes a held-left route.
     if(measureDrag.current?.sourceButton===0)return;
     finishMeasurement(e,true);endViewportPointer(e,true);
    }}>
   <div className="board-scroll-content" style={{
    width:map.width*scale,height:map.height*scale+(hotbarInset?78:0)
   }}>
   <div ref={boardRef} className="board"
    onDragOver={allowMapDrop}
    onDrop={dropOnMap}
    style={{width:map.width*scale,height:map.height*scale,backgroundImage:(isDM&&environmentEditor?.enabled&&environmentEditor.showBackground===false)?undefined:(url?'url('+JSON.stringify(url)+')':undefined),backgroundSize:'100% 100%'}}>
    <div className="gridlines" style={{backgroundSize:(map.grid_size*scale)+'px '+(map.grid_size*scale)+'px'}}/>
    {isDM&&environment&&<MapEnvironmentOverlay map={map} scale={scale}
     objects={environment.objects} editor={environmentEditor}
     onAdd={handleEnvironmentAdd} onSelect={handleEnvironmentSelect}
     onPatch={handleEnvironmentPatch}/>}
    {isDM&&!previewActive&&environment&&environmentEditor?.selectedId&&
     <MapObjectQuickAdjust key={environmentEditor.selectedId}
      map={map} scale={scale}
      object={environment.objects.find(o=>o.id===environmentEditor.selectedId)}
      template={template} onPatch={handleEnvironmentPatch}
      onClose={()=>handleEnvironmentSelect(null)}/>}
    {visibleTokens.map(t=>{
     const p={...t,...remotePositions[t.id],...preview[t.id]},
      canMove=!previewActive&&canControlMapToken(t,user,isDM,map.id);
     const effectTitles=normalizedEffects(t.status_effects).map(x=>statusTitle(x,statusCatalog));
     const cell=map.grid_size*scale,spanX=Number(p.span_x??1),spanY=Number(p.span_y??1);
     return <div key={t.id} className={'token '+(t.image_path?'token-image':'')+
      (!previewActive&&selectedIds.includes(t.id)?' token-selected':'')+
      (combatActiveTokenId===t.id?' token-current-turn':'')+
      (normalizedEffects(t.status_effects).some(effect=>effect.id==='dead')?' token-dead':'')}
      style={{
       left:Number(p.x)*cell,top:Number(p.y)*cell,width:cell*spanX,height:cell*spanY,
       opacity:t.visible?1:.55,cursor:canMove?'grab':'default'
      }}
      title={t.name+(effectTitles.length?' · '+effectTitles.join(', '):'')+
       (isDM?' · Alt + double-click to edit sheet':'')}
      onDoubleClick={e=>{if(e.altKey&&isDM){e.preventDefault();e.stopPropagation();onTokenEdit(t)}}}
      onClick={e=>{
       if(previewActive)return;
       if(e.shiftKey&&!e.ctrlKey&&!e.altKey){
        e.preventDefault();e.stopPropagation();onTokenStatus(t);return;
       }
       if(e.ctrlKey&&!e.altKey&&canMove){
        e.preventDefault();e.stopPropagation();
        onTokenQuick(t);
       }
      }}
      onPointerDown={e=>startTokenDrag(e,t,canMove)}
      onPointerMove={e=>moveTokenDrag(e,t)}
      onPointerUp={e=>finishTokenDrag(e,t)}
      onPointerCancel={e=>finishTokenDrag(e,t,true)}>
      {t.image_path?<Artwork db={db} path={t.image_path} alt={t.name} className="token-art"/>:
       <span className="token-placeholder">{t.name.slice(0,2).toUpperCase()}</span>}
      {normalizedEffects(t.status_effects).some(effect=>effect.id==='dead')&&
       <span className="token-dead-overlay" aria-hidden="true"/>}
      <TokenStatusBadges effects={t.status_effects} catalog={statusCatalog}
       position={statusPosition}
       canEdit={isDM||t.owner_id===user} onOpen={()=>onTokenStatus(t)}/>
      {isDM&&!previewActive&&selectedId===t.id&&selectedIds.length===1&&<div className="token-resize-handle" role="button"
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
    {marquee&&Math.hypot(marquee.end.x-marquee.start.x,
     marquee.end.y-marquee.start.y)>3&&<div
      className="map-selection-marquee" aria-hidden="true"
      style={(()=>{
       const r=selectionRectangle(marquee.start,marquee.end);
       return {left:r.x,top:r.y,width:r.width,height:r.height};
      })()}/>}
    <MapMeasurementOverlay map={map} scale={scale} measures={measures}/>
    {/* Resource widgets must be siblings of all tokens: a child inside one
        token's stacking context cannot rise above an overlapping token. */}
    <TokenMonitorFrames tokens={visibleTokens} remotePositions={remotePositions}
     preview={preview} config={displaySettings} monitorValues={monitorValues}
     encumbranceBadges={encumbranceBadges} gridSize={map.grid_size} scale={scale}/>
    {previewActive&&<MapPlayerPreviewOverlay map={map} environment={environment}
     polygon={previewPolygon} viewerName={previewToken?.name}/>}
   </div>
   </div>
  </div>
 </>;
}
createRoot(document.getElementById('root')).render(<AppErrorBoundary><App/></AppErrorBoundary>);
