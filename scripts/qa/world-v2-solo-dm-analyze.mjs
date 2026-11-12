/**
 * B10-R18-13: offline, privacy-bounded analyzer for SOLO DM browser traces.
 * Accepts only already-sanitized window.__worldV2Trace.snapshot() JSON.
 * No browser hooks, RPC, network, database, clipboard, auth or mutation.
 * This is a QA instrument; no output grants deployment/SQL approval.
 */
import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const PHASES=Object.freeze(['idle','open','collision','fog','preview']);
const METRICS=Object.freeze([
 'authority.begin','authority.advance','authority.commit',
 'movement.release-to-terminal','visibility.rpc','visibility.queue-wait',
 'observer.frame-gap','render.frame'
]);
const COUNTS=Object.freeze([
 'movement.grabbed','movement.approved','movement.blocked',
 'movement.committed','movement.rejected','movement.revoked',
 'observer.seal','observer.resync','observer.sequence-gap','observer.unknown-piece',
 'visibility.revoke','visibility.refresh','visibility.snapshot',
 'renderer.seal','renderer.fog-full','renderer.fog-partial',
 'renderer.opaque','renderer.sprite-create','renderer.sprite-remove',
 'renderer.terrain-assign','renderer.observer-discontinuity'
]);
const fail=message=>{throw new Error(message)};
const BOUNDED_CADENCE_EVENTS=Object.freeze([
 'authority.begin.sample','authority.advance.sample',
 'authority.commit.sample','movement.release-to-terminal.sample'
]);
const SLOW_BUCKETS=new Set(['over-750ms','over-2s','over-5s']);
/** Trend only among the last 256 retained and opt-in timing events.
 * These buckets are *not* a causal performance attribution. Workload mix
 * (walls/fog/commit) may change between the early/late halves.
 */
export function summarizeRetainedCadence(events){
 if(!Array.isArray(events))throw Error('Invalid cadence events');
 const result={};
 for(const name of BOUNDED_CADENCE_EVENTS){
  const samples=events.filter(event=>event?.event===name&&
   ['under-250ms','250-750ms','over-750ms','over-2s','over-5s']
    .includes(event?.detail));
  if(samples.length<12){
   result[name]={samples:samples.length,comparison:'insufficient',
    earlierSlowPct:null,laterSlowPct:null};
   continue;
  }
  const split=Math.floor(samples.length/2);
  const earlier=samples.slice(0,split),later=samples.slice(split);
  const pct=part=>Math.round(part.filter(x=>SLOW_BUCKETS.has(x.detail)).length/
   part.length*100);
  const a=pct(earlier),b=pct(later);
  result[name]={
   samples:samples.length,comparison:
    b-a>=25?'late-higher-slow-share':
    a-b>=25?'late-lower-slow-share':'mixed-or-stable',
   earlierSlowPct:a,laterSlowPct:b
  };
 }
 return result;
}

const num=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export const SOLO_DM_PHASES=PHASES;

export function summarizeSoloDmTrace(raw,{phase}={}){
 if(!PHASES.includes(phase))fail('Unknown solo-DM phase');
 if(!raw||raw.enabled!==true||
  !Array.isArray(raw.events)||!raw.counts||
  typeof raw.counts!=='object'||Array.isArray(raw.counts)||
  !raw.durations||typeof raw.durations!=='object'||Array.isArray(raw.durations))
  fail('Expected enabled, bounded World V2 snapshot from ?worldV2Trace=1');
 if(raw.events.length>512||raw.limit>512)
  fail('World V2 trace event list exceeds expected bounds');
 const counts={};
 for(const key of COUNTS){
  const value=raw.counts[key]??0;
  if(!Number.isSafeInteger(value)||value<0)
   fail('Invalid count in World V2 snapshot');
  counts[key]=value;
 }
 const durations={};
 for(const key of METRICS){
  const value=raw.durations[key];
  if(value===undefined){
   durations[key]={samples:0,p50Ms:null,p95Ms:null,maxMs:null};
   continue;
  }
  if(!value||!Number.isSafeInteger(value.samples)||value.samples<0||
   value.samples>512||!num(value.p50Ms)||!num(value.p95Ms)||
   !num(value.maxMs)||value.p50Ms>value.p95Ms||
   value.p95Ms>value.maxMs)
    fail('Invalid bounded World V2 timing data');
  durations[key]={
   samples:value.samples,p50Ms:value.samples?value.p50Ms:null,
   p95Ms:value.samples?value.p95Ms:null,
   maxMs:value.samples?value.maxMs:null
  };
 }
 const notes=[],reasons=[];
 const churn=counts['renderer.terrain-assign']+
   counts['renderer.sprite-create']+counts['renderer.sprite-remove'];
 const seals=counts['renderer.seal']+counts['observer.seal']+
   counts['visibility.revoke'];
 if(phase==='idle'){
  if(churn||counts['renderer.fog-full']||seals)
   reasons.push('Unexpected idle renderer/fog/sprite/revocation churn');
  else notes.push('No tracked idle canvas/sprite/terrain/revocation churn');
 }
 if(phase==='open'&&
    counts['movement.approved']+counts['movement.committed']===0)
  notes.push('No movement acknowledgment captured: repeat with actual DM movement');
 if(phase==='collision'&&counts['movement.blocked']===0)
  notes.push('No blocked-event observed: collision outcome requires visual confirmation');
 if(phase==='preview'){
  const authoritySamples=['authority.begin','authority.advance','authority.commit']
   .reduce((sum,key)=>sum+durations[key].samples,0);
  if(authoritySamples>0)
   reasons.push('DM preview hit live movement RPC timing: investigate local-only invariant');
  notes.push('Preview cannot establish real player observer delivery or authorization');
 }
 if(['open','collision','fog'].includes(phase)&&seals)
  reasons.push('Sealing/revocation during DM motion: investigate cause and visibility');
 if(phase==='fog'&&counts['renderer.fog-full'])
  notes.push('Full fog repaint observed: correlate with map flashing and layer edits');
 if(durations['authority.advance'].p95Ms!==null&&
    durations['authority.advance'].p95Ms>750)
  notes.push('Advance p95 above 750ms diagnostic alert (not a universal release threshold)');
 if(durations['visibility.rpc'].p95Ms!==null&&
    durations['visibility.rpc'].p95Ms>750)
  notes.push('Sight RPC p95 above 750ms diagnostic alert (not a universal release threshold)');
 if(durations['movement.release-to-terminal'].p95Ms!==null&&
    durations['movement.release-to-terminal'].p95Ms>750)
  notes.push('Post-release movement lock p95 above 750ms: inspect remaining advances and terminal commit');
 return Object.freeze({
  phase,level:reasons.length?'investigate':
   notes.some(x=>x.startsWith('No movement acknowledgment')||
    x.startsWith('No blocked-event'))?'inconclusive':'observed',
  counts,durations,notes,reasons,
  retainedCadence:summarizeRetainedCadence(raw.events),
  limitations:['No independently authenticated player observer telemetry',
   'JavaScript render.frame timing does not measure total browser paint time',
   'Actual token overlap, wall penetration and flashing require DM visual notes']
 });
}

export function analyzeSoloDmBatch(rawByPhase){
 if(!rawByPhase||typeof rawByPhase!=='object'||Array.isArray(rawByPhase))
  fail('Expected phase-keyed snapshots');
 const phases={};
 for(const phase of PHASES){
  if(rawByPhase[phase]!==undefined)
   phases[phase]=summarizeSoloDmTrace(rawByPhase[phase],{phase});
 }
 if(!Object.keys(phases).length)fail('At least one real trace is required');
 return Object.freeze({
  decision:'SOLO_DM_DIAGNOSTIC_ONLY',
  safeForSqlRelease:false,
  multiplayerSecurityAccepted:false,
  clientCanaryAccepted:false,
  phases,
  missingPhases:PHASES.filter(phase=>!phases[phase]),
  note:'Compare R16 and canary traces phase-for-phase, with video/visual notes and DB resource evidence.'
 });
}
function argumentsToPaths(args){
 const files={};
 for(const arg of args){
  const match=arg.match(/^--(idle|open|collision|fog|preview)=(.+)$/);
  if(!match||files[match[1]])fail('Use distinct --phase=/local/file.json arguments');
  files[match[1]]=match[2];
 }
 return files;
}
export function runSoloDmAnalysis(args){
 const paths=argumentsToPaths(args);
 const reports={};
 for(const [phase,path] of Object.entries(paths)){
  const p=resolve(path);
  if(statSync(p).size>200000)fail('Trace file exceeds safe 200KB bound');
  reports[phase]=JSON.parse(readFileSync(p,'utf8'));
 }
 return analyzeSoloDmBatch(reports);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=runSoloDmAnalysis(process.argv.slice(2));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch(error){
  // Do not echo trace JSON, file content, URLs or user identifiers.
  process.stderr.write('Solo DM trace rejected: '+error.message+'\n');
  process.exitCode=1;
 }
}
