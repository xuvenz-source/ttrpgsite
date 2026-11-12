/**
 * B10-R18-24 — opt-in local report copy controls, without DevTools.
 * No background jobs, RPCs, Realtime subscriptions or telemetry uploads.
 * Hidden unless the existing ?worldV2Trace=1 QA query switch is present.
 */
import React,{useState} from 'react';
import {worldV2Trace} from './WorldTrace.js';
import {
 WORLD_V2_QA_CASES,createWorldV2DiagnosticReport
} from './WorldTraceDiagnosticReport.js';

const buttonStyle={
 border:'1px solid #64748b',borderRadius:5,background:'#334155',
 color:'#fff',fontSize:12,padding:'6px 9px',cursor:'pointer'
};
const fieldStyle={
 width:'100%',boxSizing:'border-box',padding:'5px',
 borderRadius:4,background:'#f8fafc',color:'#0f172a'
};

export default function WorldTraceCapturePanel({isDM=false,dmPreview=false}){
 const [expanded,setExpanded]=useState(false);
 const [caseId,setCaseId]=useState('A03');
 const [playerRole,setPlayerRole]=useState('player-1');
 const [status,setStatus]=useState('');
 const [manualCopy,setManualCopy]=useState('');
 // This label is deliberately self-selected, NEVER a proof of account identity.
 const role=isDM?'dm':playerRole;
 if(!worldV2Trace.enabled)return null;
 function reset(){
  worldV2Trace.clear();
  setManualCopy('');
  setStatus('Capture reset. Perform your selected scenario, then copy the report.');
 }
 async function copyReport(){
  let output;
  try{
   const report=createWorldV2DiagnosticReport(worldV2Trace.snapshot(),{
    role,caseId,dmPreview:Boolean(dmPreview)
   });
   output=JSON.stringify(report,null,2);
  }catch{
   setStatus('Could not create a safe report. Reset and retry.');
   return;
  }
  try{
   if(typeof navigator==='undefined'||!navigator.clipboard?.writeText)
    throw Error('Clipboard unavailable');
   await navigator.clipboard.writeText(output);
   setManualCopy('');
   setStatus('Copied. Paste the report in the test discussion.');
  }catch{
   setManualCopy(output);
   setStatus('Clipboard permission blocked. Select the report text below and copy.');
  }
 }
 return <aside aria-label="World V2 QA capture" onKeyDown={e=>e.stopPropagation()}
  onPointerDownCapture={e=>e.stopPropagation()}
  style={{position:'fixed',right:12,bottom:12,zIndex:10020,
   maxWidth:'calc(100vw - 24px)',width:expanded?286:'auto',
   border:'1px solid #475569',borderRadius:8,
   background:'#0f172a',color:'#fff',boxShadow:'0 2px 12px #0008',
   padding:expanded?12:6,fontSize:12,lineHeight:1.4}}>
  {!expanded?<button type="button" style={buttonStyle}
   onClick={()=>setExpanded(true)}>QA capture</button>:<>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,
    alignItems:'center',marginBottom:8}}>
    <strong>World V2 test capture</strong>
    <button type="button" style={buttonStyle}
     onClick={()=>setExpanded(false)}>Hide</button>
   </div>
   <p style={{margin:'4px 0 10px',fontSize:11}}>
    Local movement/fog timings only. This does not prove player identity or fog security.
   </p>
   <label style={{display:'block',marginBottom:8}}>
    Test scenario
    <select aria-label="Test scenario" value={caseId}
     style={fieldStyle} onChange={e=>{
      setCaseId(e.target.value);reset();
     }}>
     {WORLD_V2_QA_CASES.map(([id,label])=>
      <option key={id} value={id}>{id} — {label}</option>)}
    </select>
   </label>
   {!isDM&&<label style={{display:'block',marginBottom:8}}>
    My test role (self-selected)
    <select aria-label="Test player role" value={playerRole}
     style={fieldStyle} onChange={e=>{
      setPlayerRole(e.target.value);reset();
     }}>
     <option value="player-1">Player 1</option>
     <option value="player-2">Player 2 (passive observer)</option>
    </select>
   </label>}
   <div style={{marginBottom:8}}>Current label: <strong>{
    isDM?(dmPreview?'DM preview (local)':'DM') :
    playerRole==='player-2'?'Player 2':'Player 1'
   }</strong></div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <button type="button" style={buttonStyle} onClick={reset}>
     Start / reset</button>
    <button type="button" style={buttonStyle} onClick={copyReport}>
     Copy safe report</button>
   </div>
   {status&&<p role="status" aria-live="polite"
    style={{margin:'8px 0 0'}}>{status}</p>}
   {manualCopy&&<textarea aria-label="Manually copy safe QA report"
    readOnly value={manualCopy} onFocus={e=>e.target.select()}
    style={{...fieldStyle,marginTop:8,height:98,fontFamily:'monospace',
     fontSize:10,resize:'vertical'}}/>}
  </>}
 </aside>;
}
