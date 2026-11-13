/**
 * R18-59: local opt-in packaging of an R18-58 QA acceptance receipt.
 * NO server calls, cookies, identities, coordinates or private sight output.
 * Self-reported test results are NOT evidence of independent authentication.
 */
import {createWorldV2DiagnosticReport} from './WorldTraceDiagnosticReport.js';

export const WORLD_V2_QA_REQUIRED_CHECKS=Object.freeze({
 dm:Object.freeze(['fastArrow','fastDrag','cornerSnap','solidWall','notePinNoLag',
  'fogEditStable','revocationAction','canonicalConvergence','noMapFlash']),
 p1:Object.freeze(['fastArrow','fastDrag','cornerSnap','solidWall','instantRegrab',
  'privateFog','revocationDenied','safeReconnect','canonicalConvergence','noMapFlash']),
 p2:Object.freeze(['passiveObserver','privateFog','revocationNoLeak','safeReconnect',
  'canonicalConvergence','noMapFlash'])
});

export const WORLD_V2_QA_CHECK_LABELS=Object.freeze({
 fastArrow:'Rapid arrow-key movement stays responsive',
 fastDrag:'Rapid repeated token dragging stays responsive',
 cornerSnap:'Corner drag snaps to the majority cell promptly',
 solidWall:'True solid wall collision, with no push-through',
 notePinNoLag:'No significant delay when near a note pin',
 fogEditStable:'Fog edits do not flash or invalidate authorized sight',
 revocationAction:'DM changes token or viewer permission during movement',
 canonicalConvergence:'Every viewer agrees on the final canonical cell',
 noMapFlash:'No board flashing or terrain reload while tokens move',
 instantRegrab:'Can drag again immediately after a blocked move',
 privateFog:'Only this player’s authorized fog and pieces are visible',
 revocationDenied:'Revoked player cannot move or access prior sight',
 safeReconnect:'Reconnect restores only current authorized sight',
 passiveObserver:'Passive player sees DM and P1 moves without moving',
 revocationNoLeak:'Passive player sees no leaked sight during revocation'
});

const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const tag=value=>typeof value==='string'&&/^[a-f0-9]{20,32}$/.test(value);
const fail=()=>{throw Error('Invalid local QA acceptance input')};

export function emptyWorldV2QaChecks(role){
 const names=WORLD_V2_QA_REQUIRED_CHECKS[role];
 if(!names)fail();
 return Object.fromEntries(names.map(key=>[key,'not_run']));
}

export function createWorldV2AcceptanceReceipt(snapshot,{
 role,dmPreview=false,runCode,buildSha,captureTag,
 capturedAt=new Date().toISOString(),
 independentSignInDeclared=false,independentBrowserDeclared=false,
 checks
}={}){
 const needed=WORLD_V2_QA_REQUIRED_CHECKS[role];
 if(!needed||typeof dmPreview!=='boolean'||
   typeof independentSignInDeclared!=='boolean'||
   typeof independentBrowserDeclared!=='boolean'||
   typeof runCode!=='string'||!/^[A-Z0-9][A-Z0-9-]{5,35}$/.test(runCode)||
   !sha(buildSha)||!tag(captureTag)||
   typeof capturedAt!=='string'||!Number.isFinite(Date.parse(capturedAt))||
   new Date(capturedAt).toISOString()!==capturedAt||
   !checks||typeof checks!=='object'||Array.isArray(checks)||
   Object.keys(checks).length!==needed.length||
   Object.keys(checks).some(key=>!needed.includes(key))||
   needed.some(key=>!['pass','fail','not_run'].includes(checks[key])))
  fail();

 const sanitized=createWorldV2DiagnosticReport(snapshot,{
  role:role==='dm'?'dm':role==='p1'?'player-1':'player-2',
  caseId:'stress',dmPreview
 });
 // Copy ONLY report.trace, never raw snapshot or user-provided extra fields.
 return Object.freeze({
  schema:1,runCode,role,captureTag,capturedAt,buildSha,
  independentSignInDeclared,independentBrowserDeclared,
  previewMode:dmPreview,
  checks:Object.fromEntries(needed.map(key=>[key,checks[key]])),
  trace:{enabled:true,limit:sanitized.trace.limit,
   events:sanitized.trace.events,counts:sanitized.trace.counts,
   durations:sanitized.trace.durations}
 });
}
