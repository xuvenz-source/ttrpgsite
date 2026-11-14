/**
 * B10-R18-24: copy-only, bounded, privacy-preserving World V2 QA report.
 *
 * No remote requests, browser storage, user/campaign identifiers, map pixels,
 * session secrets or signed visibility payloads. User-selected player labels
 * are NOT proof of distinct authenticated identities or private fog safety.
 */
import {
 isWorldV2TraceEvent,isWorldV2TraceDetail,isWorldV2TraceMetric,
 isWorldV2TraceCounter
} from './WorldTrace.js';

export const WORLD_V2_QA_CASES=Object.freeze([
 ['A01','Independent sign-in'],['A02','Authorized map / sight'],
 ['A03','Observer movement'],['A04','Unauthorized move denial'],
 ['A05','Hidden NPC outside sight'],['A06','NPC enters / leaves sight'],
 ['A07','Personal fog isolation'],['A08','Membership revocation'],
 ['A09','DM demotion'],['A10','Private recipient isolation'],
 ['A11','Reconnect and packet ordering'],['A12','Idle signed recovery'],
 ['open','Open movement speed'],['collision','Wall collision'],
 ['fog','Fog collision / redraw'],['idle','Idle renderer stability'],
 ['preview','DM local preview'],['stress','Sustained movement']
]);
const CASES=new Set(WORLD_V2_QA_CASES.map(([id])=>id));
const ROLES=new Set(['dm','player-1','player-2']);
const MAX_COUNT=2147483647;
const safeCount=v=>Number.isSafeInteger(v)&&v>=0&&v<=MAX_COUNT;
const safeTime=v=>typeof v==='number'&&Number.isFinite(v)&&
 v>=0&&v<=86400000; // capped at one day, never an absolute clock
const fail=()=>{throw Error('Invalid bounded World V2 diagnostic trace')};

/** Denies unexpected snapshot fields rather than serializing raw objects. */
export function createWorldV2DiagnosticReport(snapshot,{
 role='player-1',caseId='A03',dmPreview=false
}={}){
 if(!ROLES.has(role)||!CASES.has(caseId)||typeof dmPreview!=='boolean')
  fail();
 if(!snapshot||snapshot.enabled!==true||
   !Number.isSafeInteger(snapshot.limit)||snapshot.limit<16||
   snapshot.limit>512||!Array.isArray(snapshot.events)||
   snapshot.events.length>snapshot.limit||
   !snapshot.counts||typeof snapshot.counts!=='object'||
   Array.isArray(snapshot.counts)||
   !snapshot.durations||typeof snapshot.durations!=='object'||
   Array.isArray(snapshot.durations))
  fail();

 const counts={};
 for(const [key,value] of Object.entries(snapshot.counts)){
  if(!(isWorldV2TraceEvent(key)||isWorldV2TraceCounter(key)||
    (key.endsWith('.error')&&
     isWorldV2TraceMetric(key.slice(0,-6))))||
    !safeCount(value))fail();
  counts[key]=value;
 }
 const durations={};
 for(const [key,value] of Object.entries(snapshot.durations)){
  if(!isWorldV2TraceMetric(key)||!value||
    !Number.isSafeInteger(value.samples)||value.samples<0||
    value.samples>snapshot.limit||
    !safeTime(value.p50Ms)||!safeTime(value.p95Ms)||
    !safeTime(value.maxMs)||value.p50Ms>value.p95Ms||
    value.p95Ms>value.maxMs)fail();
  durations[key]={
   samples:value.samples,p50Ms:value.p50Ms,
   p95Ms:value.p95Ms,maxMs:value.maxMs
  };
 }
 const events=[];
 for(const item of snapshot.events){
  if(!item||!safeTime(item.ms)||!Number.isSafeInteger(item.ms)||
    !isWorldV2TraceEvent(item.event)||
    !isWorldV2TraceDetail(item.detail))fail();
  events.push({ms:item.ms,event:item.event,detail:item.detail});
 }
 // Never copy raw snapshot, never copy arbitrary top-level properties,
 // and do not include absolute timestamps, account IDs, URLs or coordinates.
 return Object.freeze({
  schema:1,kind:'world-v2-local-qa-capture',
  caseId,role,roleSource:'self-selected',
  dmPreview,
  authenticatedAccountsVerified:false,
  recipientRealtimeIsolationVerified:false,
  fogAuthorizationVerified:false,
  canonicalConvergenceVerified:false,
  releaseDecision:'NO_GO',
  trace:Object.freeze({limit:snapshot.limit,events,counts,durations})
 });
}
