/**
 * B10-R18-59 — opt-in local QA export, including three-session R58 receipts.
 * No background jobs, authentication claims, RPCs, browser storage or uploads.
 * Hidden unless the existing ?worldV2Trace=1 QA switch is enabled.
 */
import React,{useState} from 'react';
import {worldV2Trace} from './WorldTrace.js';
import {
 WORLD_V2_QA_CASES,createWorldV2DiagnosticReport
} from './WorldTraceDiagnosticReport.js';
import {
 WORLD_V2_QA_REQUIRED_CHECKS,WORLD_V2_QA_CHECK_LABELS,
 emptyWorldV2QaChecks,createWorldV2AcceptanceReceipt
} from './WorldV2QaReceipt.js';

const buttonStyle={
 border:'1px solid #64748b',borderRadius:5,background:'#334155',
 color:'#fff',fontSize:12,padding:'6px 9px',cursor:'pointer'
};
const fieldStyle={
 width:'100%',boxSizing:'border-box',padding:'5px',
 borderRadius:4,background:'#f8fafc',color:'#0f172a'
};
const freshCaptureTag=()=>{
 if(typeof crypto==='undefined'||typeof crypto.getRandomValues!=='function')
  return '';
 const values=new Uint8Array(12);
 crypto.getRandomValues(values);
 return [...values].map(n=>n.toString(16).padStart(2,'0')).join('');
};
const packagedBuild=import.meta.env.VITE_WORLD_V2_QA_BUILD_SHA||'';

export default function WorldTraceCapturePanel({isDM=false,dmPreview=false}){
 const [expanded,setExpanded]=useState(false);
 const [caseId,setCaseId]=useState('A03');
 const [playerRole,setPlayerRole]=useState('player-1');
 const [captureFormat,setCaptureFormat]=useState('quick');
 const [status,setStatus]=useState('');
 const [manualCopy,setManualCopy]=useState('');
 const [runCode,setRunCode]=useState('');
 const [buildSha,setBuildSha]=useState(packagedBuild);
 const [captureTag,setCaptureTag]=useState(freshCaptureTag);
 const [independentSignIn,setIndependentSignIn]=useState(false);
 const [independentBrowser,setIndependentBrowser]=useState(false);
 const [qaChecks,setQaChecks]=useState(()=>
  emptyWorldV2QaChecks(isDM?'dm':'p1'));
 const role=isDM?'dm':playerRole;
 const acceptanceRole=role==='player-1'?'p1':role==='player-2'?'p2':'dm';
 if(!worldV2Trace.enabled)return null;

 function reset(nextRole=acceptanceRole){
  worldV2Trace.clear();
  setCaptureTag(freshCaptureTag());
  setQaChecks(emptyWorldV2QaChecks(nextRole));
  setIndependentSignIn(false);
  setIndependentBrowser(false);
  setManualCopy('');
  setStatus('Capture reset. Perform the selected scenario before copying.');
 }

 async function copyReport(){
  let output;
  try{
   const snapshot=worldV2Trace.snapshot();
   const report=captureFormat==='acceptance'?
    createWorldV2AcceptanceReceipt(snapshot,{
     role:acceptanceRole,dmPreview:Boolean(dmPreview),runCode,buildSha,
     captureTag,independentSignInDeclared:independentSignIn,
     independentBrowserDeclared:independentBrowser,checks:qaChecks
    }):createWorldV2DiagnosticReport(snapshot,{
     role,caseId,dmPreview:Boolean(dmPreview)
    });
   output=JSON.stringify(report,null,2);
  }catch{
   setStatus('Safe report unavailable. Check run code, deployed SHA, checklist and capture.');
   return;
  }
  try{
   if(typeof navigator==='undefined'||!navigator.clipboard?.writeText)
    throw Error('Clipboard unavailable');
   await navigator.clipboard.writeText(output);
   setManualCopy('');
   setStatus('Safe local QA report copied. Share through the authorized test channel.');
  }catch{
   setManualCopy(output);
   setStatus('Clipboard blocked. Select the sanitized report text below and copy.');
  }
 }
 const required=WORLD_V2_QA_REQUIRED_CHECKS[acceptanceRole];
 const observations=required.filter(key=>qaChecks[key]==='pass').length;
 return <aside aria-label="World V2 QA capture" onKeyDown={e=>e.stopPropagation()}
  onPointerDownCapture={e=>e.stopPropagation()}
  style={{position:'fixed',right:12,bottom:12,zIndex:10020,
   maxWidth:'calc(100vw - 24px)',width:expanded?338:'auto',
   maxHeight:'min(80vh,720px)',overflowY:expanded?'auto':'visible',
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
    Local movement/fog data only. This does not independently verify player
    sign-in, observer privacy or release readiness.
   </p>
   <label style={{display:'block',marginBottom:8}}>
    Report format
    <select aria-label="QA report format" value={captureFormat}
     style={fieldStyle} onChange={e=>{setCaptureFormat(e.target.value);reset();}}>
     <option value="quick">Quick scenario report</option>
     <option value="acceptance">R18-58 multiplayer acceptance</option>
    </select>
   </label>
   {captureFormat==='quick'&&<label style={{display:'block',marginBottom:8}}>
    Test scenario
    <select aria-label="Test scenario" value={caseId}
     style={fieldStyle} onChange={e=>{setCaseId(e.target.value);reset();}}>
     {WORLD_V2_QA_CASES.map(([id,label])=>
      <option key={id} value={id}>{id} — {label}</option>)}
    </select>
   </label>}
   {!isDM&&<label style={{display:'block',marginBottom:8}}>
    My test role (self-selected)
    <select aria-label="Test player role" value={playerRole}
     style={fieldStyle} onChange={e=>{
      const next=e.target.value;
      setPlayerRole(next);
      reset(next==='player-2'?'p2':'p1');
     }}>
     <option value="player-1">Player 1</option>
     <option value="player-2">Player 2 (passive observer)</option>
    </select>
   </label>}
   <div style={{marginBottom:8}}>Current label: <strong>{
    isDM?(dmPreview?'DM preview (local)':'DM') :
    playerRole==='player-2'?'Player 2':'Player 1'
   }</strong></div>

   {captureFormat==='acceptance'&&<>
    <p style={{fontSize:11,margin:'0 0 8px'}}>
     All three independently signed-in testers use the same run code and
     verified deployed build. This report is self-reported, never release approval.
    </p>
    <label style={{display:'block',marginBottom:8}}>
     Shared test run code
     <input aria-label="Shared QA run code" style={fieldStyle}
      maxLength={36} placeholder="R59-TEST-001"
      value={runCode} onChange={e=>setRunCode(e.target.value.toUpperCase())}/>
    </label>
    <label style={{display:'block',marginBottom:8}}>
     Verified deployed Git commit SHA
     <input aria-label="Verified deployed commit SHA" style={fieldStyle}
      maxLength={40} placeholder="40 hexadecimal characters"
      value={buildSha} onChange={e=>setBuildSha(e.target.value.toLowerCase())}/>
    </label>
    {!/^[a-f0-9]{40}$/.test(buildSha)&&<p style={{fontSize:11,margin:'0 0 8px'}}>
     Build SHA unavailable. Ask the DM for the exact deployed Git commit
     before exporting; do not enter an undeployed staging commit.
    </p>}
    {dmPreview&&<p role="alert" style={{fontSize:11,margin:'0 0 8px'}}>
     DM player preview is local and will not count as an independent player session.
    </p>}
    <label style={{display:'block',marginBottom:7}}>
     <input type="checkbox" checked={independentSignIn}
      onChange={e=>setIndependentSignIn(e.target.checked)}/>
     {' '}I am signed in using my own independent test account
    </label>
    <label style={{display:'block',marginBottom:8}}>
     <input type="checkbox" checked={independentBrowser}
      onChange={e=>setIndependentBrowser(e.target.checked)}/>
     {' '}This is my own browser session, not DM preview or a shared session
    </label>
    <strong>Actual observations ({observations}/{required.length} passed)</strong>
    <p style={{fontSize:11,margin:'3px 0 8px'}}>
     Select Pass only after observing it. Fail and Not run are important findings.
    </p>
    {required.map(key=><label key={key}
     style={{display:'block',marginBottom:8}}>
     {WORLD_V2_QA_CHECK_LABELS[key]}
     <select aria-label={'QA check '+key} style={fieldStyle}
      value={qaChecks[key]??'not_run'}
      onChange={e=>setQaChecks(old=>({...old,[key]:e.target.value}))}>
      <option value="not_run">Not run</option>
      <option value="pass">Pass — observed</option>
      <option value="fail">Fail — observed</option>
     </select>
    </label>)}
   </>}
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <button type="button" style={buttonStyle} onClick={()=>reset()}>
     Start / reset</button>
    <button type="button" style={buttonStyle} onClick={copyReport}>
     {captureFormat==='acceptance'?'Copy acceptance receipt':'Copy safe report'}
    </button>
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
