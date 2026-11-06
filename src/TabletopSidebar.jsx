import React,{useMemo,useState} from 'react';
import Artwork from './Artwork.jsx';
import MapCalibration from './MapCalibration.jsx';
import TokenDisplayDesigner from './TokenDisplayDesigner.jsx';
import {StatusCatalogEditor,TokenStatusBadges,normalizedEffects} from './TokenStatuses.jsx';
import {KeybindingsEditor,HotbarSettings} from './TabletopControls.jsx';
import {QuickFieldsSettings} from './TokenQuickEdit.jsx';
import Bestiary from './Bestiary.jsx';

const when=date=>new Date(date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
function BearFaceIcon(){
 return <svg className="bestiary-bear-icon" width="20" height="20" viewBox="0 0 24 24"
  xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bear face"
  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none">
  <circle cx="5.7" cy="6.3" r="3.1"/>
  <circle cx="18.3" cy="6.3" r="3.1"/>
  <path d="M5.3 8.4C6.3 5.2 9 4.1 12 4.1s5.7 1.1 6.7 4.3c1.4 2.2 1.8 5.1.9 7.4-.8 2.8-3.3 4.7-7.6 4.7s-6.8-1.9-7.6-4.7c-.9-2.3-.5-5.2.9-7.4Z"/>
  <circle cx="8.9" cy="11.2" r=".95" fill="currentColor" stroke="none"/>
  <circle cx="15.1" cy="11.2" r=".95" fill="currentColor" stroke="none"/>
  <ellipse cx="12" cy="15.2" rx="3.2" ry="2.4" strokeWidth="1.2"/>
  <path d="m10.65 14.2 1.35 1 1.35-1Z" fill="currentColor" strokeWidth=".7"/>
  <path d="M12 15.3v1.2m0 0-1.2.6m1.2-.6 1.2.6" strokeWidth="1.2"/>
 </svg>;
}
const tabs=[
 {id:'chat',label:'Chat',icon:'💬'},
 {id:'units',label:'Units',icon:'♟'},
 {id:'bestiary',label:'Bestiary',icon:'bear'},
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
function UnitGroups({db,tokens,characters,members,user,isDM,selectedToken,onSelect,onOpen,onStatus,statusCatalog,onResize,onNavigate,onCreatePortrait,onOpenPlayerCharacter,onAddToken,newToken,onChangeTokenName,tokenOwner,onChangeTokenOwner,activeMap}){
 const [collapsed,setCollapsed]=useState({});
 const groups=useMemo(()=>{
  const sorted=members.map((m,index)=>{
   const character=characters.find(ch=>ch.user_id===m.user_id);
   const units=tokens.filter(t=>t.owner_id===m.user_id);
   return{id:m.user_id,label:character?.name||((m.role==='dm'?'Game Master':'Player')+' '+(index+1)),
    character,role:m.role,units};
  }).filter(g=>isDM||g.id===user);
  const other=tokens.filter(t=>!t.owner_id||!members.some(m=>m.user_id===t.owner_id));
  if(isDM)sorted.push({id:'dm-npcs',label:'Unassigned / DM NPCs',units:other,role:'dm'});
  return sorted;
 },[members,characters,tokens,isDM,user]);
 return <div className="right-section">
  <div className="side-heading"><h2>Controlled units</h2><span className="muted tiny">{isDM?'All campaign controllers':'Your tokens'}</span></div>
  <p className="muted small side-description">Drag a character name onto the map to place it, or drag an existing unit to move it. Ctrl + click for resources, or Shift + click for status effects. {isDM?'Alt + double-click to edit the full sheet.':''}</p>
  <div className="unit-actions">
   <button type="button" className="secondary" onClick={()=>onNavigate('sheet')}>My character sheet</button>
   <button type="button" className="secondary" onClick={onCreatePortrait}>My Token Library</button>
  </div>
  {isDM&&characters.length>0&&<label>Open player character sheet
   <select defaultValue="" onChange={e=>{if(e.target.value){onOpenPlayerCharacter(e.target.value);e.target.value=''}}}>
    <option value="">Choose a player character…</option>
    {characters.map(ch=><option key={ch.id} value={ch.id}>{ch.name||'Unnamed character'}</option>)}
   </select>
  </label>}
  <div className="unit-groups">{groups.map(g=><section key={g.id} className="unit-group">
   <button type="button" className={'unit-group-head'+(g.character&&activeMap&&(isDM||g.id===user)?' unit-draggable':'')}
    draggable={!!(g.character&&activeMap&&(isDM||g.id===user))}
    onDragStart={e=>{
      if(!g.character||!activeMap||(g.id!==user&&!isDM)){e.preventDefault();return}
      e.dataTransfer.setData('application/x-forge-character',g.character.id);
      e.dataTransfer.effectAllowed='copy';
    }}
    title={g.character&&activeMap?'Drag '+g.label+' onto the battlemap to place a character token':'Expand or collapse this group'}
    onClick={()=>setCollapsed(s=>({...s,[g.id]:!s[g.id]}))}
    aria-expanded={!collapsed[g.id]}>
    <span className="unit-group-label">{g.character&&<Artwork db={db} path={g.character.token_path||g.character.portrait_path} alt={g.label} className="group-unit-thumb"/>}
      <span>{collapsed[g.id]?'▸':'▾'} {g.label}</span>
    </span><span className="unit-count">{g.units.length}</span>
   </button>
   {!collapsed[g.id]&&<div className="unit-group-items">{g.units.length?
    g.units.map(t=><UnitRow key={t.id} db={db} token={t} selected={selectedToken?.id===t.id}
      isDM={isDM} onSelect={onSelect} onOpen={onOpen}
      onStatus={onStatus} statusCatalog={statusCatalog}
      canDrag={!!activeMap&&(isDM||t.owner_id===user)}/>)
    :<p className="muted tiny empty-units">No tokens on this map</p>}
   </div>}
  </section>)}</div>
  {!groups.length&&<p className="muted small">No controlled units available.</p>}
  {isDM&&<details className="side-details">
   <summary>Place a new token</summary>
   <div className="side-form">
    <label>Token name<input value={newToken} onChange={e=>onChangeTokenName(e.target.value)} maxLength={80} placeholder="Token name"/></label>
    <label>Controlled by<select value={tokenOwner} onChange={e=>onChangeTokenOwner(e.target.value)}>
      <option value="">Game Master (NPC)</option>
      {members.map((m,i)=><option key={m.user_id} value={m.user_id}>
       {characters.find(c=>c.user_id===m.user_id)?.name||('Player '+(i+1))}
      </option>)}
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
 messages,characters,members,tokens,selectedToken,onSelectToken,onOpenToken,onResizeToken,onOpenStatus,
 chat,onChatChange,onSendChat,
 npcs,npcFolders,onNewNpcFolder,onNewNpc,onEditNpc,onMoveNpc,onPlaceNpc,
 activeMap,maps,selectedMap,onSelectMap,publishedMapId,onPublishMap,onOpenMapLibrary,
 newToken,onChangeTokenName,tokenOwner,onChangeTokenOwner,onAddToken,
 mapZoom,onChangeZoom,onMapCalibrationPreview,onSaveMapCalibration,onSaveTokenDisplay,
 statusCatalog,onSaveStatusCatalog,template,quickFields,onSaveQuickFields,onCopyInvite,onNavigate,onCreatePortrait,onOpenPlayerCharacter,currentPage,
 bindings,onSaveBindings,hotbarSlots,onSaveHotbar,hotbarVisible,onChangeHotbarVisible,
 uiScale,onChangeUiScale,
 campaignName,campaignTokenDisplay,activeCampaignId,onReturnToMenu,hasCampaign
}){
 const validPanel=(!isDM&&(panel==='bestiary'||panel==='dm'))?'units':panel;
 return <aside className="right-sidebar panel" aria-label="Tabletop sidebar">
  <nav className="right-tabs" role="tablist" aria-label="Tabletop tools">
   {tabs.filter(t=>isDM||!['bestiary','dm'].includes(t.id)).map(t=><button key={t.id} type="button" role="tab"
     aria-selected={validPanel===t.id} className={validPanel===t.id?'selected':''}
     onClick={()=>onPanelChange(t.id)} title={t.label}>
    <span aria-hidden="true" className="tab-glyph">{t.icon==='bear'?<BearFaceIcon/>:t.icon}</span><span>{t.label}</span>
   </button>)}
  </nav>
  {validPanel==='chat'&&<>
   <div className="right-panel-heading"><h2>Campaign chat & rolls</h2></div>
   <div className="messages right-messages">{messages.map(m=><div className="msg" key={m.id}>
    <div className="muted tiny">{m.user_id===user?'You':characters.find(c=>c.user_id===m.user_id)?.name||'Party member'} · {when(m.created_at)}</div>
    {m.kind==='roll'?<div className="dice"><b>🎲 {m.body}</b><h2>{m.result?.total}</h2><small>{m.result?.expression} · [{(m.result?.dice||[]).join(', ')}] {m.result?.modifier?' + '+m.result.modifier:''}</small></div>:<p>{m.body}</p>}
   </div>)}</div>
   <form onSubmit={onSendChat} className="chatbox"><input aria-label="Message or dice command" value={chat}
     onChange={e=>onChatChange(e.target.value)} placeholder="Message or /roll 1d20"/>
    <button type="submit">Send</button>
   </form><p className="muted tiny right-chat-help">/roll 2d6+3 · /roll 2d20kh1 · /macro Attack</p>
  </>}
  {validPanel==='units'&&<div className="right-body"><UnitGroups db={db} tokens={tokens} characters={characters}
   members={members} user={user} isDM={isDM} selectedToken={selectedToken}
   onSelect={onSelectToken} onOpen={onOpenToken}
   onStatus={onOpenStatus} statusCatalog={statusCatalog}
   onResize={onResizeToken} onNavigate={onNavigate}
   onCreatePortrait={onCreatePortrait} onOpenPlayerCharacter={onOpenPlayerCharacter}
   onAddToken={onAddToken} newToken={newToken} onChangeTokenName={onChangeTokenName}
   tokenOwner={tokenOwner} onChangeTokenOwner={onChangeTokenOwner} activeMap={activeMap}/></div>}
  {validPanel==='bestiary'&&isDM&&<div className="right-body">
   <div className="side-heading"><h2>Bestiary & tokens</h2></div>
   <p className="muted small side-description">Create and organise reusable NPCs, then drag them onto the current map.</p>
   <Bestiary db={db} compact npcs={npcs} folders={npcFolders}
    onNewFolder={onNewNpcFolder} onNewNpc={onNewNpc} onEdit={onEditNpc}
    onMove={onMoveNpc} onPlace={onPlaceNpc} mapReady={!!activeMap}/>
  </div>}
  {validPanel==='settings'&&<div className="right-body">
   <div className="side-heading"><h2>Personal settings</h2></div>
   <div className="side-form">
    <button type="button" className="secondary full-button" onClick={onReturnToMenu}>← Back to main menu</button>
    {currentPage!=='tabletop'&&<button type="button" className="secondary full-button" onClick={()=>onNavigate('tabletop')}>Return to tabletop</button>}
    <details className="side-details">
     <summary>View & zoom</summary>
     <div className="side-form">
      <label>Battlemap zoom<select value={mapZoom} onChange={e=>onChangeZoom(Number(e.target.value))}>
       <option value=".25">25%</option><option value=".35">35%</option><option value=".5">50%</option>
       <option value=".7">70%</option><option value="1">100%</option><option value="1.5">150%</option>
       <option value="2">200%</option><option value="3">300%</option>
      </select></label>
      <p className="muted tiny">Ctrl + mouse wheel over the map changes your view zoom only.</p>
     </div>
    </details>
    <details className="side-details">
     <summary>Interface size</summary>
     <div className="side-form">
      <label>UI scale
       <select value={uiScale} onChange={e=>onChangeUiScale(Number(e.target.value))}>
        <option value={0.8}>80% — Compact</option>
        <option value={0.9}>90% — Default</option>
        <option value={1}>100% — Standard</option>
        <option value={1.1}>110% — Large</option>
        <option value={1.25}>125% — Extra large</option>
       </select>
      </label>
      <p className="muted tiny">Changes menus and window text, not battlemap grid or token size. Saved to your account.</p>
     </div>
    </details>
    <details className="side-details shortcut-settings">
     <summary>Keyboard shortcuts</summary>
     <KeybindingsEditor bindings={bindings} onSave={onSaveBindings}/>
    </details>
    <details className="side-details shortcut-settings">
     <summary>Macro hotbar</summary>
     <HotbarSettings slots={hotbarSlots} onSave={onSaveHotbar} visible={hotbarVisible}
       onChangeVisible={onChangeHotbarVisible}/>
    </details>
   </div>
  </div>}
  {validPanel==='dm'&&isDM&&<div className="right-body">
   <div className="side-heading"><h2>Dungeon Master tools</h2></div>
   <p className="muted small side-description">Campaign-wide management. Sections are closed until you need them.</p>
   <div className="side-form">
    <details className="side-details">
     <summary>Map management</summary>
     <div className="side-form">
      <label>Current map<select value={selectedMap||''} onChange={e=>onSelectMap(e.target.value)}>
       {!maps.length&&<option value="">No maps uploaded</option>}
       {maps.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
      </select></label>
      <p className="muted small">{activeMap?.id===publishedMapId?'● Current map is live to players':'This map is not yet published to players.'}</p>
      <button type="button" disabled={!activeMap||activeMap.id===publishedMapId}
       onClick={()=>onPublishMap(selectedMap)}>Publish selected map to players</button>
      <button type="button" className="secondary" onClick={onOpenMapLibrary}>Open map library</button>
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