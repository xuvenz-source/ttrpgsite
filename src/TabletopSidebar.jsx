import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import Artwork from './Artwork.jsx';
import MapCalibration from './MapCalibration.jsx';
import TokenDisplayDesigner from './TokenDisplayDesigner.jsx';
import {StatusCatalogEditor,TokenStatusBadges,normalizedEffects} from './TokenStatuses.jsx';
import {KeybindingsEditor,HotbarSettings} from './TabletopControls.jsx';
import {QuickFieldsSettings} from './TokenQuickEdit.jsx';
import Bestiary from './Bestiary.jsx';
import SpellChatCard from './SpellChatCard.jsx';
import MacroChatCard from './MacroChatCard.jsx';
import RollMathTooltip from './RollMathTooltip.jsx';
import DmItemDistribution from './DmItemDistribution.jsx';

const when=date=>new Date(date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const tabs=[
 {id:'chat',label:'Chat',icon:'💬'},
 {id:'units',label:'Units',icon:'♟'},
 {id:'settings',label:'Settings',icon:'⚙'},
 {id:'dm',label:'DM',icon:'🛠'}
];

function UnitRow({db,token,selected,isDM,onSelect,onOpen,onStatus,canDrag,statusCatalog}){
 return <div className={'unit-row'+(selected?' unit-row-selected':'')}>
  <button className="unit-focus" type="button" draggable={canDrag}
    onDragStart={e=>{
     if(!canDrag){e.preventDefault();return}
     e.dataTransfer.setData('application/x-forge-unit',token.id);
     e.dataTransfer.effectAllowed='move';
    }}
    onClick={()=>onSelect(token.id)}
    title={canDrag?'Drag '+token.name+' to move on the map, or click to select':'Select '+token.name+' on map'}>
   <Artwork db={db} path={token.image_path} alt={token.name} className="unit-thumb"/>
   <span className="unit-name">{token.name}</span>
   <span className="unit-size muted tiny">{Number(token.span_x??1)}×{Number(token.span_y??1)}</span>
  </button>
  <button type="button" className="secondary unit-status-action"
   onClick={()=>onStatus(token)} title={'View / edit '+token.name+' conditions and buffs'}
   aria-label={'Status effects for '+token.name}>
   ✧{normalizedEffects(token.status_effects).length>0&&
    <small>{normalizedEffects(token.status_effects).length}</small>}
  </button>
  {isDM&&<button type="button" className="secondary unit-edit" onClick={()=>onOpen(token)} title={'Open '+token.name+' sheet'}>Sheet</button>}
 </div>;
}
function UnitGroups({db,tokens,characters,members,accountNames=[],user,isDM,
 selectedToken,onSelect,onOpen,onStatus,statusCatalog,onResize,onOpenPlayerCharacter,
 onOpenOwnCharacter,onOpenCharacterTab,onCreateCharacter,newCharacterName,onChangeNewCharacterName,
 onAddToken,newToken,onChangeTokenName,tokenOwner,onChangeTokenOwner,activeMap}){
 const [collapsed,setCollapsed]=useState({});
 const [hiddenSheets,setHiddenSheets]=useState({});
 const owners=useMemo(()=>members.filter(m=>isDM||m.user_id===user)
  .map(m=>({
   ...m,
   label:accountNames.find(a=>a.user_id===m.user_id)?.account_name||
    'Player '+String(m.user_id).slice(0,8),
   sheets:characters.filter(ch=>ch.user_id===m.user_id),
   otherTokens:tokens.filter(t=>t.owner_id===m.user_id&&
    !characters.some(ch=>ch.user_id===m.user_id&&ch.id===t.character_id))
  })),[members,characters,tokens,accountNames,isDM,user]);
 const unassigned=tokens.filter(t=>!t.owner_id||!members.some(m=>m.user_id===t.owner_id));
 const unitProps=t=>({db,token:t,selected:selectedToken?.id===t.id,isDM,
  onSelect,onOpen,onStatus,statusCatalog,canDrag:!!activeMap&&(isDM||t.owner_id===user)});
 return <div className="right-section">
  <p className="muted tiny side-description">Account folders contain character sheets. Drag a character onto the map to place a token.</p>
  <div className="unit-groups">{owners.map(owner=><section key={owner.user_id} className="unit-group unit-account">
   <button type="button" className="unit-group-head" onClick={()=>
    setCollapsed(s=>({...s,[owner.user_id]:!s[owner.user_id]}))}
    aria-expanded={!collapsed[owner.user_id]}>
    <span className="unit-group-label"><span aria-hidden="true">👤</span>
     <span>{collapsed[owner.user_id]?'▸':'▾'} {owner.label}{owner.user_id===user?' (you)':''}</span>
    </span>
    <span className="unit-count">{owner.sheets.length} sheets</span>
   </button>
   {!collapsed[owner.user_id]&&<div className="unit-account-content">
    {owner.sheets.map(ch=>{
     const linked=tokens.filter(t=>t.character_id===ch.id&&t.owner_id===owner.user_id);
     const visible=!hiddenSheets[ch.id];
     return <section className="unit-character" key={ch.id}>
      <div className="unit-character-heading">
       <button type="button" className="unit-character-toggle" aria-expanded={visible}
        onClick={()=>setHiddenSheets(s=>({...s,[ch.id]:!s[ch.id]}))}>
        <Artwork db={db} path={ch.token_path||ch.portrait_path}
         alt={ch.name||'Character'} className="group-unit-thumb"/>
        <span>{visible?'▾':'▸'} {ch.name||'Unnamed character'}</span>
        <span className="unit-count">{linked.length}</span>
       </button>
       <button type="button" className="secondary unit-character-sheet" onClick={()=>
        owner.user_id===user?onOpenOwnCharacter(ch.id):onOpenPlayerCharacter(ch.id)}>
        Sheet</button>
       <button type="button" className="secondary unit-character-sheet"
        title="Open in separate browser tab" onClick={()=>onOpenCharacterTab(ch.id)}>↗</button>
      </div>
      {visible&&<div className="unit-character-contents">
       {activeMap&&<div draggable className="unit-character-drag"
        title={'Drag '+(ch.name||'character')+' onto the map'}
        onDragStart={e=>{
         e.dataTransfer.setData('application/x-forge-character',ch.id);
         e.dataTransfer.effectAllowed='copy';
        }}>⠿ Drag onto map</div>}
       {linked.length?linked.map(t=><UnitRow key={t.id} {...unitProps(t)}/>):
        <p className="muted tiny empty-units">No tokens on this map</p>}
      </div>}
     </section>;
    })}
    {owner.otherTokens.length>0&&<div className="unit-character">
     <strong className="muted tiny">Other controlled tokens</strong>
     {owner.otherTokens.map(t=><UnitRow key={t.id} {...unitProps(t)}/>)}
    </div>}
    {owner.user_id===user&&<details className="side-details unit-create-character">
     <summary>+ New character sheet</summary>
     <form className="side-form" onSubmit={e=>{e.preventDefault();onCreateCharacter(newCharacterName)}}>
      <label>Character name<input value={newCharacterName} required maxLength={100}
       onChange={e=>onChangeNewCharacterName(e.target.value)} placeholder="Character name"/></label>
      <button type="submit">Create character sheet</button>
     </form>
    </details>}
    {!owner.sheets.length&&owner.user_id!==user&&
     <p className="muted tiny empty-units">No character sheets yet</p>}
   </div>}
  </section>)}
  {isDM&&unassigned.length>0&&<section className="unit-group">
   <div className="unit-group-head">Unassigned / DM NPCs</div>
   <div className="unit-group-items">{unassigned.map(t=>
    <UnitRow key={t.id} {...unitProps(t)}/>)}</div>
  </section>}
  </div>
  {!owners.length&&<p className="muted small">No campaign members found.</p>}
  {isDM&&<details className="side-details">
   <summary>Place a new token</summary>
   <div className="side-form">
    <label>Token name<input value={newToken} onChange={e=>onChangeTokenName(e.target.value)} maxLength={80} placeholder="Token name"/></label>
    <label>Linked character<select value={tokenOwner} onChange={e=>onChangeTokenOwner(e.target.value)}>
      <option value="">Game Master (unlinked NPC)</option>
      {characters.map(ch=><option key={ch.id} value={ch.id}>{ch.name||'Unnamed character'}</option>)}
    </select></label>
    <button type="button" disabled={!activeMap} onClick={onAddToken}>Place on current map</button>
    <p className="muted tiny">For reusable NPCs, create them in Bestiary instead.</p>
   </div>
  </details>}
  {isDM&&selectedToken&&<div className="unit-inspector">
   <h3>Selected: {selectedToken.name}</h3>
   <button type="button" className="secondary full-button"
    onClick={()=>onStatus(selectedToken)}>✧ Manage conditions & buffs</button>
   <p className="muted tiny">Footprint: {Number(selectedToken.span_x??1)} × {Number(selectedToken.span_y??1)} squares</p>
   <label>Token size
    <select value={Number(selectedToken.span_x??1)===Number(selectedToken.span_y??1)
     ?String(Number(selectedToken.span_x??1))
     :(Number(selectedToken.span_x)===4&&Number(selectedToken.span_y)===2?'4x2':'custom')}
     onChange={e=>{
      const [w,h]=e.target.value==='4x2'?[4,2]:[Number(e.target.value),Number(e.target.value)];
      if(!Number.isFinite(w)||!Number.isFinite(h))return;
      onResize(selectedToken,w,h);
     }}>
     <option value=".5">Small · ½×½</option>
     <option value="1">Medium · 1×1</option>
     <option value="2">Large · 2×2</option>
     <option value="3">Huge · 3×3</option>
     <option value="4">4×4</option>
     <option value="4x2">Eight squares · 4×2</option>
     <option value="custom">Custom · resize corner</option>
    </select>
   </label>
   <p className="muted tiny">Drag the bottom-right corner to resize. Press Delete to remove. Open its sheet from the unit list or Alt + double-click.</p>
  </div>}
 </div>;
}

export default function TabletopSidebar({
 db,panel,onPanelChange,isDM,user,
 messages,characters,members,accountNames=[],tokens,selectedToken,onSelectToken,onOpenToken,onResizeToken,onOpenStatus,
 chat,onChatChange,onSendChat,
 npcs,npcFolders,onNewNpcFolder,onNewNpc,onEditNpc,onMoveNpc,onPlaceNpc,
 activeMap,maps,selectedMap,onSelectMap,publishedMapId,onPublishMap,onMoveEntireParty,onOpenMapLibrary,
 mapAssignments=[],onAssignPlayerMap,
 newToken,onChangeTokenName,tokenOwner,onChangeTokenOwner,onAddToken,
 mapZoom,onChangeZoom,onMapCalibrationPreview,onSaveMapCalibration,onSaveTokenDisplay,
 statusCatalog,onSaveStatusCatalog,template,quickFields,onSaveQuickFields,onCopyInvite,onNavigate,onCreatePortrait,onOpenPlayerCharacter,currentPage,onDistributedItem,
 bindings,onSaveBindings,hotbarSlots,onSaveHotbar,hotbarVisible,onChangeHotbarVisible,
 macroCount=0,onOpenMacros,
 uiScale,onChangeUiScale,
 activeCharacterId,newCharacterName,onChangeNewCharacterName,onCreateCharacter,onOpenOwnCharacter,onOpenCharacterTab,
 campaignName,campaignTokenDisplay,activeCampaignId,onReturnToMenu,hasCampaign
}){
 const validPanel=panel==='bestiary'?(isDM?'dm':'units'):(!isDM&&panel==='dm'?'units':panel);
 const chatScrollRef=useRef(null);
 const followNewChatRef=useRef(true);
 // Scroll to latest when a chat view opens or the viewed map changes.
 useLayoutEffect(()=>{
  followNewChatRef.current=true;
  const pane=chatScrollRef.current;
  if(pane)pane.scrollTop=pane.scrollHeight;
 },[validPanel,activeMap?.id]);
 // Leave the reading position alone after the user scrolls up. Resuming
 // at the bottom re-enables follow mode for subsequent rolls and messages.
 useLayoutEffect(()=>{
  const pane=chatScrollRef.current;
  if(pane&&followNewChatRef.current)pane.scrollTop=pane.scrollHeight;
 },[messages,validPanel]);
 function onChatScroll(){
  const pane=chatScrollRef.current;
  if(pane)followNewChatRef.current=
   pane.scrollHeight-pane.scrollTop-pane.clientHeight<=48;
 }
 return <aside className="right-sidebar panel" aria-label="Tabletop sidebar">
  <nav className="right-tabs" role="tablist" aria-label="Tabletop tools"
   style={{gridTemplateColumns:'repeat('+(isDM?4:3)+',minmax(0,1fr))'}}>
   {tabs.filter(t=>isDM||t.id!=='dm').map(t=><button key={t.id} type="button" role="tab"
     aria-selected={validPanel===t.id} className={validPanel===t.id?'selected':''}
     onClick={()=>onPanelChange(t.id)} title={t.label}>
    <span aria-hidden="true" className="tab-glyph">{t.icon}</span><span>{t.label}</span>
   </button>)}
  </nav>
  {validPanel==='chat'&&<>
   <div className="messages right-messages" ref={chatScrollRef}
    onScroll={onChatScroll}>{messages.map(m=><div className="msg" key={m.id}>
    <div className="muted tiny">{m.user_id===user?'You':accountNames.find(a=>a.user_id===m.user_id)?.account_name||'Party member'} · {when(m.created_at)}</div>
    {m.kind==='spell'?<SpellChatCard message={m}/>:
     m.kind==='macro'?<MacroChatCard message={m}/>:
     m.kind==='roll'?<div className="chat-roll">
     <div className="chat-roll-line">
      <span className="chat-roll-name">🎲 {m.body}</span>
      <RollMathTooltip data={m.result} className="chat-roll-result" size="small"/>
     </div>
     <details className="chat-roll-breakdown">
      <summary title="Show dice breakdown">{m.result?.expression||'Roll'} <span className="chat-roll-expand">· details</span></summary>
      <div>Dice: [{(m.result?.dice||[]).join(', ')}]{m.result?.modifier?' · Modifier: '+m.result.modifier:''}</div>
     </details>
    </div>:<p>{m.body}</p>}
   </div>)}</div>
   <form onSubmit={onSendChat} className="chatbox"><input aria-label="Message or dice command" value={chat}
     onChange={e=>onChatChange(e.target.value)} placeholder="Message or /roll 1d20"/>
    <button type="submit">Send</button>
   </form><p className="muted tiny right-chat-help">/roll 2d6+3 · /roll 2d20kh1 · /macro Attack</p>
  </>}
  {validPanel==='units'&&<div className="right-body"><UnitGroups db={db} tokens={tokens}
   characters={characters} members={members} accountNames={accountNames}
   user={user} isDM={isDM} selectedToken={selectedToken}
   onSelect={onSelectToken} onOpen={onOpenToken} onStatus={onOpenStatus}
   statusCatalog={statusCatalog} onResize={onResizeToken}
   onOpenPlayerCharacter={onOpenPlayerCharacter} onOpenOwnCharacter={onOpenOwnCharacter}
   onOpenCharacterTab={onOpenCharacterTab}
   onCreateCharacter={onCreateCharacter} newCharacterName={newCharacterName}
   onChangeNewCharacterName={onChangeNewCharacterName}
   onAddToken={onAddToken} newToken={newToken} onChangeTokenName={onChangeTokenName}
   tokenOwner={tokenOwner} onChangeTokenOwner={onChangeTokenOwner} activeMap={activeMap}/></div>}
  {validPanel==='settings'&&<div className="right-body">
   <div className="side-form">
    <button type="button" className="secondary full-button" onClick={onReturnToMenu}>← Back to main menu</button>
    {currentPage!=='tabletop'&&<button type="button" className="secondary full-button" onClick={()=>onNavigate('tabletop')}>Return to tabletop</button>}
    <details className="side-details">
     <summary>UI</summary>
     <div className="side-form">
      <label>Battlemap zoom<select value={mapZoom} onChange={e=>onChangeZoom(Number(e.target.value))}>
       <option value=".25">25%</option><option value=".35">35%</option><option value=".5">50%</option>
       <option value=".7">70%</option><option value="1">100%</option><option value="1.5">150%</option>
       <option value="2">200%</option><option value="3">300%</option>
      </select></label>
      <p className="muted tiny">Ctrl + mouse wheel over the map changes your view zoom only.</p>
      <label>Interface size<select value={uiScale} onChange={e=>onChangeUiScale(Number(e.target.value))}>
       <option value={0.8}>80% — Compact</option><option value={0.9}>90% — Default</option>
       <option value={1}>100% — Standard</option><option value={1.1}>110% — Large</option>
       <option value={1.25}>125% — Extra large</option>
      </select></label>
      <p className="muted tiny">Interface scale is saved per account; map grids are unchanged.</p>
     </div>
    </details>
    <details className="side-details shortcut-settings">
     <summary>Keyboard shortcuts</summary>
     <KeybindingsEditor bindings={bindings} onSave={onSaveBindings}/>
    </details>
    <details className="side-details shortcut-settings">
     <summary>Macros</summary>
     <div className="side-form">
      <button type="button" className="secondary full-button" onClick={onOpenMacros}>Open Macro Builder ({macroCount})</button>
      <details className="side-details shortcut-settings">
       <summary>Hotbar settings</summary>
       <HotbarSettings slots={hotbarSlots} onSave={onSaveHotbar} visible={hotbarVisible}
        onChangeVisible={onChangeHotbarVisible}/>
      </details>
     </div>
    </details>
   </div>
  </div>}
  {validPanel==='dm'&&isDM&&<div className="right-body">
   <div className="side-form">
    <details className="side-details dm-bestiary-details">
     <summary>Bestiary & NPC templates</summary>
     <div className="side-form">
      <p className="muted tiny">Manage reusable NPCs and drag them onto the map.</p>
      <Bestiary db={db} compact npcs={npcs} folders={npcFolders}
       onNewFolder={onNewNpcFolder} onNewNpc={onNewNpc} onEdit={onEditNpc}
       onMove={onMoveNpc} onPlace={onPlaceNpc} mapReady={!!activeMap}/>
     </div>
    </details>
    <details className="side-details">
     <summary>Map management</summary>
     <div className="side-form">
      <label>Current map<select value={selectedMap||''} onChange={e=>onSelectMap(e.target.value)}>
       {!maps.length&&<option value="">No maps uploaded</option>}
       {maps.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
      </select></label>
      <p className="muted small">{activeMap?.id===publishedMapId?'● Current map is live to players':'This map is not yet published to players.'}</p>
      <button type="button" disabled={!activeMap||activeMap.id===publishedMapId}
       onClick={()=>onPublishMap(selectedMap)}>Publish party default map</button>
      <button type="button" className="secondary" disabled={!activeMap}
       onClick={()=>onMoveEntireParty(selectedMap)}>Move entire party here</button>
      <p className="muted tiny">Publishing changes the shared default for unassigned players.
       Move entire party also clears private assignments and switches everyone.
       Assign players individually below for solo or split-party scenes.</p>
      <button type="button" className="secondary" onClick={onOpenMapLibrary}>Open map library</button>
      <div className="private-map-assignments">
       <strong>Player map assignments</strong>
       <p className="muted tiny">Party default follows the published map. Assign another map for a private solo or split-party scene. Other players cannot view it.</p>
       {members.filter(member=>member.role==='player').map((member,index)=>
        <label key={member.user_id}>
         {characters.filter(ch=>ch.user_id===member.user_id).map(ch=>ch.name).join(', ')||'Player '+(index+1)}
         <select value={mapAssignments.find(a=>a.user_id===member.user_id)?.map_id||''}
          onChange={e=>onAssignPlayerMap(member.user_id,e.target.value)}>
          <option value="">Party default (published map)</option>
          {maps.map(map=><option key={map.id} value={map.id}>{map.name}</option>)}
         </select>
        </label>)}
      </div>
      <details className="side-details map-calibration-panel">
       <summary>Grid & image calibration</summary>
       <MapCalibration key={activeMap?.id||'no-map'} map={activeMap}
        onPreview={onMapCalibrationPreview} onSave={onSaveMapCalibration}/>
      </details>
     </div>
    </details>
    <details className="side-details">
     <summary>Token settings & resources</summary>
     <div className="side-form">
      <details className="side-details token-designer-details">
       <summary>Ctrl + click quick-adjust fields</summary>
       <QuickFieldsSettings template={template} selected={quickFields} onSave={onSaveQuickFields}/>
      </details>
      <details className="side-details token-designer-details">
       <summary>Condition & buff library</summary>
       <StatusCatalogEditor catalog={statusCatalog} onSave={onSaveStatusCatalog}/>
      </details>
      <details className="side-details token-designer-details">
       <summary>Token Display Designer</summary>
       <TokenDisplayDesigner campaign={{id:activeCampaignId,token_display_config:campaignTokenDisplay}}
        template={template} onSave={onSaveTokenDisplay}/>
      </details>
     </div>
    </details>
    <details className="side-details">
     <summary>Distribute inventory items</summary>
     <DmItemDistribution db={db} characters={characters} template={template}
      onDistributed={onDistributedItem}/>
    </details>
    <details className="side-details">
     <summary>Character sheet template</summary>
     <div className="side-form">
      <p className="muted small">Define the fields that every player and NPC in this campaign uses.</p>
      <button type="button" className="secondary" onClick={()=>onNavigate('designer')}>Open sheet designer</button>
     </div>
    </details>
    <details className="side-details">
     <summary>Invites & campaign sharing</summary>
     <div className="side-form">
      <p className="muted small">{campaignName}</p>
      <button type="button" className="secondary" onClick={onCopyInvite}>Copy invite link</button>
     </div>
    </details>
   </div>
  </div>}
 </aside>;
}