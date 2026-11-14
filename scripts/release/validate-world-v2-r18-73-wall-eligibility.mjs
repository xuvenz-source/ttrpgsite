/**
 * R18-73: STRICT OFFLINE-only, aggregate-only published wall eligibility audit.
 * This is not a connection, release approval, live movement metric or promise
 * of a production performance improvement.
 *
 * Reject unknown fields, identifiers, geometry, map rows, fabricated counts
 * and malformed timestamps. Never print input or error payloads.
 */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const KIND='B10-R18-73-published-wall-eligibility';
const COUNTS=Object.freeze([
 'published_scene_rows','scenes_with_array','scenes_without_array',
 'scenes_over_120','strict_plain_wall_scenes',
 'strict_plain_wall_scenes_with_duplicates',
 'strict_plain_wall_scenes_without_duplicates',
 'strict_plain_wall_eligible_objects','strict_plain_wall_duplicate_objects',
 'fallback_scenes','bounded_objects_total','bounded_wall_objects',
 'bounded_door_objects','bounded_window_objects','bounded_light_objects',
 'bounded_other_objects'
]);
const FIXED_FALSE=Object.freeze([
 'geometry_recorded','map_ids_recorded','operator_cli_verified',
 'independent_dm_p1_p2_verified','safe_to_install'
]);
const FIELDS=Object.freeze(['schema','kind','observed_at',...COUNTS,...FIXED_FALSE,'release_decision']);
const fail=()=>{throw Error('R18-73 NO-GO: unexpected or inconsistent aggregate evidence')};
const exactKeys=(v,names)=>v&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
const safeInteger=v=>Number.isSafeInteger(v)&&v>=0;
const contained=(p,dir)=>p===dir||p.startsWith(dir+sep);

export function validateR73WallEligibilityEvidence(input,{now=Date.now()}={}){
 let report=input;
 if(Array.isArray(input)){
  if(input.length!==1||!exactKeys(input[0],['world_v2_wall_eligibility']))fail();
  report=input[0].world_v2_wall_eligibility;
 }else if(input&&typeof input==='object'&&Object.hasOwn(input,'world_v2_wall_eligibility')){
  if(!exactKeys(input,['world_v2_wall_eligibility']))fail();
  report=input.world_v2_wall_eligibility;
 }
 if(!exactKeys(report,FIELDS)||report.schema!==1||report.kind!==KIND||
    report.release_decision!=='NO_GO'||typeof report.observed_at!=='string')fail();
 if(!COUNTS.every(k=>safeInteger(report[k]))||!FIXED_FALSE.every(k=>report[k]===false))fail();
 const observed=Date.parse(report.observed_at);
 if(!Number.isFinite(observed)||!Number.isFinite(now)||observed>now+5*60*1000)fail();

 const n=report;
 if(n.scenes_with_array+n.scenes_without_array!==n.published_scene_rows||
    n.strict_plain_wall_scenes+n.fallback_scenes!==n.published_scene_rows||
    n.scenes_over_120>n.scenes_with_array||
    n.strict_plain_wall_scenes>n.scenes_with_array-n.scenes_over_120||
    n.strict_plain_wall_scenes_with_duplicates+
     n.strict_plain_wall_scenes_without_duplicates!==n.strict_plain_wall_scenes||
    n.strict_plain_wall_eligible_objects<2*n.strict_plain_wall_scenes||
    n.strict_plain_wall_eligible_objects>120*n.strict_plain_wall_scenes||
    n.strict_plain_wall_duplicate_objects>
     n.strict_plain_wall_eligible_objects-n.strict_plain_wall_scenes||
    n.strict_plain_wall_duplicate_objects<n.strict_plain_wall_scenes_with_duplicates||
    (n.strict_plain_wall_scenes_with_duplicates===0&&n.strict_plain_wall_duplicate_objects!==0)||
    n.bounded_objects_total>120*(n.scenes_with_array-n.scenes_over_120)||
    n.bounded_wall_objects+n.bounded_door_objects+
     n.bounded_window_objects+n.bounded_light_objects+
     n.bounded_other_objects!==n.bounded_objects_total||
    n.bounded_wall_objects<n.strict_plain_wall_eligible_objects)fail();

 const counts=Object.freeze(Object.fromEntries(COUNTS.map(k=>[k,n[k]])));
 const classification=n.published_scene_rows===0?'NO_PUBLISHED_SAMPLE':
  n.strict_plain_wall_scenes===0?'NO_ELIGIBLE_SCENES':
  n.strict_plain_wall_scenes_with_duplicates===0?'NO_DUPLICATES_IN_ELIGIBLE_SCENES':
  'DUPLICATES_EXIST_REVIEW_ONLY';
 return Object.freeze({
  schema:1,kind:'B10-R18-73-reviewed-aggregate-eligibility',
  observedAt:new Date(observed).toISOString(),
  evidenceAgeMs:Math.max(0,now-observed),
  snapshotCurrent:now-observed<=15*60*1000,
  classification,counts,
  decision:'NO_GO',safeToDeploy:false,safeToInstallSql:false,
  independentDmP1P2Verified:false,operatorAuthenticatedCliVerified:false,
  browserRttP95Ms:null,productionSpeedupVerified:false,
  userIdsRecorded:false,mapIdsRecorded:false,geometryRecorded:false
 });
}

function loadPrivateEvidence(path){
 if(typeof path!=='string'||!path.trim())fail();
 const p=resolve(path),repo=realpathSync(ROOT);
 if(contained(p,repo)||!lstatSync(p).isFile()||
    realpathSync(p)!==p||lstatSync(p).size>8192)fail();
 return JSON.parse(readFileSync(p,'utf8'));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==1||!args[0].startsWith('--input='))fail();
  const report=validateR73WallEligibilityEvidence(
   loadPrivateEvidence(args[0].slice('--input='.length)));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch{
  process.stderr.write('R18-73 NO-GO: invalid, unsafe or unavailable aggregate evidence.\n');
  process.exitCode=1;
 }
}
