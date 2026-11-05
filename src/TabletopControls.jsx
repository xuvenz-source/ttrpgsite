import React,{useEffect,useMemo,useRef,useState} from 'react';

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
export const EMPTY_HOTBAR=Array.from({length:8},()=>({label:'',command:''}));
export function normalizeBindings(data){
 const out={};
 for(const action of ACTIONS){
  const raw=data&&Array.isArray(data[action.id])?data[action.id]:action.defaults;
  out[action.id]=Array.from({length:action.count},(_,i)=>{
   const code=raw[i];
   return typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|F[1-9]|F1[0-2]|Minus|Equal|Bracket(Left|Right)|Semicolon|Quote|Comma|Period|Slash|Backquote|Backslash|Numpad[0-9])$/.test(code)
    ?code:'';
  });
 }
 return out;
}
export function normaliseHotbar(data){
 return Array.from({length:8},(_,i)=>{
  const slot=Array.isArray(data)?data[i]:null;
  return {
   label:typeof slot?.label==='string'?slot.label.slice(0,40):'',
   command:typeof slot?.command==='string'?slot.command.slice(0,300):''
  };
 });
}
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
  (!s.command||/^(\/roll\s+\S[\s\S]*|\/r\s+\S[\s\S]*|\/macro\s+\S[\s\S]*|\/em\s+\S[\s\S]*|\/say\s+\S[\s\S]*)$/i.test(s.command)));
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
  <p className="muted tiny">Commands: <code>/roll 1d20+5</code>, <code>/macro Attack</code>, <code>/em draws a sword</code>, or <code>/say Ready!</code>.</p>
  <div className="hotbar-slot-editor">{draft.map((slot,i)=><div className="hotbar-slot-row" key={i}>
   <span className="hotbar-index">{i+1}</span>
   <input aria-label={'Hotbar '+(i+1)+' label'} maxLength={40} placeholder="Label" value={slot.label}
    onChange={e=>edit(i,'label',e.target.value)}/>
   <input aria-label={'Hotbar '+(i+1)+' command'} maxLength={300} placeholder="/roll 1d20+5"
    value={slot.command} onChange={e=>edit(i,'command',e.target.value)}/>
  </div>)}</div>
  {!valid&&<p className="error small">Use /roll, /r, /macro, /em or /say commands in hotbar slots.</p>}
  {error&&<p className="error small">{error}</p>}{notice&&<p className="good small">{notice}</p>}
  <div className="keybind-actions">
   <button type="button" className="secondary" disabled={!dirty||saving} onClick={()=>setDraft(normaliseHotbar(slots))}>Discard</button>
   <button type="button" disabled={!dirty||!valid||saving} onClick={save}>{saving?'Saving…':'Save hotbar'}</button>
  </div>
 </div>;
}

export function MacroHotbar({slots,bindings,onExecute,onConfigure}){
 const items=normaliseHotbar(slots);
 return <div className="macro-hotbar" role="toolbar" aria-label="Macro hotbar">
  {items.map((slot,i)=><button type="button" key={i} className={'macro-hotbar-slot'+(slot.command?' filled':'')}
   onClick={()=>slot.command?onExecute(i):onConfigure()}
   title={slot.command?slot.command:'Configure hotbar slot '+(i+1)}>
   <span className="hotbar-key">{keyLabel(bindings['slot'+(i+1)]?.[0]||'')}</span>
   <span className="hotbar-slot-label">{slot.label|| (slot.command?'Macro':'Empty')}</span>
  </button>)}
 </div>;
}
