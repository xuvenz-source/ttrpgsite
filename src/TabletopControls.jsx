import React,{useEffect,useMemo,useRef,useState} from 'react';
import {normaliseHotbar} from './HotbarSlots.js';

export const ACTIONS=[
 {id:'up',name:'Move up',defaults:['ArrowUp','KeyW'],count:2},
 {id:'down',name:'Move down',defaults:['ArrowDown','KeyS'],count:2},
 {id:'left',name:'Move left',defaults:['ArrowLeft','KeyA'],count:2},
 {id:'right',name:'Move right',defaults:['ArrowRight','KeyD'],count:2},
 {id:'sheet',name:'Open character sheet',defaults:['KeyC'],count:1},
 {id:'hotbar',name:'Show / hide hotbar',defaults:['KeyH'],count:1},
 ...Array.from({length:8},(_,i)=>({id:'slot'+(i+1),name:'Hotbar slot '+(i+1),
  defaults:['Digit'+(i+1)],count:1}))
];
export const DEFAULT_BINDINGS=Object.fromEntries(ACTIONS.map(a=>[a.id,a.defaults]));
export {EMPTY_HOTBAR,normaliseHotbar,reorderHotbarSlots,removeHotbarSlot}
 from './HotbarSlots.js';

export function keyLabel(code){
 if(!code)return 'Not set';
 if(code.startsWith('Key'))return code.slice(3);
 if(code.startsWith('Digit'))return code.slice(5);
 if(code.startsWith('Arrow'))return '↑↓←→'['ArrowUp ArrowDown ArrowLeft ArrowRight'.split(' ').indexOf(code)]||code;
 if(code==='Space')return 'Space';
 if(code.startsWith('Numpad'))return 'Num '+code.slice(6);
 return code.replace('Bracket','[');
}
export function isInputFocused(target){
 if(!(target instanceof Element))return false;
 return !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="dialog"],[role="menu"]');
}
export function lookupAction(bindings,code){
 const entry=ACTIONS.find(action=>bindings[action.id]?.includes(code));
 return entry?.id||null;
}

export function KeybindingsEditor({bindings,onSave}){
 const[draft,setDraft]=useState(()=>normalizeBindings(bindings));
 const[capturing,setCapturing]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[done,setDone]=useState('');
 const buttonRef=useRef(null);
 useEffect(()=>{setDraft(normalizeBindings(bindings));setCapturing(null);setDone('')},[bindings]);
 const dirty=JSON.stringify(draft)!==JSON.stringify(normalizeBindings(bindings));
 function capture(e,action,index){
  e.preventDefault();e.stopPropagation();
  if(e.code==='Escape'){setCapturing(null);return}
  if(e.code==='Backspace'||e.code==='Delete'){
   setDraft(prev=>({...prev,[action]:prev[action].map((v,i)=>i===index?'':v)}));
   setCapturing(null);setError('');return;
  }
  if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||['Tab','Enter','F5','F11','F12'].includes(e.code)){
   setError('Use one ordinary key, without Ctrl/Alt/Shift. Press Backspace to clear.');return;
  }
  const code=e.code;
  if(!/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|F[1-9]|F10|Minus|Equal|Bracket(Left|Right)|Semicolon|Quote|Comma|Period|Slash|Backquote|Backslash|Numpad[0-9])$/.test(code)){
   setError('That key is not currently supported.');return;
  }
  const conflict=ACTIONS.find(a=>a.id!==action&&draft[a.id]?.includes(code));
  if(conflict){setError(keyLabel(code)+' is already assigned to '+conflict.name+'. Clear that binding first.');return}
  setDraft(prev=>({...prev,[action]:prev[action].map((v,i)=>i===index?code:v)}));
  setCapturing(null);setError('');setDone('');
 }
 async function save(){
  setError('');setSaving(true);setDone('');
  try{await onSave(draft);setDone('Shortcuts saved to your account.')}
  catch(e){setError(e?.message||String(e))}finally{setSaving(false)}
 }
 return <div className="keybind-editor">
  <p className="muted small">Select a token, then use the movement keys. Click a shortcut to rebind it. Changes follow your account across campaigns.</p>
  <p className="muted tiny">Press Escape to cancel or Backspace to clear. Shortcuts are ignored while typing or editing a sheet.</p>
  <div className="keybind-list">{ACTIONS.map(a=><div key={a.id} className="keybind-row">
   <span>{a.name}</span>
   <div className="keybind-keys">{draft[a.id].map((code,i)=>{
    const active=capturing?.action===a.id&&capturing.index===i;
    return <button type="button" key={i} className={'secondary keybind-capture'+(active?' capturing':'')}
     title={'Change '+a.name} onClick={()=>{setCapturing({action:a.id,index:i});setError('');setDone('')}}
     onKeyDown={e=>{if(active)capture(e,a.id,i)}}
     onBlur={()=>{if(active)setCapturing(null)}}>
     {active?'Press key…':keyLabel(code)}
    </button>;
   })}</div>
  </div>)}</div>
  {error&&<p className="error small">{error}</p>}{done&&<p className="good small">{done}</p>}
  <div className="keybind-actions">
   <button type="button" className="secondary" onClick={()=>{setDraft(normalizeBindings(DEFAULT_BINDINGS));setCapturing(null);setError('');setDone('')}}>Reset defaults</button>
   <button type="button" disabled={!dirty||saving||!!capturing} onClick={save}>{saving?'Saving…':'Save keybindings'}</button>
  </div>
 </div>;
}

export function HotbarSettings({slots,onSave,visible,onChangeVisible}){
 const[draft,setDraft]=useState(()=>normaliseHotbar(slots));
 const[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setDraft(normaliseHotbar(slots));setNotice('')},[slots]);
 const dirty=JSON.stringify(draft)!==JSON.stringify(normaliseHotbar(slots));
 const valid=draft.every(s=>s.label.length<=40&&s.command.length<=300&&
  (!s.command||/^(\/roll\s+\S[\s\S]*|\/r\s+\S[\s\S]*|\/macro\s+\S[\s\S]*|\/em\s+\S[\s\S]*|\/say\s+\S[\s\S]*)$/i.test(s.command)||
   /^\/spell\s+(character|npc_token|npc_template)\s+[0-9a-f-]{36}\s+[a-zA-Z0-9_-]{1,100}\s+[a-zA-Z0-9-]{1,100}$/i.test(s.command)||
   /^\/builder\s+[0-9a-f-]{36}$/i.test(s.command)));
 const edit=(i,key,value)=>setDraft(old=>old.map((row,index)=>i===index?{...row,[key]:value}:row));
 async function save(){
  setError('');setNotice('');setSaving(true);
  try{await onSave(draft);setNotice('Hotbar saved for this campaign.')}
  catch(e){setError(e?.message||String(e))}finally{setSaving(false)}
 }
 return <div className="hotbar-editor">
  <label className="hotbar-visibility"><input type="checkbox" checked={visible} onChange={e=>onChangeVisible(e.target.checked)}/>
   Show hotbar over the bottom of the map
  </label>
  <p className="muted tiny">Eight slots, personal to you and this campaign. Assign dice expressions or existing sheet roll macros. Press the slot's bound key or click it.</p>
  <p className="muted tiny">Commands: <code>/roll 1d20+5</code>, <code>/macro Attack</code>, <code>/em draws a sword</code>, <code>/say Ready!</code>, a spell dragged from your sheet, or a macro built in Macro Builder.</p>
  <div className="hotbar-slot-editor">{draft.map((slot,i)=><div className="hotbar-slot-row" key={i}>
   <span className="hotbar-index">{i+1}</span>
   <input aria-label={'Hotbar '+(i+1)+' label'} maxLength={40} placeholder="Label" value={slot.label}
    onChange={e=>edit(i,'label',e.target.value)}/>
   <input aria-label={'Hotbar '+(i+1)+' command'} maxLength={300} placeholder="/roll 1d20+5"
    value={slot.command} onChange={e=>edit(i,'command',e.target.value)}/>
  </div>)}</div>
  {!valid&&<p className="error small">Use /roll, /r, /macro, /em, /say a spell assigned from the sheet, or /builder followed by a macro ID.</p>}
  {error&&<p className="error small">{error}</p>}{notice&&<p className="good small">{notice}</p>}
  <div className="keybind-actions">
   <button type="button" className="secondary" disabled={!dirty||saving} onClick={()=>setDraft(normaliseHotbar(slots))}>Discard</button>
   <button type="button" disabled={!dirty||!valid||saving} onClick={save}>{saving?'Saving…':'Save hotbar'}</button>
  </div>
 </div>;
}

export function MacroHotbar({
 slots,bindings,onExecute,onConfigure,onAssignSpell,onAssignMacro,
 onReorderSlot,onRemoveSlot
}){
 const items=normaliseHotbar(slots);
 const [dragOver,setDragOver]=useState(-1);
 const [dragging,setDragging]=useState(-1);
 const hotbarRef=useRef(null),sourceRef=useRef(null),removeRef=useRef(onRemoveSlot);
 removeRef.current=onRemoveSlot;
 // Native drop events never fire on non-droppable map/background elements.
 // Make the rest of the document a drop destination ONLY while a hotbar item
 // is being dragged. This also distinguishes a deliberate drop from Escape.
 useEffect(()=>{
  const withinBar=e=>{
   const rect=hotbarRef.current?.getBoundingClientRect();
   return !!rect&&e.clientX>=rect.left&&e.clientX<=rect.right&&
    e.clientY>=rect.top&&e.clientY<=rect.bottom;
  };
  const allowOutside=e=>{
   if(sourceRef.current===null)return;
   // Even padding/gaps inside the toolbar must not delete an item.
   if(e.target instanceof Element&&
    e.target.closest('.macro-hotbar'))return;
   e.preventDefault();
   e.dataTransfer.dropEffect='move';
  };
  const dropOutside=e=>{
   if(sourceRef.current===null)return;
   if(withinBar(e))return;
   e.preventDefault();e.stopPropagation();
   const source=sourceRef.current;
   sourceRef.current=null;
   setDragging(-1);setDragOver(-1);
   void Promise.resolve(removeRef.current?.(source)).catch(()=>{});
  };
  document.addEventListener('dragover',allowOutside,true);
  document.addEventListener('drop',dropOutside,true);
  return()=>{
   document.removeEventListener('dragover',allowOutside,true);
   document.removeEventListener('drop',dropOutside,true);
  };
 },[]);
 return <div ref={hotbarRef} className={'macro-hotbar'+
  (dragging>=0?' hotbar-drag-active':'')} role="toolbar" aria-label="Macro hotbar">
  {dragging>=0&&<div className="macro-hotbar-drag-hint" aria-live="polite">
   Drop outside the hotbar to remove
  </div>}
  {items.map((slot,i)=><button type="button" key={i}
   draggable={!!slot.command}
   className={'macro-hotbar-slot'+(slot.command?' filled':'')+
    (dragOver===i?(dragging>=0?' hotbar-reorder-target':' spell-drop-target'):'')+
    (dragging===i?' hotbar-drag-source':'')}
   onClick={()=>slot.command?onExecute(i):onConfigure()}
   onDragStart={e=>{
    if(!slot.command){e.preventDefault();return}
    sourceRef.current=i;
    setDragging(i);
    e.dataTransfer.setData('application/x-forge-hotbar-slot',String(i));
    e.dataTransfer.effectAllowed='move';
   }}
   onDragEnd={()=>{
    sourceRef.current=null;
    setDragging(-1);setDragOver(-1);
   }}
   onDragOver={e=>{
    const types=Array.from(e.dataTransfer.types);
    if(types.includes('application/x-forge-hotbar-slot')){
     e.preventDefault();e.dataTransfer.dropEffect='move';setDragOver(i);return;
    }
    if(!(onAssignSpell&&types.includes('application/x-forge-spell'))&&
       !(onAssignMacro&&types.includes('application/x-forge-macro')))return;
    e.preventDefault();e.dataTransfer.dropEffect='copy';setDragOver(i);
   }}
   onDragLeave={()=>setDragOver(-1)}
   onDrop={e=>{
    const source=e.dataTransfer.getData('application/x-forge-hotbar-slot');
    if(source!==''){
     e.preventDefault();e.stopPropagation();setDragOver(-1);
     sourceRef.current=null;
     const from=Number(source);
     if(Number.isInteger(from)&&from>=0&&from<8&&from!==i)
      void Promise.resolve(onReorderSlot?.(from,i)).catch(()=>{});
     return;
    }
    const spell=e.dataTransfer.getData('application/x-forge-spell');
    const macro=e.dataTransfer.getData('application/x-forge-macro');
    setDragOver(-1);
    if(!spell&&!macro)return;
    e.preventDefault();e.stopPropagation();
    try{
     if(macro&&onAssignMacro)onAssignMacro(i,JSON.parse(macro));
     else if(spell&&onAssignSpell)onAssignSpell(i,JSON.parse(spell));
    }catch{}
   }}
   title={slot.command?slot.label+': '+slot.command+
    ' (drag to another slot to reorder, or outside the bar to remove)':
    'Drag a spell or macro here, or configure slot '+(i+1)}>
   <span className="hotbar-key">{keyLabel(bindings['slot'+(i+1)]?.[0]||'')}</span>
   <span className="hotbar-slot-label">{slot.label|| (slot.command?'Macro':'Empty')}</span>
  </button>)}
 </div>;
}
