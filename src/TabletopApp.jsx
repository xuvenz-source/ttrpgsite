import {rollHotbarSlot,parseRollHotbarCommand,resolveSheetHotbarRoll} from './HotbarRollActions.js';
import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';

import{createClient}from'@supabase/supabase-js';



import PersonalTokenLibrary from './PersonalTokenLibrary.jsx';
import AccountSettings from './AccountSettings.jsx';
import {validMeasurement,liveMeasurementPayload,pointOnBattlemap,
 measurementGeometry,addLineTurn,shouldBendLineOnRightPress,shouldBendLineOnKeyPress,
 acceptMeasurementEvent,applyMeasurementEventToVisible} from './MapMeasurements.js';
import {MeasurementToolBar,MapMeasurementOverlay} from './MapMeasurementTools.jsx';
import Artwork from './Artwork.jsx';
import Bestiary from './Bestiary.jsx';
import NpcEditor from './NpcEditor.jsx';
import CharacterEditor from './CharacterEditor.jsx';
import TabletopSidebar from './TabletopSidebar.jsx';
import useCampaignHandouts from './useCampaignHandouts.js';
import CampaignHandoutWindow from './CampaignHandoutWindow.jsx';
import MapPinLayer from './MapPinLayer.jsx';
import useCampaignTools from './useCampaignTools.js';
import CampaignToolSheet from './CampaignToolSheet.jsx';
import CampaignToolMapLayer from './CampaignToolMapLayer.jsx';
import {toolCanControl} from './CampaignTools.js';
import {allowedToolMovementPreview,canSendToolMovementPreview} from './LiveToolMovement.js';
import CombatTurnOrder from './CombatTurnOrder.jsx';
import useMapCombat from './useMapCombat.js';
import MapSettingPanel from './MapSettingPanel.jsx';
import MapEnvironmentOverlay from './MapEnvironmentOverlay.jsx';
import MapObjectQuickAdjust from './MapObjectQuickAdjust.jsx';
import MapPlayerPreviewOverlay from './MapPlayerPreviewOverlay.jsx';
import MapFogOverlay from './MapFogOverlay.jsx';
import useAuthorizedMapFog from './useAuthorizedMapFog.js';
import useAuthorizedMapLights from './useAuthorizedMapLights.js';
import {previewViewer,previewVisionPolygon,pointInPolygon} from './MapVisionPreview.js';
import {normalizeEnvironment,withObject,patchObject,removeObject} from './MapEnvironment.js';
import {eventAffectsMap,createCoalescedRefresh,createTrailingRefresh,createAdaptiveReconciler,
 CHAT_RECONCILE_MS,ROSTER_RECONCILE_MS} from './PerformanceScheduling.js';
import {signedAssetStore} from './SignedAssetUrls.js';
import {campaignResourceKey,createCampaignRefreshCoordinator} from './CampaignRefreshCoordinator.js';
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
import {movementTopic,canSendMovementPreview,applyAuthoritativeTokenMotion,
 reconcileTokenSnapshot,isPositionOnlyTokenEvent,isOlderTokenSnapshot} from './LiveTokenMovement.js';
import {movementPathDeltas} from './MapMovementPath.js';
import {createLatestOnlyPreviewQueue} from './ObserverPreviewQueue.js';
import {createRemotePositionSettler} from './RemotePositionSettler.js';
import {observerMotionTopic,validObserverMovementPacket,acceptObserverMovementPacket,
 nextMotionSequence,OBSERVER_PREVIEW_INTERVAL_MS,OBSERVER_PREVIEW_EXPIRE_MS} from './ObserverMovement.js';
import {canControlMapToken,selectionRectangle,selectableTokenIds,
 selectableToolIds,groupToolFootprint,boundedGroupOffset} from './MapSelection.js';
import {chatRowsForMap} from './CampaignRealtime.js';
import useCampaignPresence from './useCampaignPresence.js';
import {MacroManager} from './MacroBuilder.jsx';
import {RepeatingCollection,CollectionDesigner,makeBlankCollection,makeSpellbookField} from './RepeatingCollection.jsx';
import {DEFAULT_BINDINGS,normalizeBindings,normaliseHotbar,
 reorderHotbarSlots,removeHotbarSlot,lookupAction,isInputFocused,MacroHotbar} from './TabletopControls.jsx';
import TokenQuickEdit from './TokenQuickEdit.jsx';
import {TokenStatusBadges,TokenStatusPicker,normalizedEffects,normalizedCatalog,statusTitle} from './TokenStatuses.jsx';
import {parseSheetTemplateFile,serializeSheetTemplate,validateSheetTemplate} from './TemplateFiles.js';
import {sheetQuickcodeReferences,hydrateSheetQuickcodes,configWithSheetQuickcodes} from './SheetQuickcodes.js';
import InventoryPanel from './InventoryPanel.jsx';
import SharedInventoryPanel from './SharedInventoryPanel.jsx';
import PlayerSheetFields from './PlayerSheetFields.jsx';
import InventoryRulesDesigner from './InventoryRulesDesigner.jsx';
import {DEFAULT_ENCUMBRANCE,evaluateEncumbrance} from './InventoryMath.js';
import {AuthGate,CampaignHub} from './Welcome.jsx';


import Board from './BattlemapBoard.jsx';
import Designer from './SheetTemplateDesigner.jsx';
import {QuickEditBoundary} from './AppBoundaries.jsx';
import {uid,D} from './TabletopSheetDefaults.js';

const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
const message=e=>e?.message||String(e);
const read=async(q)=>{const{data,error}=await q;if(error)throw error;return data};
const stamp=s=>new Date(s).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const defaults=[{id:'main',name:'Character',fields:[{id:'character_name',label:'Name',type:'text',span:2},{id:'strength',label:'Strength',type:'attribute',span:1},{id:'dexterity',label:'Dexterity',type:'attribute',span:1},{id:'hp',label:'Hit points',type:'number',span:1},{id:'attack',label:'Attack',type:'roll',formula:'1d20+@{strength}',span:1}]},{id:'inventory',name:'Inventory',fields:[{id:'items',label:'Equipment',type:'inventory',columns:['Item','Qty','Weight','Notes'],span:3}]}];

function configured(){return !!db}


export default function TabletopApp(){
 const[launchSheet]=useState(()=>{
  const p=new URLSearchParams(location.search);
  return p.get('campaign')&&p.get('sheet')?
   {campaignId:p.get('campaign'),characterId:p.get('sheet')}:null;
 });
 const launchHandled=useRef(false);
 const signedAssetIdentity=useRef(null);
 const refreshCoordinator=useRef(null);
 if(!refreshCoordinator.current)
  refreshCoordinator.current=createCampaignRefreshCoordinator();
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

 const rosterRequest=useRef(0),chatRequest=useRef(0),
  campaignFetchRequest=useRef(0),campaignListRequest=useRef(0),
  mapLibraryRequest=useRef(0),npcLibraryRequest=useRef(0),
  latestChatRefresh=useRef(null),latestRosterRefresh=useRef(null);
 const[folders,setFolders]=useState([]),[maps,setMaps]=useState([]),[folder,setFolder]=useState(null),[selectedMap,setSelectedMap]=useState(''),[urls,setUrls]=useState({}),[tokens,setTokens]=useState([]);
 const[artStudio,setArtStudio]=useState(false),[npcEditors,setNpcEditors]=useState([]),
  [characterEditor,setCharacterEditor]=useState(null);
 const[accountSettingsOpen,setAccountSettingsOpen]=useState(false);
 const[openedHandout,setOpenedHandout]=useState(null);
 const[selectedToolIssueId,setSelectedToolIssueId]=useState(null);
 const[newCharacterName,setNewCharacterName]=useState('');
 const[rightTab,setRightTab]=useState('chat'),[mapZoom,setMapZoom]=useState(.7),[selectedTokenId,setSelectedTokenId]=useState(null);
 const[mapCalibrationPreview,setMapCalibrationPreview]=useState(null);
 const[mapEnvironment,setMapEnvironment]=useState(null);
 const[publishedMapEnvironment,setPublishedMapEnvironment]=useState(null);
 const mapEnvironmentCurrent=useRef(null);
 const[mapEnvironmentMapId,setMapEnvironmentMapId]=useState('');
 const[mapEnvironmentStatus,setMapEnvironmentStatus]=useState('Choose a map');
 const[mapSettingPopped,setMapSettingPopped]=useState(false);
 const mapEnvironmentWriter=useRef(null);
 const[mapSettingEditor,setMapSettingEditor]=useState({
  enabled:false,layer:'light',tool:'wall-line',showLight:true,showBackground:true,
  lockLight:false,lockBackground:true,lockTokens:true,ignoreCollision:false,snap:false,preset:'solid',previewing:false,previewTokenId:'',
  selectedId:null,selectedIds:[],selectedPinId:null,pinHandoutId:'',pinKind:'pin',lightBright:20,lightDim:20
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
 const latestMonitorRefresh=useRef(null),latestTokenRefresh=useRef(null),latestToolRefresh=useRef(null);
 const latestCampaignMetadataRefresh=useRef(null),latestMapsRefresh=useRef(null),latestNpcsRefresh=useRef(null);
 const lastObservedFog=useRef(null);
 const[remoteTokenPositions,setRemoteTokenPositions]=useState({});
 const[remoteToolPositions,setRemoteToolPositions]=useState({});
 const[remoteMeasurements,setRemoteMeasurements]=useState({});
 const measureExpiry=useRef(new Map()),lastMeasureSent=useRef(0);
 const measureSequence=useRef(0),measureRevisions=useRef(new Map()),
  measureClearRevisions=useRef(new Map());
 const liveMapChannel=useRef(null),liveMapReady=useRef(false);
 const liveMovementSeq=useRef(0),lastMovementPreview=useRef(new Map());
 const remoteMoveExpiry=useRef(new Map()),remoteToolExpiry=useRef(new Map()),latestMovementAccess=useRef({});
 const remoteMotion=useRef(null),observerRevisions=useRef(new Map()),
  remotePositionSettler=useRef(null);
 const lastPreviewFogRefresh=useRef(0),latestPartyFogRefresh=useRef(null),
  latestOwnFogRefresh=useRef(null),movementPreviewQueue=useRef(null);
 const registerRemoteMotion=useCallback(instance=>{remoteMotion.current=instance},[]);
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
 const previewStepHandler=useRef(null);
 const registerPreviewStep=useCallback(handler=>{previewStepHandler.current=handler},[]);
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
 const playerSheetFlusher=useRef(null),latestLocalCharacter=useRef(null);
 const registerSheetFlusher=useCallback(fn=>{playerSheetFlusher.current=fn},[]);
 const saveTimer=useRef(null),pendingSheetSave=useRef(null),
  sheetWriteQueue=useRef(Promise.resolve()),user=session?.user?.id,isDM=roles[activeId]==='dm';
 const playerMapId=mapAssignments.find(a=>a.user_id===user)?.map_id||camp?.active_map_id||null;
 const activeMap=maps.find(x=>x.id===selectedMap);
 const displayedMap=activeMap&&mapCalibrationPreview?.mapId===activeMap.id
  ?{...activeMap,...mapCalibrationPreview}:activeMap;
 tokenContextRef.current={mapId:selectedMap,campaignId:activeId,userId:user};
 const selectedToken=tokens.find(x=>x.id===selectedTokenId)||null;
 const campaignHandouts=useCampaignHandouts({
  db,campaignId:activeId,mapId:selectedMap,userId:user,isDM
 });
 const activeHandout=campaignHandouts.handouts.find(h=>h.id===openedHandout?.id)||
  openedHandout?.preview||null;
 const activeHandoutPin=campaignHandouts.pins.find(p=>p.id===openedHandout?.pinId)||null;
 // Close content immediately when the DM revokes access or an RLS read fails.
 useEffect(()=>{
  if(!openedHandout||isDM||campaignHandouts.loading)return;
  if(campaignHandouts.error){setOpenedHandout(null);return}
  const inLibrary=campaignHandouts.handouts.some(h=>h.id===openedHandout.id);
  const pinAllowed=campaignHandouts.pins.some(p=>p.id===openedHandout.pinId&&p.visible);
  if(!inLibrary&&!pinAllowed)setOpenedHandout(null);
 },[openedHandout,isDM,campaignHandouts.handouts,campaignHandouts.pins,
  campaignHandouts.loading,campaignHandouts.error]);
 useEffect(()=>{
  setOpenedHandout(prev=>prev?.pinId?null:prev);
 },[selectedMap]);
 // An already open pin reader must refresh text using RLS after change ticks.
 useEffect(()=>{
  if(!openedHandout?.pinId||isDM||campaignHandouts.loading||campaignHandouts.error)return;
  const pin=campaignHandouts.pins.find(p=>p.id===openedHandout.pinId);
  if(!pin?.visible)return;
  let live=true;
  void campaignHandouts.readPinNote(pin).then(note=>{
   if(!live)return;
   if(!note){setOpenedHandout(null);return}
   setOpenedHandout(old=>{
    if(old?.pinId!==pin.id)return old;
    const previous=old.preview;
    return previous?.title===note.title&&previous?.body===note.body&&
     previous?.revealed===note.revealed&&previous?.collected===note.collected?
      old:{...old,preview:note};
   });
  }).catch(()=>{if(live)setOpenedHandout(null)});
  return()=>{live=false};
 },[openedHandout?.pinId,isDM,campaignHandouts.pins,
  campaignHandouts.loading,campaignHandouts.error]);

 const campaignTools=useCampaignTools({
  db,campaignId:activeId,mapId:selectedMap,userId:user,isDM,
  refreshCoordinator:refreshCoordinator.current
 });
 const fog=useAuthorizedMapFog({db,campaignId:activeId,mapId:selectedMap,userId:user,
  refreshCoordinator:refreshCoordinator.current});
 const queuePreviewFogRefresh=()=>{
  const now=Date.now();
  if(now-lastPreviewFogRefresh.current<250)return;
  lastPreviewFogRefresh.current=now;
  void fog.refresh();
 };
 latestPartyFogRefresh.current=()=>{
  if(fog.frame?.enabled===true&&fog.frame.partyShared)
   queuePreviewFogRefresh();
 };
 latestOwnFogRefresh.current=()=>{
  if(fog.frame?.enabled===true)queuePreviewFogRefresh();
 };
 const authorizedLights=useAuthorizedMapLights({
  db,mapId:selectedMap,userId:isDM?null:user,
  revision:fog.frame?.displayVisibleDuringRefresh?null:fog.frame?.revision,
  refreshNonce:fog.frame,
  enabled:campaignTools.placed.some(t=>t.kind==='torch'&&t.light_enabled)
 });
 const selectedToolIssue=campaignTools.issued.find(t=>t.id===selectedToolIssueId);
 const onlineMembers=useCampaignPresence({
  db,campaignId:activeId,userId:user,members,rosterRefreshRef:latestRosterRefresh
 });
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
  playerSheetFlusher.current?.();
  if(!activeId||!characters.some(ch=>ch.id===characterId&&(ch.user_id===user||isDM))){
   fail('You cannot open that character.');return false;
  }
  const url=new URL(location.origin+location.pathname);
  url.searchParams.set('campaign',activeId);
  url.searchParams.set('sheet',characterId);
  // Request the final pop-out directly during the user click, not a tab intermediary.
  const popup=window.open(url.toString(),'forge-sheet-'+characterId,
   'popup=yes,width=920,height=760,resizable=yes,scrollbars=yes');
  if(!popup){fail('Your browser blocked the character pop-out. Allow pop-ups for Tabletop Forge.');return false}
  try{popup.opener=null;popup.focus()}catch{}
  return true;
 }
 async function openOwnCharacter(characterId){
  playerSheetFlusher.current?.();
  const target=characters.find(ch=>ch.id===characterId&&ch.user_id===user);
  if(!target)throw Error('Character sheet not found.');
  if(character?.id&&character.id!==target.id)await flushSheetForCast(character.id);
  setCharacter(target);setSaveState('Saved');setSheetTab('main');setTab('sheet');
 }
 async function createNewCharacter(name){
  playerSheetFlusher.current?.();
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
  if(!isDM){
   if(!t||t.owner_id!==user||t.map_id!==playerMapId||!t.visible)return;
   const own=characters.filter(ch=>ch.user_id===user);
   const id=t.character_id||(own.length===1?own[0].id:null);
   if(!id){fail('This token is not linked to your character sheet. Ask the DM to link it.');return}
   try{await openOwnCharacter(id)}catch(error){fail(error)}
   return;
  }
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
  const former=record.kind==='template'?
   record.data.field_values||{}:record.data.npc_values||{};
  const changed=Object.fromEntries(Object.entries(draft.values)
   .filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(former[key])));
  const updated=await read(db.rpc('patch_campaign_sheet_noninventory',{
   p_campaign:activeId,p_source:record.kind==='template'?'npc_template':'npc_token',
   p_source_id:record.data.id,p_values:changed,
   p_meta:{
    name:draft.name.trim(),token_path:draft.tokenPath,
    bars_public:draft.barsPublic,
    ...(record.kind==='template'?{portrait_path:draft.portraitPath}:{})
   }
  }));
  if(record.kind==='template'){
   await refreshNpcs();await refreshTokens();await refreshMonitors();
  }else{
   await refreshTokens();await refreshMonitors();
  }
  const editorKey=record.kind+':'+record.data.id;
  setNpcEditors(current=>current.map(editor=>editor.kind+':'+editor.data.id===editorKey?
   {...editor,data:updated}:editor));
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
 async function pickUpIssuedToolOnMap(id){
  const issue=campaignTools.issued.find(t=>t.id===id);
  if(!issue)return;
  try{await campaignTools.pickUp(issue)}catch(e){fail(e)}
 }
 async function holdIssuedToolOnToken(id,tokenId){
  const issued=campaignTools.issued.find(item=>item.id===id);
  const token=tokens.find(item=>item.id===tokenId);
  if(!issued||!token||token.map_id!==selectedMap)return fail('Tool or token not available.');
  try{await campaignTools.hold(issued,token)}catch(e){fail(e)}
 }
 async function placeIssuedToolOnMap(id,x,y){
  const issued=campaignTools.issued.find(t=>t.id===id);
  if(!issued||!selectedMap)return fail('Tool not available on this map.');
  try{await campaignTools.place(issued,selectedMap,x,y)}
  catch(e){fail(e)}
 }
 function prepareHandoutPin(handoutId){
  if(!isDM||!selectedMap)return fail('Select a map first.');
  if(!campaignHandouts.handouts.some(h=>h.id===handoutId))return fail('Handout not found.');
  setTab('tabletop');setRightTab('dm');
  setMapSettingEditor(old=>({...old,previewing:false,layer:'light',enabled:true,
   lockLight:false,tool:'pin',pinHandoutId:handoutId,selectedId:null}));
 }
 async function createHandoutPin(handoutId,point){
  if(!isDM||!selectedMap||!campaignHandouts.handouts.some(h=>h.id===handoutId))return;
  try{
   const pin=await campaignHandouts.createPin({handoutId,
    kind:mapSettingEditor.pinKind||'pin',...point});
   setMapSettingEditor(old=>({...old,tool:'select',pinHandoutId:''}));
   setOpenedHandout({id:handoutId,pinId:pin.id,
    preview:campaignHandouts.handouts.find(h=>h.id===handoutId)});
  }catch(e){fail(e)}
 }
 async function openMapHandoutPin(pin){
  try{
   const note=await campaignHandouts.readPinNote(pin);
   if(!note)throw Error('This pin is no longer available to you.');
   setOpenedHandout({id:note.id,pinId:pin.id,preview:note});
  }catch(e){fail(e)}
 }
 async function readMapHandoutPin(pin){
  const note=await campaignHandouts.readPinNote(pin);
  if(!note)throw Error('This pin is no longer available to you.');
  return note;
 }
 async function deleteMapHandoutPin(pin){
  if(!isDM)throw Error('Only the DM may remove pins.');
  try{
   await campaignHandouts.deletePin(pin);
   setMapSettingEditor(old=>old.selectedPinId===pin.id?
    {...old,selectedPinId:null}:old);
  }catch(e){fail(e);throw e}
 }
 async function updateMapHandoutPin(pin,patch){
  if(!isDM)throw Error('Only the DM can change pins.');
  try{await campaignHandouts.updatePin(pin,patch)}catch(e){fail(e)}
 }
 async function moveMapHandoutPin(pin,point){
  if(!isDM)return;
  try{await campaignHandouts.updatePin(pin,point)}catch(e){fail(e);throw e}
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
  // Update the visible owned map token immediately; do not wait for the
  // Supabase round trip before showing the character's newly equipped art.
  // The server trigger still permits ONLY the character's approved token_path.
  const affected=tokens.filter(t=>t.owner_id===user&&t.character_id===owner.id);
  const before=new Map(affected.map(t=>[t.id,t.image_path]));
  if(affected.length)setTokens(rows=>rows.map(t=>before.has(t.id)?
   {...t,image_path:art.tokenPath}:t));
  try{
   const saved=await read(db.from('map_tokens').update({image_path:art.tokenPath})
    .eq('campaign_id',activeId).eq('character_id',owner.id).eq('owner_id',user)
    .select('id'));
   if(affected.some(t=>!saved.some(row=>row.id===t.id)))
    throw Error('A controlled token could not be updated in the current map.');
   void refreshTokens();
  }catch(error){
   // The character sheet artwork remains saved; do not throw back to the
   // library uploader, which would delete files the sheet now references.
   setTokens(rows=>rows.map(t=>before.has(t.id)?
    {...t,image_path:before.get(t.id)}:t));
   fail('Character artwork saved, but a map token did not update: '+message(error));
   void refreshTokens();
  }
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
   setCharacter(current=>{
    const server=sheets.find(ch=>ch.id===current?.id&&ch.user_id===user)||
     sheets.find(ch=>ch.user_id===user)||null;
    const pending=pendingSheetSave.current;
    return server&&pending?.id===server.id?
     {...server,name:pending.name,field_values:enrichSheetValues(camp?.sheet_template,{
      ...server.field_values,...pending.patches
     })}:server;
   });
  }catch(e){
   if(request===rosterRequest.current)
    console.warn('Could not refresh campaign roster',e);
  }
 }
 async function refreshMonitors(fresh=false){
  const request=++monitorRequest.current;
  if(!selectedMap||!activeId||!user){
   setMonitorValues({});setEncumbranceBadges({});return;
  }
  // These are two independent server-derived resources. Concurrent callers
  // share only in-flight reads for the same authorized campaign/map/viewer.
  const valuesKey=campaignResourceKey({campaignId:activeId,mapId:selectedMap,
   userId:user,resource:'token-monitor-values'});
  const badgesKey=campaignResourceKey({campaignId:activeId,mapId:selectedMap,
   userId:user,resource:'token-encumbrance-badges'});
  if(fresh===true){
   refreshCoordinator.current.invalidate(valuesKey);
   refreshCoordinator.current.invalidate(badgesKey);
  }
  try{
   const [valuesReply,badgesReply]=await Promise.all([
    refreshCoordinator.current.request(valuesKey,
     ()=>read(db.rpc('get_token_monitor_values',{p_map:selectedMap}))),
    refreshCoordinator.current.request(badgesKey,
     ()=>read(db.rpc('get_token_encumbrance_badges',{p_map:selectedMap})))
   ]);
   if(!valuesReply.current||!badgesReply.current)return;
   const rows=valuesReply.value,badges=badgesReply.value;
   if(request===monitorRequest.current){
    const latest=Object.fromEntries((rows||[]).map(row=>[row.token_id,row.fields||{}]));
    // Preserve optimistic patches while a remote read is pending.
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
 async function refreshTokens(fresh=false){
  const request=++tokenRefreshSeq.current;
  const mapId=selectedMap,campaignId=activeId;
  if(!mapId){setTokens([]);return}
  try{
   const key=campaignResourceKey({campaignId,mapId,userId:user,resource:'map-tokens'});
   // A sight revision must never reuse a request begun before authorization
   // changed. No completed snapshot is cached between refresh calls.
   if(fresh===true)refreshCoordinator.current.invalidate(key);
   const response=await refreshCoordinator.current.request(key,
    ()=>read(db.from('map_tokens').select(
     'id,campaign_id,map_id,owner_id,name,color,x,y,visible,updated_at,npc_template_id,character_id,image_path,span_x,span_y,npc_bars_public,status_effects'
    ).eq('map_id',mapId)));
   if(!response.current)return;
   const rows=response.value;
   // Ignore older requests, including requests started before switching maps.
   if(request!==tokenRefreshSeq.current||
      tokenContextRef.current.mapId!==mapId||
      tokenContextRef.current.campaignId!==campaignId)return;
   // Realtime snapshots may lag behind the newest keyboard or drag destination.
   // Merge the latest local destination until its database write is confirmed.
   setTokens(previous=>reconcileTokenSnapshot(previous,rows.map(token=>{
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
   })));
   // Return exactly the RLS-approved projection for expiry reconciliation.
   return rows;
  }catch(e){
   if(request===tokenRefreshSeq.current)fail(e);
   return null;
  }
 }
 useEffect(()=>{
  if(!db){setAuthReady(true);return}
  db.auth.getSession().then(({data})=>{
   const identity=data.session?.user?.id||null;
   if(signedAssetIdentity.current!==identity){
    if(signedAssetIdentity.current!==null)signedAssetStore.clear();
    signedAssetIdentity.current=identity;
   }
   setSession(data.session);setAuthReady(true);
  });
  const {data}=db.auth.onAuthStateChange((_event,s)=>{
   // Resuming the same signed-in account must not blank the token/map art.
   const identity=s?.user?.id||null;
   if(signedAssetIdentity.current!==identity){
    signedAssetStore.clear();signedAssetIdentity.current=identity;
   }
   setSession(s);
  });
  return()=>data.subscription.unsubscribe();
 },[]);
 useEffect(()=>{if(user)fetchCampaigns(launchSheet?.campaignId||launchNpc?.campaignId);else{setCampaigns([]);setActiveId('')}},[user]);
 useEffect(()=>{if(activeId&&user){setCamp(null);setTab('tabletop');setRightTab('chat');setMapSettingPopped(false);setSelectedTokenId(null);setQuickEditToken(null);setStatusEditToken(null);
  setPendingQuickTokens({});setStatusSavingTokens({});statusPatches.current.clear();
  setSelectedToolIssueId(null);
  setOpenedHandout(null);
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
  setRemoteToolPositions({});
  setRemoteMeasurements({});
  for(const timer of measureExpiry.current.values())clearTimeout(timer);
  measureExpiry.current.clear();lastMeasureSent.current=0;
  measureRevisions.current.clear();measureClearRevisions.current.clear();
  for(const timer of remoteMoveExpiry.current.values())clearTimeout(timer);
  remoteMoveExpiry.current.clear();
  for(const timer of remoteToolExpiry.current.values())clearTimeout(timer);
  remoteToolExpiry.current.clear();lastMovementPreview.current.clear();
  liveMapReady.current=false;
  if(!db||!activeId||!selectedMap||!user)return;
  const channel=db.channel(movementTopic(selectedMap),{
   config:{private:true,broadcast:{ack:false,self:false}}
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
   for(const timer of remoteToolExpiry.current.values())clearTimeout(timer);
   remoteToolExpiry.current.clear();setRemoteToolPositions({});
   for(const timer of measureExpiry.current.values())clearTimeout(timer);
   measureExpiry.current.clear();setRemoteMeasurements({});
   void db.removeChannel(channel);
  };
 },[db,activeId,selectedMap,user]);
 // Serialize each token's expensive LOS/collision previews and discard stale
 // unsent positions if the server round trip exceeds the pointer interval.
 // Per-recipient authorization and broadcasts remain exclusively in Postgres.
 useEffect(()=>{
  if(!db||!selectedMap)return;
  const queue=createLatestOnlyPreviewQueue({
   send:packet=>db.rpc('preview_map_motion',packet.params),
   onResult:(packet,{data,error})=>{
    if(error)console.warn('Secure movement preview unavailable',error.message);
    else if(data===true&&packet.kind==='token')latestOwnFogRefresh.current?.();
   },
   onError:(_,error)=>console.warn('Secure movement preview unavailable',error)
  });
  movementPreviewQueue.current=queue;
  return()=>{
   if(movementPreviewQueue.current===queue)movementPreviewQueue.current=null;
   queue.dispose();
  };
 },[db,selectedMap]);
 // Short observer-quiet window before converging the preview toward a final
 // authorized coordinate. This prevents a previous commit from rewinding
 // another player's currently active drag.
 useEffect(()=>{
  if(!selectedMap)return;
  const manager=createRemotePositionSettler({
   settle:(id,x,y)=>{
    const preview=remoteMotion.current?.getPreview(id);
    if(preview?.remote&&(preview.x!==x||preview.y!==y))
     remoteMotion.current?.settleRemote(id,x,y);
   }
  });
  remotePositionSettler.current=manager;
  return()=>{
   manager.dispose();
   if(remotePositionSettler.current===manager)remotePositionSettler.current=null;
  };
 },[selectedMap]);
 // A private observer topic receives only server-signed movement data that
 // Postgres filtered for this specific player's map assignment and current LOS.
 // Pointer packets paint token/tool transforms directly, not TabletopApp state.
 useEffect(()=>{
  observerRevisions.current.clear();
  if(!db||!activeId||!selectedMap||!user)return;
  const mapId=selectedMap;
  const channel=db.channel(observerMotionTopic(mapId,user),{
   config:{private:true,broadcast:{ack:false,self:false}}
  }).on('broadcast',{event:'motion'},({payload})=>{
   if(!validObserverMovementPacket(payload,mapId,user)||
      !acceptObserverMovementPacket(payload,observerRevisions.current))return;
   if(payload.kind==='token')remotePositionSettler.current?.notePreview(payload.id);
   const access=latestMovementAccess.current;
   const isToken=payload.kind==='token';
   const known=isToken?(access.tokens||[]).some(t=>t.id===payload.id&&t.map_id===mapId):
    (access.toolPlacements||[]).some(t=>t.issue_id===payload.id&&t.map_id===mapId);
   // Never instantiate token artwork from a broadcast when RLS has not
   // provided the corresponding authorized map row.
   if(!known)return;
   const visualId=isToken?payload.id:'tool:'+payload.id;
   const expiry=isToken?remoteMoveExpiry.current:remoteToolExpiry.current;
   const previous=expiry.get(payload.id);
   if(previous)clearTimeout(previous);
   if(payload.action==='hide'){
    remoteMotion.current?.clearPreview(visualId);
    const markHidden=prior=>({...prior,[payload.id]:{
     hidden:true,seq:payload.seq,actor:payload.actor
    }});
    if(isToken)setRemoteTokenPositions(markHidden);
    else setRemoteToolPositions(markHidden);
   }else{
    remoteMotion.current?.previewRemote(visualId,payload.x,payload.y);
    if(isToken)latestPartyFogRefresh.current?.();
    const clearHidden=prior=>{
     if(!prior[payload.id]?.hidden)return prior;
     const copy={...prior};delete copy[payload.id];return copy;
    };
    if(isToken)setRemoteTokenPositions(clearHidden);
    else setRemoteToolPositions(clearHidden);
   }
   const timer=setTimeout(()=>{
    expiry.delete(payload.id);
    if(payload.action==='hide'){
     const unhide=prior=>{
      if(!prior[payload.id]?.hidden||prior[payload.id]?.seq!==payload.seq)
       return prior;
      const copy={...prior};delete copy[payload.id];return copy;
     };
     if(isToken)setRemoteTokenPositions(unhide);
     else setRemoteToolPositions(unhide);
    }
    // Finish visual motion only after the latest authorized database read.
    // Never remove the overlay first and expose a stale React left/top.
    const refresh=isToken?latestTokenRefresh.current:latestToolRefresh.current;
    void Promise.resolve(refresh?.()).then(rows=>{
     if(observerRevisions.current.get(payload.kind+':'+payload.id)!==payload.seq)return;
     if(isToken&&Array.isArray(rows)){
      const row=rows.find(token=>token.id===payload.id);
      const current=latestMovementAccess.current.tokens?.find(token=>
       token.id===payload.id);
      // Prefer a newer already-received RLS row over a delayed full snapshot.
      const target=row&&current&&isOlderTokenSnapshot(row,current)?current:row;
      if(target)remoteMotion.current?.settleRemote(
       visualId,Number(target.x),Number(target.y));
      else remoteMotion.current?.clearPreview(visualId);
     }else remoteMotion.current?.clearPreview(visualId);
    }).catch(error=>{
     console.warn('Movement reconciliation failed',error);
     if(observerRevisions.current.get(payload.kind+':'+payload.id)===payload.seq)
      remoteMotion.current?.clearPreview(visualId);
    });
   },OBSERVER_PREVIEW_EXPIRE_MS);
   expiry.set(payload.id,timer);
  }).subscribe(status=>{
   if(status==='CHANNEL_ERROR')
    console.warn('Secure observer movement unavailable; authoritative updates remain active');
  });
  return()=>{
   for(const timer of remoteMoveExpiry.current.values())clearTimeout(timer);
   remoteMoveExpiry.current.clear();
   for(const timer of remoteToolExpiry.current.values())clearTimeout(timer);
   remoteToolExpiry.current.clear();
   observerRevisions.current.clear();
   remoteMotion.current?.clear();
   void db.removeChannel(channel);
  };
 },[db,activeId,selectedMap,user]);
 function clearMapMovementPreview(mapId,tokenIds=[],issueIds=[]){
  if(!db||!mapId)return;
  // db.rpc() is PromiseLike, not a Promise with a direct .catch().
  // A final/cancelled gesture must revoke temporary fog sight even when
  // nothing changed in persisted map_tokens (and thus no tick was emitted).
  const queue=movementPreviewQueue.current;
  const keys=[...tokenIds,...issueIds.map(id=>'tool:'+id)];
  // A preview RPC already in flight could otherwise finish AFTER cleanup
  // and resurrect the stale observer position / temporary fog sight.
  void Promise.all(keys.map(key=>queue?.cancel(key)))
   .then(()=>db.rpc('end_map_motion_previews',{
    p_map:mapId,p_token_ids:tokenIds,p_tool_issue_ids:issueIds
   })).then(({error})=>{
    if(error)console.warn('Movement preview cleanup failed',error.message);
   }).catch(error=>console.warn('Movement preview cleanup failed',error))
   .finally(()=>{
    if(fog.frame?.enabled===true&&fog.frame.mapId===mapId)
     void fog.refresh();
   });
 }
 function sendLiveMovement(token,x,y,final=false,cancelled=false){
  if(final&&cancelled){
   clearMapMovementPreview(selectedMap,[token.id],[]);
   return;
  }
  // Final destination is committed separately; no speculative final broadcast.
  if(final||!fog.frame||fog.frame.mapId!==selectedMap)return;
  if(!canSendMovementPreview(token,user,selectedMap,isDM)||
    !Number.isSafeInteger(x)||!Number.isSafeInteger(y))return;
  const now=Date.now(),last=lastMovementPreview.current.get(token.id)||0;
  if(now-last<OBSERVER_PREVIEW_INTERVAL_MS)return;
  const seq=nextMotionSequence(now,liveMovementSeq.current);
  if(seq===null)return;
  liveMovementSeq.current=seq;
  lastMovementPreview.current.set(token.id,now);
  movementPreviewQueue.current?.enqueue(token.id,{kind:'token',params:{
   p_map:selectedMap,p_kind:'token',p_piece:token.id,p_x:x,p_y:y,
   p_seq:seq,p_ignore_collision:isDM&&mapSettingEditor.ignoreCollision===true
  }});
 }
 function sendLiveToolMovement(placement,x,y,final=false,cancelled=false){
  if(final&&cancelled){
   clearMapMovementPreview(selectedMap,[],[placement.issue_id]);
   return;
  }
  if(final||!fog.frame||fog.frame.mapId!==selectedMap)return;
  const issue=campaignTools.issued.find(t=>t.id===placement?.issue_id);
  if(!canSendToolMovementPreview(issue,user,isDM,selectedMap)||
    !Number.isSafeInteger(x)||!Number.isSafeInteger(y))return;
  const id=placement.issue_id,now=Date.now(),key='tool:'+id;
  const last=lastMovementPreview.current.get(key)||0;
  if(now-last<OBSERVER_PREVIEW_INTERVAL_MS)return;
  const seq=nextMotionSequence(now,liveMovementSeq.current);
  if(seq===null)return;
  liveMovementSeq.current=seq;
  lastMovementPreview.current.set(key,now);
  movementPreviewQueue.current?.enqueue(key,{kind:'tool',params:{
   p_map:selectedMap,p_kind:'tool',p_piece:id,p_x:x,p_y:y,
   p_seq:seq,p_ignore_collision:isDM&&mapSettingEditor.ignoreCollision===true
  }});
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
  // A coordinate-only event updates one token immediately. A single slower
  // authoritative read after the final waypoint catches missed deltas without
  // rebuilding every sprite's props on every incoming network packet.
  const motionUpdates=createTrailingRefresh(()=>{
   void latestTokenRefresh.current?.();
  },420);
  const campaignUpdates=createCoalescedRefresh(()=>{
   void latestCampaignMetadataRefresh.current?.();
   void latestMonitorRefresh.current?.();
  },100);
  const c=db.channel('vtt-'+activeId)
   .on('postgres_changes',{event:'*',schema:'public',table:'map_tokens',
    filter:'campaign_id=eq.'+activeId},event=>{
    const mapId=tokenContextRef.current.mapId;
    if(!eventAffectsMap(event,mapId))return;
    // The database has already applied this viewer's RLS on the row event.
    // Patch observed coordinates now, then run background reconciliation.
    const isMotionOnly=isPositionOnlyTokenEvent(
     event,latestMovementAccess.current.tokens||[],mapId);
    if(event.eventType==='UPDATE'){
     const previous=latestMovementAccess.current.tokens?.find(token=>
      token.id===event.new?.id);
     if(previous&&isOlderTokenSnapshot(event.new,previous))return;
     setTokens(previous=>applyAuthoritativeTokenMotion(
      previous,event,mapId,movementPending.current));
     const id=event.new?.id;
     if(id){
      const painted=remoteMotion.current?.getPreview(id);
      if(painted?.remote&&painted.x===event.new.x&&painted.y===event.new.y){
       // A network event can precede React's DOM commit. Handoff rather than
       // clearing a still-visible transform and jumping to the previous cell.
       remoteMotion.current?.handoffRemote(id);
       const committed=latestMovementAccess.current.tokens?.find(t=>t.id===id);
       if(committed?.x===event.new.x&&committed?.y===event.new.y)
        remoteMotion.current?.reconcile(id,Number(committed.x),Number(committed.y));
      }else if(painted?.remote){
       // Last throttled preview and final saved cell differ. A new private
       // packet cancels this scheduled convergence if motion is still active.
       remotePositionSettler.current?.noteCanonical(
        id,Number(event.new.x),Number(event.new.y));
      }
     }
    }
    if(isMotionOnly)motionUpdates.request();
    else tokenUpdates.request();
   })
   .on('postgres_changes',{event:'*',schema:'public',table:'campaigns',
    filter:'id=eq.'+activeId},()=>campaignUpdates.request())
   .on('postgres_changes',{event:'*',schema:'public',table:'npc_templates',
    filter:'campaign_id=eq.'+activeId},()=>void latestNpcsRefresh.current?.())
   .on('postgres_changes',{event:'*',schema:'public',table:'battle_maps',
    filter:'campaign_id=eq.'+activeId},()=>void latestMapsRefresh.current?.())
   .subscribe();
  return()=>{
   tokenUpdates.cancel();motionUpdates.cancel();campaignUpdates.cancel();
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
  movementPending.current.clear();
  refreshCoordinator.current.invalidateAll();
  ++tokenRefreshSeq.current;
  ++monitorRequest.current;
 },[selectedMap,activeId,user]);
 useEffect(()=>{refreshTokens();refreshMonitors();refreshChat()},[selectedMap,activeId,user]);
 // Newly observed rows were absent from the player's old RLS stream. A
 // sanitized revision tick therefore re-queries the authoritative snapshots.
 useEffect(()=>{
  if(!fog.frame||fog.frame.mapId!==selectedMap)return;
  void refreshTokens(true);void refreshMonitors(true);void campaignTools.refresh();
 },[fog.frame?.revision,selectedMap]);
 // Movement previews can revise authorized LOS without changing the saved
 // visibility tick. Refresh newly observable RLS rows only when that mask
 // actually changed, not for every pointer sample or every React render.
 useEffect(()=>{
  const current=fog.frame,previous=lastObservedFog.current;
  lastObservedFog.current=current;
  if(!current||!previous||current.mapId!==selectedMap||
     previous.mapId!==current.mapId||!current.enabled||
     current.revision!==previous.revision||
     current.displayVisibleDuringRefresh)return;
  const a=current.visible||[],b=previous.visible||[];
  if(a.length===b.length&&a.every((value,i)=>value===b[i]))return;
  void refreshTokens(true);void refreshMonitors(true);void campaignTools.refresh();
 },[fog.frame,selectedMap]);
 useEffect(()=>{
  let live=true;
  setMapEnvironment(null);setPublishedMapEnvironment(null);
  mapEnvironmentCurrent.current=null;setMapEnvironmentMapId('');
  setMapSettingEditor(old=>({...old,enabled:false,previewing:false,ignoreCollision:false,previewTokenId:'',selectedId:null}));
  if(!db||!isDM||!activeId||!selectedMap){
   setMapEnvironmentStatus('Choose a map');return()=>{live=false};
  }
  setMapEnvironmentStatus('Loading map environment…');
  (async()=>{
   const {data,error:loadError}=await db.from('map_environments').select('prepared,live')
    .eq('campaign_id',activeId).eq('map_id',selectedMap).maybeSingle();
   if(!live)return;
   if(loadError){
    setMapEnvironmentStatus('Map storage unavailable: apply the staged environment migration first.');
    console.warn('Map environment loading failed',loadError);return;
   }
   mapEnvironmentCurrent.current=normalizeEnvironment(data?.prepared);
   setMapEnvironment(mapEnvironmentCurrent.current);
   setPublishedMapEnvironment(data?.live?normalizeEnvironment(data.live):null);
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
  latestToolRefresh.current=campaignTools.refresh;
  latestCampaignMetadataRefresh.current=refreshCampaignMetadata;
  latestMapsRefresh.current=refreshMaps;
  latestNpcsRefresh.current=refreshNpcs;
  latestMovementAccess.current={tokens,members,mapId:selectedMap,user,
   fogEnabled:!fog.frame||fog.frame.mapId!==selectedMap||fog.frame.enabled,
   toolPlacements:campaignTools.placed,issued:campaignTools.issued};
 });
 // Browsers may throttle or suspend background tabs. Keep the board mounted;
 // reconcile only after a meaningful absence, without clearing image URLs.
 useEffect(()=>{
  if(!db||!activeId||!user)return;
  let hiddenAt=document.visibilityState==='hidden'?Date.now():null;
  let lastRefresh=0;
  const resync=()=>{
   if(document.visibilityState==='hidden'){hiddenAt=Date.now();return}
   if(hiddenAt===null)return;
   const elapsed=Date.now()-hiddenAt;
   hiddenAt=null;
   if(elapsed<1200||Date.now()-lastRefresh<1800)return;
   lastRefresh=Date.now();
   void latestTokenRefresh.current?.();
   void latestMonitorRefresh.current?.();
   void latestMapsRefresh.current?.();
  };
  document.addEventListener('visibilitychange',resync);
  window.addEventListener('focus',resync);
  return()=>{
   document.removeEventListener('visibilitychange',resync);
   window.removeEventListener('focus',resync);
  };
 },[db,activeId,user]);
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
    const simulated=isDM&&mapSettingEditor.previewing;
    if(!simulated&&(!selectedToken||(!isDM&&selectedToken.owner_id!==user)))return;
    if(e.repeat&&performance.now()-lastKeyboardMove.current<115){e.preventDefault();return}
    lastKeyboardMove.current=performance.now();
    e.preventDefault();
    const delta={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[action];
    if(simulated)previewStepHandler.current?.(delta[0],delta[1]);
    else moveSelectedByKey(delta[0],delta[1]);
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
 },[user,activeId,selectedMap,tab,camp,bindings,hotbarSlots,hotbarVisible,selectedTokenId,tokens,isDM,character,mapSettingEditor.previewing]);
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
 async function assignRollToHotbar(payload,index){
  const slot=rollHotbarSlot(payload);
  // Drag data can be forged. Validate sheet ownership even if a user edits
  // the JSON payload; execution also rechecks access via the database.
  if(payload?.sourceType==='character'){
   const ch=characters.find(c=>c.id===payload.sourceId);
   if(!ch||(ch.user_id!==user&&!isDM))
    throw Error('You cannot assign rolls from another player\'s character.');
  }else if(payload?.sourceType&&
   (!isDM||!['npc_token','npc_template'].includes(payload.sourceType))){
   throw Error('Only the DM may assign NPC rolls.');
  }
  if(payload?.kind==='initiative-npcs'&&!isDM)
   throw Error('Only the DM may roll NPC initiatives.');
  if(!Number.isInteger(index)||index<0||index>=8)
   throw Error('Choose a valid hotbar slot.');
  await changeHotbarByDrag(slots=>
   normaliseHotbar(slots).map((item,i)=>i===index?slot:item));
 }
 async function executeSheetHotbarRoll(action){
  if(!camp?.sheet_template)throw Error('The campaign sheet is unavailable.');
  const {sourceType,sourceId}=action;
  let values={};
  if(sourceType==='character'){
   if(character?.id===sourceId)await flushSheetForCast(sourceId);
   const {data,error:loadError}=await db.from('characters')
    .select('user_id,field_values').eq('campaign_id',activeId)
    .eq('id',sourceId).maybeSingle();
   if(loadError)throw loadError;
   if(!data||(data.user_id!==user&&!isDM))
    throw Error('That character sheet is no longer available to you.');
   values=data.field_values||{};
  }else if(sourceType==='npc_token'&&isDM){
   const {data,error:loadError}=await db.from('map_tokens')
    .select('npc_values,npc_template_id').eq('campaign_id',activeId)
    .eq('id',sourceId).maybeSingle();
   if(loadError)throw loadError;
   if(!data)throw Error('That NPC token no longer exists.');
   values=data.npc_values||{};
   if(data.npc_template_id){
    const {data:base,error:baseError}=await db.from('npc_templates')
     .select('field_values').eq('campaign_id',activeId)
     .eq('id',data.npc_template_id).maybeSingle();
    if(baseError)throw baseError;
    // A placed NPC uses its own saved overrides over Bestiary defaults.
    values={...(base?.field_values||{}),...values};
   }
  }else if(sourceType==='npc_template'&&isDM){
   const {data,error:loadError}=await db.from('npc_templates')
    .select('field_values').eq('campaign_id',activeId)
    .eq('id',sourceId).maybeSingle();
   if(loadError)throw loadError;
   if(!data)throw Error('That Bestiary creature no longer exists.');
   values=data.field_values||{};
  }else throw Error('You cannot use rolls from this sheet.');
  const resolved=resolveSheetHotbarRoll(action,camp.sheet_template,values);
  await roll(resolved.formula,resolved.label,sourceType==='character'&&!isDM?sourceId:null);
 }
 async function create(e){e.preventDefault();setBusy(true);try{const id=await read(db.rpc('create_campaign',{p_name:createName.trim()}));setCreateName('');await fetchCampaigns(id)}catch(e){fail(e)}finally{setBusy(false)}}
 async function join(e){e.preventDefault();setBusy(true);try{const id=await read(db.rpc('join_campaign',{p_invite_code:joinCode.trim().toLowerCase()}));setJoinCode('');history.replaceState({},'',location.pathname);await fetchCampaigns(id)}catch(e){fail(e)}finally{setBusy(false)}}
 function writeSheetSnapshot(snapshot){
  // Preserve write order, even when a queued autosave and an immediate spell
  // cast try to persist different versions of the same character.
  const write=sheetWriteQueue.current.then(()=>read(db.rpc(
   'patch_campaign_sheet_noninventory',{
    p_campaign:snapshot.campaign_id,p_source:'character',p_source_id:snapshot.id,
    p_values:snapshot.patches||{},p_meta:{name:snapshot.name}
   })))
   .then(result=>{notifyMonitorRefresh();return result});
  sheetWriteQueue.current=write.catch(()=>{});
  return write;
 }
 function updateField(id,value){
  if(!character)return;
  // Multiple buffered fields must compose even before React's next render.
  const previous=latestLocalCharacter.current?.id===character.id?
   latestLocalCharacter.current:character;
  const next={...previous,field_values:enrichSheetValues(
    camp?.sheet_template,{...previous.field_values,[id]:value}
  )};
  latestLocalCharacter.current=next;
  if(id==='character_name')next.name=String(value||'New Character');
  setCharacter(next);
  React.startTransition(()=>setCharacters(old=>old.map(ch=>ch.id===next.id?next:ch)));
  // Local field edits are already instant; refresh these secondary previews
  // once per buffered batch, not on every keystroke.
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
  const priorPending=pendingSheetSave.current?.id===next.id?
   pendingSheetSave.current:null;
  const changes=Object.fromEntries(Object.entries(next.field_values)
   .filter(([key,fieldValue])=>JSON.stringify(fieldValue)!==
    JSON.stringify(previous.field_values?.[key])));
  pendingSheetSave.current={...next,patches:{
   ...(priorPending?.patches||{}),...changes
  }};
  const pending=pendingSheetSave.current;
  setSaveState('Saving…');clearTimeout(saveTimer.current);
  saveTimer.current=setTimeout(async()=>{
   try{
    await writeSheetSnapshot(pending);
    if(pendingSheetSave.current===pending){pendingSheetSave.current=null;setSaveState('Saved');}
    refreshMonitors();
   }catch(e){setSaveState('Save failed');fail(e)}
  },200);
}
 async function flushSheetForCast(sourceId){
  playerSheetFlusher.current?.();
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
 async function publishEnvironmentRules(action){
  if(!isDM||!selectedMap||!activeId||mapEnvironmentMapId!==selectedMap)
   return fail('Load this map’s prepared settings before publishing.');
  try{
   // Never publish an older prepared document while autosave is pending.
   await mapEnvironmentWriter.current.flush();
   setMapEnvironmentStatus(action==='publish'?'Publishing map rules…':
    action==='disable'?'Disabling published rules…':'Resetting exploration…');
   await read(db.rpc('publish_map_environment',{p_map:selectedMap,p_action:action}));
   // Player preview must use published rules, not an unpublished DM draft.
   const {data:published,error:publishedError}=await db.from('map_environments')
    .select('live').eq('map_id',selectedMap)
    .eq('campaign_id',activeId).maybeSingle();
   if(publishedError)throw publishedError;
   setPublishedMapEnvironment(published?.live?normalizeEnvironment(published.live):null);
   await fog.refresh();
   await Promise.all([refreshTokens(),refreshMonitors(),campaignTools.refresh()]);
   setMapEnvironmentStatus(action==='publish'?'Published to players.':'Saved.');
  }catch(e){fail(e);setMapEnvironmentStatus('Publication failed: '+message(e))}
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
   const shortcut=parseRollHotbarCommand(command);
   if(shortcut){
    if(shortcut.kind==='weapon'){
     await attackWithWeapon({sourceType:shortcut.sourceType,sourceId:shortcut.sourceId,
      fieldId:shortcut.fieldId,weaponId:shortcut.weaponId});return;
    }
    if(shortcut.kind==='spell'){
     await castSpell({sourceType:shortcut.sourceType,sourceId:shortcut.sourceId,
      collectionId:shortcut.fieldId,entryId:shortcut.entryId,mode:shortcut.mode});return;
    }
    if(shortcut.kind==='initiative'){
     await combatTracker.roll(shortcut.entryId);return;
    }
    if(shortcut.kind==='initiative-npcs'){
     if(!isDM)throw Error('Only the DM can roll NPC initiative.');
     await combatTracker.rollNpc();return;
    }
    await executeSheetHotbarRoll(shortcut);
    return;
   }
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
  // DM player-preview movement is simulated; never persist it even if another
  // caller attempts to use the normal movement queue while previewing.
  if(isDM&&mapSettingEditor.previewing)return;
  if(!token||!activeId||!selectedMap||token.map_id!==selectedMap)return;
  if(!isDM&&(token.owner_id!==user||playerMapId!==selectedMap))return;
  const id=token.id;
  let pending=movementPending.current.get(id);
  if(!pending||pending.mapId!==selectedMap||pending.campaignId!==activeId){
   pending={mapId:selectedMap,campaignId:activeId,
    x:Number(token.x),y:Number(token.y),baseX:Number(token.x),baseY:Number(token.y),
    override:isDM&&mapSettingEditor.ignoreCollision===true,saving:false,confirmed:false};
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
    const response=pending.override?
     await db.rpc('move_map_group',{
      p_map:pending.mapId,p_token_ids:[id],p_tool_issue_ids:[],
      p_dx:x-pending.baseX,p_dy:y-pending.baseY,p_ignore_collision:true
     }):
     await db.from('map_tokens')
      .update({x,y}).eq('id',id)
      .eq('campaign_id',pending.campaignId).eq('map_id',pending.mapId)
      .select('id,x,y').maybeSingle();
    const {data,error}=response;
    const confirmed=pending.override?data?.tokens?.find(t=>t.id===id):data;
    if(error)throw error;
    if(!confirmed)throw Error('Movement was not permitted for this token.');
    pending.baseX=Number(confirmed.x);pending.baseY=Number(confirmed.y);
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
 async function moveGroup({tokens:members=[],tools=[],dx,dy,path=[]}){
  const mapId=selectedMap,campaignId=activeId;
  if(!mapId||!campaignId||!Number.isSafeInteger(dx)||
    !Number.isSafeInteger(dy))return;
  if(!members.length&&!tools.length)return;
  if(isDM&&mapSettingEditor.previewing)return;
  const steps=movementPathDeltas(path?.length?path:[{dx,dy}]);
  if(!steps?.length||steps.reduce((total,step)=>total+step.dx,0)!==dx||
    steps.reduce((total,step)=>total+step.dy,0)!==dy)
   throw Error('Invalid movement path; no units were moved.');
  const collisionOverride=isDM&&mapSettingEditor.ignoreCollision===true;
  // Do not race a pending single-token save with a relative group delta.
  if(members.some(t=>movementPending.current.has(t.id))){
   fail(Error('Another movement is still being confirmed. Try again.'));
   return;
  }
  const pending=new Map();
  for(const member of members){
   const item={mapId,campaignId,x:Number(member.x)+dx,
    y:Number(member.y)+dy,saving:true,confirmed:false,group:true};
   pending.set(member.id,item);
   movementPending.current.set(member.id,item);
  }
  setTokens(rows=>rows.map(t=>{
   const item=pending.get(t.id);
   return item?{...t,x:item.x,y:item.y}:t;
  }));
  try{
   const {data,error:moveError}=await db.rpc('commit_map_trajectory',{
    p_map:mapId,p_token_ids:members.map(t=>t.id),
    p_tool_issue_ids:tools.map(t=>t.issue_id),
    p_steps:steps,p_ignore_collision:collisionOverride
   });
   if(moveError)throw moveError;
   if(!data||!Array.isArray(data.tokens)||!Array.isArray(data.tools)||
      data.tokens.length!==members.length||data.tools.length!==tools.length)
    throw Error('The movement acknowledgement was incomplete.');
   for(const [id,item] of pending){
    if(movementPending.current.get(id)===item){
     item.confirmed=true;
     const row=data.tokens.find(t=>t.id===id);
     if(row){item.x=Number(row.x);item.y=Number(row.y)}
    }
   }
  }catch(e){
   fail(e);
   for(const [id,item] of pending)
    if(movementPending.current.get(id)===item)movementPending.current.delete(id);
   ++tokenRefreshSeq.current;
   await Promise.all([refreshTokens(),campaignTools.refresh()]);
   clearMapMovementPreview(mapId,members.map(t=>t.id),
    tools.map(t=>t.issue_id));
   throw e;
  }
  // Refresh both the token and issued-tool projections before dropping the
  // local optimistic group. SQL commits all rows or no rows.
  await Promise.all([refreshTokens(),campaignTools.refresh()]);
  clearMapMovementPreview(mapId,members.map(t=>t.id),
   tools.map(t=>t.issue_id));
  for(const [id,item] of pending)
   if(movementPending.current.get(id)===item)movementPending.current.delete(id);
 }
 function moveSelectedByKey(dx,dy){
  if(isDM&&mapSettingEditor.previewing)return;
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
  try{
   if(mapSettingEditor.ignoreCollision){
    await read(db.rpc('resize_map_token',{
     p_token:t.id,p_span_x:spanX,p_span_y:spanY,p_ignore_collision:true
    }));
   }else{
    await read(db.from('map_tokens').update({span_x:spanX,span_y:spanY}).eq('id',t.id));
   }
  }catch(e){fail(e)}finally{await refreshTokens()}
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
  {openedHandout&&activeHandout&&<CampaignHandoutWindow
  key={activeHandout.id} note={activeHandout} pin={activeHandoutPin}
  isDM={isDM} folders={campaignHandouts.folders}
  onClose={()=>setOpenedHandout(null)}
  onSave={(note,patch)=>campaignHandouts.updateHandout(note,patch)}
  onDelete={campaignHandouts.deleteHandout}
  onUpdatePin={campaignHandouts.updatePin}
  onDeletePin={campaignHandouts.deletePin}
  onCollect={campaignHandouts.collectPin}/>} 
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
 {tab==='sheet'&&<FloatingWindow kind="sheet" onClose={()=>{playerSheetFlusher.current?.();launchSheet?window.close():setTab('tabletop')}}>
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
  {!launchSheet&&<button type="button" className="secondary" disabled={!character}
   onClick={()=>openSheetBrowserTab(character.id)} title="Open this character sheet in a separate browser window">
   ↗ Pop out</button>}
  <button type="button" className="secondary" disabled={!character}
   onClick={()=>setArtStudio(true)}>My Token Library</button>
  <button type="button" className="secondary return-to-game" onClick={()=>{playerSheetFlusher.current?.();launchSheet?window.close():setTab('tabletop')}}>{launchSheet?'Close window':'← Return to Game'}</button>
</div><div className="tabs">{camp.sheet_template.tabs.map(t=><button key={t.id} className={sheetTab===t.id?'selected':''} onClick={()=>setSheetTab(t.id)}>{t.name}</button>)}
 <button className={sheetTab===PERSONAL_RESOURCE_TAB?'selected':''}
  onClick={()=>setSheetTab(PERSONAL_RESOURCE_TAB)}>Resources</button></div>
 <PlayerSheetFields key={character?.id||'missing-character'}
  db={db} campaignId={activeId} userId={user} isDM={isDM}
  character={character} template={camp.sheet_template} tabId={sheetTab}
  onBatchChange={(id,patch)=>{
   if(id!==character?.id)return;
   for(const [fieldId,value] of Object.entries(patch))updateField(fieldId,value);
  }}
  registerFlusher={registerSheetFlusher}
  onRoll={roll} onCastSpell={castSpell} onEquipmentAttack={attackWithWeapon}
  onAddSpellToHotbar={assignSpellToHotbar}/></section>
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
   publishedEnvironment={mapEnvironmentMapId===selectedMap?publishedMapEnvironment:null}
   active={tab==='tabletop'||tab==='sheet'} combatActiveTokenId={combatActiveTokenId}
   environmentEditor={mapSettingEditor} registerPreviewStep={registerPreviewStep}
   onAddEnvironmentObject={addEnvironmentObject}
   handoutPins={campaignHandouts.pins} onCreateHandoutPin={createHandoutPin}
   onOpenHandoutPin={openMapHandoutPin} onMoveHandoutPin={moveMapHandoutPin}
   onReadHandoutPin={readMapHandoutPin} onCollectHandoutPin={campaignHandouts.collectPin}
   onDeleteHandoutPin={deleteMapHandoutPin}
   onSelectHandoutPin={pin=>setMapSettingEditor(old=>({
    ...old,selectedPinId:pin.id,selectedId:null,selectedIds:[]
   }))}
   onPatchEnvironmentObject={patchEnvironmentObject}
   onDeleteEnvironmentObject={selection=>{
    if(!isDM||!mapEnvironmentCurrent.current)return;
    const ids=Array.isArray(selection)?selection:[selection];
    const base=normalizeEnvironment(mapEnvironmentCurrent.current);
    if(!ids.length)return;
    saveMapEnvironment({...base,objects:base.objects.filter(o=>!ids.includes(o.id))});
    setMapSettingEditor(old=>({...old,selectedId:null,selectedIds:[]}));
   }} characters={characters}
   template={camp?.sheet_template} onSelectEnvironmentObject={(selection,options={})=>
    setMapSettingEditor(old=>{
     const incoming=Array.isArray(selection)?selection:selection?[selection]:[];
     const current=old.selectedIds||[];
     const selectedIds=options.additive?[...new Set([...current,...incoming])]:incoming;
     return {...old,selectedPinId:null,selectedId:selectedIds[0]||null,selectedIds};
    })}
   user={user} isDM={isDM} move={moveToken} moveGroup={moveGroup} remove={removeToken}
   onNpcDrop={placeNpc} onCharacterDrop={placeCharacterOnMap}
   toolPlacements={campaignTools.placed} toolIssued={campaignTools.issued}
   onToolPlace={placeIssuedToolOnMap} onToolPickUp={pickUpIssuedToolOnMap}
   onToolHold={holdIssuedToolOnToken}
   onToolOpen={setSelectedToolIssueId} onToolMovementPreview={sendLiveToolMovement}
   remoteToolPositions={remoteToolPositions}
   onMovementPreview={sendLiveMovement} remotePositions={remoteTokenPositions}
   registerRemoteMotion={registerRemoteMotion}
    fogFrame={fog.frame}
    authorizedLightMasks={authorizedLights}
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
    onAssignRoll={(index,payload)=>assignRollToHotbar(payload,index).catch(fail)}
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
 campaignHandouts={campaignHandouts} onOpenHandout={id=>setOpenedHandout({id})}
 onPrepareHandoutPin={prepareHandoutPin} onHandoutError={fail}
 campaignTools={campaignTools} onOpenCampaignTool={setSelectedToolIssueId}
 onToolError={fail}
 chat={chat} onChatChange={setChat} onSendChat={sendChat}
 npcs={npcs} npcFolders={npcFolders}
 onNewNpcFolder={makeNpcFolder} onNewNpc={makeNpc}
 onEditNpc={n=>openNpcEditor({kind:'template',data:n})}
 onMoveNpc={moveNpcFolder} onPlaceNpc={id=>placeNpc(id)}
 activeMap={activeMap} maps={maps} selectedMap={selectedMap} onSelectMap={id=>selectMap(id).catch(fail)}
 mapEnvironment={mapEnvironmentMapId===selectedMap?mapEnvironment:null}
 mapEnvironmentStatus={mapEnvironmentStatus}
 onPublishEnvironment={publishEnvironmentRules}
 onDisablePublished={publishEnvironmentRules}
 onResetExploration={publishEnvironmentRules}
 publishedEnvironment={fog.published}
 pinsForMap={campaignHandouts.pins}
 onUpdateHandoutPin={updateMapHandoutPin} onDeleteHandoutPin={deleteMapHandoutPin}
 mapSettingEditor={mapSettingEditor} onMapSettingEditorChange={setMapSettingEditor}
 handoutsForMap={campaignHandouts.handouts}
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
    db={db}
   tokens={tokens} user={user} isDM={isDM} busy={combatTracker.busy}
   onClose={()=>combatTracker.setOpen(false)}
   onNext={()=>combatTracker.command('next')}
   onPrevious={()=>combatTracker.command('previous')}
   onSort={()=>combatTracker.command('sort')}
    onRemoveEntry={entryId=>combatTracker.command('remove',entryId)}
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
     onPublishEnvironment={publishEnvironmentRules}
     onDisablePublished={publishEnvironmentRules}
     onResetExploration={publishEnvironmentRules}
     publishedEnvironment={fog.published}
     onMapCalibrationPreview={setMapCalibrationPreview}
     onSaveMapCalibration={saveMapCalibration}
     template={camp?.sheet_template} saveStatus={mapEnvironmentStatus} tokens={tokens}
     handouts={campaignHandouts.handouts} pins={campaignHandouts.pins}
     onUpdatePin={updateMapHandoutPin} onDeletePin={deleteMapHandoutPin}/>
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
   onOpenBrowserTab={launchSheet?undefined:()=>openSheetBrowserTab(characterEditor.data.id)}
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
 {selectedToolIssue&&<CampaignToolSheet key={selectedToolIssue.id}
  db={db} tool={selectedToolIssue} userId={user} isDM={isDM}
  onRefresh={campaignTools.refresh}
  onClose={()=>setSelectedToolIssueId(null)}/>}
 {quickEditToken&&camp&&<QuickEditBoundary key={quickEditToken.id} onClose={()=>setQuickEditToken(null)}>
  <TokenQuickEdit db={db} token={quickEditToken} template={camp.sheet_template}
   allowedFields={camp.token_quick_fields||[]}
   heldTools={campaignTools.issued.filter(tool=>tool.held_by_token_id===quickEditToken.id)}
   onDropHeldTool={issue=>campaignTools.dropHeld(issue,
    tokens.find(token=>token.id===quickEditToken.id)||quickEditToken)}
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
