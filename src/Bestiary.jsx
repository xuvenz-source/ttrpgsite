import React,{useMemo,useState} from 'react';
import Artwork from './Artwork.jsx';

export default function Bestiary({db,npcs=[],folders=[],compact=false,onNewFolder,onNewNpc,onEdit,onMove,onPlace,mapReady}){
 const[folder,setFolder]=useState(''),[search,setSearch]=useState('');
 const tree=useMemo(()=>{
  const output=[],seen=new Set();
  function walk(parent,depth){
   for(const f of folders.filter(x=>(x.parent_id||'')===parent)){
    if(seen.has(f.id)||depth>9)continue;seen.add(f.id);
    output.push({...f,depth});walk(f.id,depth+1);
   }
  }
  walk('',0);return output;
 },[folders]);
 const shown=npcs.filter(n=>n.name.toLowerCase().includes(search.toLowerCase()) && (search||!folder||(n.folder_id||'')===folder));
 function folderPrompt(){const name=prompt('Folder name');if(name?.trim())onNewFolder(name.trim(),folder||null)}
 function npcPrompt(){const name=prompt('Name for your new NPC');if(name?.trim())onNewNpc(name.trim(),folder||null)}
 return <div className={'bestiary '+(compact?'compact':'')}>
 <div className="heading"><h2>{compact?'Saved NPCs':'NPC Bestiary'}</h2>{!compact&&<button onClick={npcPrompt}>+ NPC</button>}</div>
 <div className="bestiary-toolbar"><input aria-label="Search NPCs" placeholder="Search NPCs…" value={search} onChange={e=>setSearch(e.target.value)}/>{compact&&<button className="secondary" title="Create NPC" onClick={npcPrompt}>+ NPC</button>}</div>
 <details className="npc-folders-toggle" open={!compact?true:undefined}>
  <summary>Folders {folder?'· '+(folders.find(f=>f.id===folder)?.name||'Selected'):''}</summary>
  <div className="npc-folderlist">
   <button className={'nav '+(!folder?'active':'')} onClick={()=>setFolder('')}>All NPCs</button>
   {tree.map(f=><button className={'nav '+(folder===f.id?'active':'')} key={f.id} style={{paddingLeft:10+Math.min(6,f.depth)*12}} onClick={()=>setFolder(f.id)}>📁 {f.name}</button>)}
   <button className="secondary" type="button" onClick={folderPrompt}>+ New folder</button>
  </div>
 </details>
 <p className="muted tiny">{compact?'Drag an NPC onto the map, or click Place.':'Organise NPCs in folders, edit their sheets, and drag them onto the tabletop.'}</p>
 <div className="bestiary-cards">{shown.map(n=><div key={n.id} className="npc-card" draggable onDragStart={e=>{e.dataTransfer.setData('application/x-forge-npc',n.id);e.dataTransfer.effectAllowed='copy'}} title="Drag to map to place NPC">
  <Artwork db={db} path={n.token_path||n.portrait_path} alt={n.name} className="npc-thumb"/>
  <div className="npc-card-body"><strong>{n.name}</strong><div className="npc-actions"><button className="secondary" onClick={()=>onEdit(n)}>Edit</button>{mapReady&&<button className="secondary" onClick={()=>onPlace(n.id)}>Place</button>}</div></div>
  {!compact&&<select aria-label={'Move '+n.name+' to folder'} value={n.folder_id||''} onChange={e=>onMove(n.id,e.target.value||null)}><option value="">Unfiled</option>{tree.map(f=><option key={f.id} value={f.id}>{'— '.repeat(f.depth)+f.name}</option>)}</select>}
 </div>)}
 {!shown.length&&<p className="muted small">{compact?'No NPCs saved yet.':'Nothing in this folder yet.'}</p>}
 </div>
 </div>;
}