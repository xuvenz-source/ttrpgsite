import React,{useMemo,useState} from 'react';
import Artwork from './Artwork.jsx';
import Bestiary from './Bestiary.jsx';

const when=date=>new Date(date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const tabs=[
 {id:'chat',label:'Chat',icon:'💬'},
 {id:'units',label:'Units',icon:'♟'},
 {id:'bestiary',label:'Bestiary',icon:'🐉'},
 {id:'settings',label:'Settings',icon:'⚙'},
 {id:'campaigns',label:'Campaigns',icon:'🗂'}
];

function UnitRow({db,token,selected,isDM,onSelect,onOpen}){
 return <div className={'unit-row'+(selected?' unit-row-selected':'')}>
  <button className="unit-focus" type="button" onClick={()=>onSelect(token.id)} title={'Select '+token.name+' on map'}>
   <Artwork db={db} path={token.image_path} alt={token.name} className="unit-thumb"/>
   <span className="unit-name">{token.name}</span>
   <span className="unit-size muted tiny">{Number(token.span_x??1)}×{Number(token.span_y??1)}</span>
  </button>
  {isDM&&<button type="button" className="secondary unit-edit" onClick={()=>onOpen(token)} title={'Open '+token.name+' sheet'}>Sheet</button>}
 </div>;
}
function UnitGroups({db,tokens,characters,members,user,isDM,selectedToken,onSelect,onOpen,onResize,onNavigate,onCreatePortrait,onOpenPlayerCharacter,onAddToken,newToken,onChangeTokenName,tokenOwner,onChangeTokenOwner,activeMap}){
 const [collapsed,setCollapsed]=useState({});
 const groups=useMemo(()=>{
  const sorted=members.map((m,index)=>{
   const character=characters.find(ch=>ch.user_id===m.user_id);
   const units=tokens.filter(t=>t.owner_id===m.user_id);
   return{id:m.user_id,label:character?.name||((m.role==='dm'?'Game Master':'Player')+' '+(index+1)),
    role:m.role,units};
  }).filter(g=>isDM||g.id===user);
  const other=tokens.filter(t=>!t.owner_id||!members.some(m=>m.user_id===t.owner_id));
  if(isDM)sorted.push({id:'dm-npcs',label:'Unassigned / DM NPCs',units:other,role:'dm'});
  return sorted;
 },[members,characters,tokens,isDM,user]);
 return <div className="right-section">
  <div className="side-heading"><h2>Controlled units</h2><span className="muted tiny">{isDM?'All campaign controllers':'Your tokens'}</span></div>
  <p className="muted small side-description">Select a unit to highlight it on the map. {isDM?'Open any unit sheet here or Alt + double-click its token.':'Open your character sheet below, or select one of your tokens.'}</p>
  <div className="unit-actions">
   <button type="button" className="secondary" onClick={()=>onNavigate('sheet')}>My character sheet</button>
   <button type="button" className="secondary" onClick={onCreatePortrait}>Create / edit token art</button>
  </div>
  {isDM&&characters.length>0&&<label>Open player character sheet
   <select defaultValue="" onChange={e=>{if(e.target.value){onOpenPlayerCharacter(e.target.value);e.target.value=''}}}>
    <option value="">Choose a player character…</option>
    {characters.map(ch=><option key={ch.id} value={ch.id}>{ch.name||'Unnamed character'}</option>)}
   </select>
  </label>}
  <div className="unit-groups">{groups.map(g=><section key={g.id} className="unit-group">
   <button type="button" className="unit-group-head" onClick={()=>setCollapsed(s=>({...s,[g.id]:!s[g.id]}))} aria-expanded={!collapsed[g.id]}>
    <span>{collapsed[g.id]?'▸':'▾'} {g.label}</span><span className="unit-count">{g.units.length}</span>
   </button>
   {!collapsed[g.id]&&<div className="unit-group-items">{g.units.length?
    g.units.map(t=><UnitRow key={t.id} db={db} token={t} selected={selectedToken?.id===t.id}
      isDM={isDM} onSelect={onSelect} onOpen={onOpen}/>)
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
   <button type="button" onClick={()=>onOpen(selectedToken)}>Open sheet</button>
   <p className="muted tiny">You can also resize by dragging a selected token's bottom-right corner, or remove it with Delete.</p>
  </div>}
 </div>;
}

export default function TabletopSidebar({
 db,panel,onPanelChange,isDM,user,
 messages,characters,members,tokens,selectedToken,onSelectToken,onOpenToken,onResizeToken,
 chat,onChatChange,onSendChat,
 npcs,npcFolders,onNewNpcFolder,onNewNpc,onEditNpc,onMoveNpc,onPlaceNpc,
 activeMap,maps,selectedMap,onSelectMap,publishedMapId,onPublishMap,onOpenMapLibrary,
 newToken,onChangeTokenName,tokenOwner,onChangeTokenOwner,onAddToken,
 mapZoom,onChangeZoom,onCopyInvite,onNavigate,onCreatePortrait,onOpenPlayerCharacter,currentPage,
 campaignName,activeCampaignId,campaignList,onSelectCampaign,
 createCampaignName,onCreateCampaignNameChange,onCreateCampaign,
 inviteCode,onInviteCodeChange,onJoinCampaign,accountEmail,onSignOut,hasCampaign
}){
 const validPanel=!hasCampaign?'campaigns':(!isDM&&panel==='bestiary'?'units':panel);
 return <aside className="right-sidebar panel" aria-label="Tabletop sidebar">
  <nav className="right-tabs" role="tablist" aria-label="Tabletop tools">
   {tabs.filter(t=>(hasCampaign||t.id==='campaigns')&&(isDM||t.id!=='bestiary')).map(t=><button key={t.id} type="button" role="tab"
     aria-selected={validPanel===t.id} className={validPanel===t.id?'selected':''}
     onClick={()=>onPanelChange(t.id)} title={t.label}>
    <span aria-hidden="true" className="tab-glyph">{t.icon}</span><span>{t.label}</span>
   </button>)}
  </nav>
  {validPanel==='campaigns'&&<div className="right-body campaigns-panel">
   <div className="side-heading"><h2>Campaigns & pages</h2></div>
   <p className="muted small side-description">Switch campaigns, create a new game, or join one using an invite code.</p>
   <div className="campaign-switcher">
    {campaignList.length===0&&<p className="muted small">You haven't joined any campaigns yet. Create one or enter an invite code below.</p>}
    {campaignList.map(c=><button type="button" key={c.id}
     className={'campaign-switch '+(activeCampaignId===c.id?'selected':'')}
     onClick={()=>onSelectCampaign(c.id)}>
     <span className="campaign-switch-title">{c.name}</span>
     {activeCampaignId===c.id&&<span className="muted tiny">Current campaign</span>}
    </button>)}
   </div>
   {hasCampaign&&isDM&&<button type="button" className="secondary full-button" onClick={onCopyInvite}>Copy current campaign invite link</button>}
   <div className="side-divider"/>
   <details className="campaign-action-details">
    <summary>Create campaign</summary>
    <form onSubmit={onCreateCampaign} className="side-form campaign-action-form">
     <label>Campaign name<input maxLength={100} required value={createCampaignName}
      placeholder="New campaign name" onChange={e=>onCreateCampaignNameChange(e.target.value)}/></label>
     <button type="submit">Create campaign</button>
    </form>
   </details>
   <details className="campaign-action-details" open={!hasCampaign&&campaignList.length===0?true:undefined}>
    <summary>Join campaign with invite code</summary>
    <form onSubmit={onJoinCampaign} className="side-form campaign-action-form">
     <label>Invite code<input required value={inviteCode} placeholder="Paste campaign invite code"
      onChange={e=>onInviteCodeChange(e.target.value)}/></label>
     <button type="submit">Join campaign</button>
    </form>
   </details>
   <div className="side-divider"/>
   <p className="muted tiny account-email">{accountEmail}</p>
   <button type="button" className="secondary full-button" onClick={onSignOut}>Sign out</button>
  </div>}
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
   onSelect={onSelectToken} onOpen={onOpenToken} onResize={onResizeToken} onNavigate={onNavigate}
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
   <div className="side-heading"><h2>Tabletop settings</h2></div>
   <div className="side-form">
    {currentPage!=='tabletop'&&<button type="button" className="secondary" onClick={()=>onNavigate('tabletop')}>Return to tabletop</button>}
    {isDM&&<label>Current map<select value={selectedMap||''} onChange={e=>onSelectMap(e.target.value)}>
     {!maps.length&&<option value="">No maps uploaded</option>}
     {maps.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
    </select></label>}
    <label>Battlemap zoom<select value={mapZoom} onChange={e=>onChangeZoom(Number(e.target.value))}>
     <option value=".25">25%</option><option value=".35">35%</option><option value=".5">50%</option>
     <option value=".7">70%</option><option value="1">100%</option><option value="1.5">150%</option>
     <option value="2">200%</option><option value="3">300%</option>
    </select></label>
    <p className="muted tiny">Ctrl + mouse wheel over the map also changes zoom.</p>
    {isDM&&<>
     <div className="side-divider"/>
     <h3>Map management</h3>
     <p className="muted small">{activeMap?.id===publishedMapId?'● Current map is live to players':'This map is not yet published to players.'}</p>
     <button disabled={!activeMap||activeMap.id===publishedMapId} onClick={()=>onPublishMap(selectedMap)}>Publish selected map to players</button>
     <button className="secondary" onClick={onOpenMapLibrary}>Open map library</button>
     <div className="side-divider"/>
     <h3>Sheet configuration</h3>
     <button className="secondary" onClick={()=>onNavigate('designer')}>Open sheet designer</button>
    </>}
   </div>
  </div>}
 </aside>;
}