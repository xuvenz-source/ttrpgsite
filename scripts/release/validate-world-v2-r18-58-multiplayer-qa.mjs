/**
 * R18-58 — offline, privacy-bounded QA evidence triage.
 *
 * Does not authenticate anybody, visit a site, sign claims or authorize a
 * release. Reads ONLY explicit local receipts and outputs aggregate NO_GO.
 * A DM preview is never an independent P1/P2. Self-attested browser identity
 * cannot prove distinct Supabase logins, even if all three reports look good.
 */
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 isWorldV2TraceEvent,isWorldV2TraceDetail,isWorldV2TraceMetric,
 isWorldV2TraceCounter
} from '../../src/engine/v2/WorldTrace.js';

const ROLES=Object.freeze(['dm','p1','p2']);
const CHECKS=Object.freeze({
 dm:['fastArrow','fastDrag','cornerSnap','solidWall','notePinNoLag',
  'fogEditStable','revocationAction','canonicalConvergence','noMapFlash'],
 p1:['fastArrow','fastDrag','cornerSnap','solidWall','instantRegrab',
  'privateFog','revocationDenied','safeReconnect','canonicalConvergence','noMapFlash'],
 p2:['passiveObserver','privateFog','revocationNoLeak','safeReconnect',
  'canonicalConvergence','noMapFlash']
});
const RECEIPT_KEYS=new Set(['schema','runCode','role','captureTag',
 'capturedAt','buildSha','independentSignInDeclared',
 'independentBrowserDeclared','previewMode','checks','trace']);
const TRACE_KEYS=new Set(['enabled','limit','events','counts','durations']);
const EVENT_KEYS=new Set(['ms','event','detail']);
const STAT_KEYS=new Set(['samples','p50Ms','p95Ms','maxMs']);
const MAX_BYTES=180000;
const fail=s=>{throw Error('R58 MULTIPLAYER QA NO-GO: '+s)};
const keysOnly=(obj,allowed)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).every(k=>allowed.has(k));
const int=x=>Number.isSafeInteger(x)&&x>=0;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const exact=(a,b)=>a.length===b.length&&a.every(v=>b.includes(v));
const sha=x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x);

function traceCheck(trace){
 if(!keysOnly(trace,TRACE_KEYS)||Object.keys(trace).length!==5||
    trace.enabled!==true||!Number.isSafeInteger(trace.limit)||
    trace.limit<16||trace.limit>512||
    !Array.isArray(trace.events)||trace.events.length>trace.limit||
    !keysOnly(trace.counts,new Set(Object.keys(trace.counts||{})))||
    !keysOnly(trace.durations,new Set(Object.keys(trace.durations||{}))))
  fail('missing, disabled or malformed bounded trace');
 let prior=-1;
 for(const event of trace.events){
  if(!keysOnly(event,EVENT_KEYS)||Object.keys(event).length!==3||
     !int(event.ms)||event.ms>86400000||event.ms<prior||
     !isWorldV2TraceEvent(event.event)||!isWorldV2TraceDetail(event.detail))
   fail('unknown/unsafe event, detail or event time');
  prior=event.ms;
 }
 for(const [key,count] of Object.entries(trace.counts)){
  if(!(isWorldV2TraceEvent(key)||isWorldV2TraceCounter(key)||
       (key.endsWith('.error')&&
        isWorldV2TraceMetric(key.slice(0,-6))))||
     !int(count)||count>2147483647)
   fail('invalid trace count or unexpected counter name');
 }
 for(const [key,v] of Object.entries(trace.durations)){
  if(!isWorldV2TraceMetric(key)||!keysOnly(v,STAT_KEYS)||
     Object.keys(v).length!==4||
     !int(v.samples)||v.samples<1||v.samples>trace.limit||
     !positive(v.p50Ms)||!positive(v.p95Ms)||!positive(v.maxMs)||
     v.p50Ms>v.p95Ms||v.p95Ms>v.maxMs||
     v.maxMs>300000)
   fail('invalid trace duration, suspicious metric or percentile order');
 }
 return trace;
}
function safeReceipt(input,nowMs){
 if(!keysOnly(input,RECEIPT_KEYS)||
    Object.keys(input).length!==RECEIPT_KEYS.size||
    input.schema!==1||!ROLES.includes(input.role)||
    !/^[A-Z0-9][A-Z0-9-]{5,35}$/.test(input.runCode||'')||
    !/^[a-f0-9]{20,32}$/.test(input.captureTag||'')||
    !sha(input.buildSha)||
    typeof input.independentSignInDeclared!=='boolean'||
    typeof input.independentBrowserDeclared!=='boolean'||
    typeof input.previewMode!=='boolean')
  fail('invalid, extra or identifying receipt fields');
 const t=Date.parse(input.capturedAt);
 if(typeof input.capturedAt!=='string'||!Number.isFinite(t)||
    input.capturedAt!==new Date(t).toISOString()||
    t>nowMs+120000||nowMs-t>172800000)
  fail('stale/future or ambiguous capture timestamp');
 const needed=CHECKS[input.role];
 if(!keysOnly(input.checks,new Set(needed))||
    !exact(Object.keys(input.checks),needed)||
    Object.values(input.checks).some(x=>!['pass','fail','not_run'].includes(x)))
  fail('missing or unexpected required manual observation');
 traceCheck(input.trace);
 return input;
}
export function validateR58MultiplayerQa({receipts=[],expectedBuildSha,now=new Date()}={}){
 if(!sha(expectedBuildSha)||!Number.isFinite(new Date(now).getTime()))
  fail('exact expected target build SHA and valid now required');
 if(!Array.isArray(receipts)||receipts.length>3)
  fail('at most one receipt per each of DM, P1 and passive P2');
 const nowMs=new Date(now).getTime();
 const items=receipts.map(x=>safeReceipt(x,nowMs));
 if(new Set(items.map(x=>x.role)).size!==items.length||
    new Set(items.map(x=>x.captureTag)).size!==items.length)
  fail('duplicate role or capture tag, not independent evidence');
 if(items.length>1&&new Set(items.map(x=>x.runCode)).size!==1)
  fail('different test runs cannot be combined');
 const runDuration=items.length>1?
  Math.max(...items.map(x=>Date.parse(x.capturedAt)))-
  Math.min(...items.map(x=>Date.parse(x.capturedAt))):0;
 if(runDuration>3600000)fail('captures over one hour apart');
 const seen=new Map(items.map(x=>[x.role,x]));
 const roleResults={};
 for(const role of ROLES){
  const receipt=seen.get(role);
  if(!receipt){
   roleResults[role]={present:false,checksComplete:false,traceCoverage:false,
    declaredIndependent:false,buildMatches:false,failures:['missing']};
   continue;
  }
  const miss=Object.entries(receipt.checks)
   .filter(([,v])=>v!=='pass').map(([k,v])=>k+':'+v);
  const m=receipt.trace.durations;
  const coverage=role==='p2'?
   ((receipt.trace.counts['observer.frame-accepted']||0)>0||
    (receipt.trace.counts['observer.authorized']||0)>0):
   (m['authority.advance']?.samples||0)>=5&&
   ((m['authority.commit']?.samples||0)+
    (m['authority.finalize']?.samples||0))>=5;
  const independent=receipt.independentSignInDeclared&&
   receipt.independentBrowserDeclared&&!receipt.previewMode;
  roleResults[role]={
   present:true,checksComplete:miss.length===0,traceCoverage:coverage,
   declaredIndependent:independent,buildMatches:receipt.buildSha===expectedBuildSha,
   failures:miss,
   movementP95Ms:{
    advance:m['authority.advance']?.p95Ms??null,
    commit:m['authority.commit']?.p95Ms??null,
    finalize:m['authority.finalize']?.p95Ms??null,
    releaseToTerminal:m['movement.release-to-terminal']?.p95Ms??null
   }
  };
 }
 const aggregateComplete=ROLES.every(r=>{
  const x=roleResults[r];
  return x.present&&x.checksComplete&&x.traceCoverage&&
   x.declaredIndependent&&x.buildMatches;
 });
 return Object.freeze({
  decision:'NO_GO',safeToDeploy:false,
  candidateBuild:expectedBuildSha,
  receiptCount:items.length,missingRoles:ROLES.filter(r=>!seen.has(r)),
  selfReportedEvidenceComplete:aggregateComplete,
  differentSignedInAccountsIndependentlyVerified:false,
  authenticatedLinkedSupabaseCliDryRunVerified:false,
  fogRevocationIndependentlyObservedByReviewer:false,
  productionReleaseApproved:false,
  roleResults
 });
}
const source=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(source){
 try{
  const args=process.argv.slice(2);
  if(args.length!==2||!args[0].startsWith('--receipts=')||
     !args[1].startsWith('--expected-build=')||
     !args[0].slice('--receipts='.length))
   fail('expected --receipts=private-file.json --expected-build=40-char-sha');
  const path=resolve(args[0].slice('--receipts='.length));
  const data=readFileSync(path,'utf8');
  if(data.length>MAX_BYTES)fail('oversized private evidence file');
  const input=JSON.parse(data);
  const receipts=Array.isArray(input)?input:input?.receipts;
  const report=validateR58MultiplayerQa({
   receipts,expectedBuildSha:args[1].slice('--expected-build='.length)
  });
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch{
  process.stderr.write('R58 MULTIPLAYER QA NO-GO: malformed or unsafe QA evidence; inspect privately.\n');
  process.exitCode=1;
 }
}