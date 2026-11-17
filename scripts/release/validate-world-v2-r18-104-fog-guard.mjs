/**
 * B10-R18-104 — four independent repository/live PostgreSQL source SHA-256
 * comparisons, actor-scoped motion cleanup, and an UNAPPLIED fog privacy
 * guard candidate. This verifier NEVER connects to or changes any database.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractR103FunctionSource,validateR103Source}
 from './validate-world-v2-r18-103-live-rpc-source-parity.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const BASE='staging/world-v2-b10-r18-104-fog-guard/';
const PREV='staging/world-v2-b10-r18-103-live-source-parity/';
const CANDIDATE_BLOB='c84d7cf8b0958621f11ec273cb36361e2501a77f';
const fail=message=>{throw Error('R104 FOG STATUS NO-GO: '+message)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const exact=(o,ks)=>o&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).length===ks.length&&ks.every(k=>Object.hasOwn(o,k));
const read=(root,p)=>JSON.parse(readFileSync(join(root,p),'utf8'));
const sha256=s=>createHash('sha256').update(s).digest('hex');
const blobsha=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const SOURCES=[
 ['public','is_map_fog_published',
  'supabase/migrations/20261107110539_authoritative_fog_collision_release.sql'],
 ['public','end_map_motion_sessions',
  'supabase/migrations/20261108111759_unified_movement_fog_realtime_memory_20261108.sql'],
 ['public','can_view_campaign_map',
  'supabase/migrations/20261106180100_private_player_maps.sql'],
 ['public','end_map_motion_previews',
  'supabase/migrations/20261108031754_world_runtime_movement_fog_collision_20261108.sql']
];
const gateKeys=[
 'original83PrivatelyRecovered','allPrivilegedRpcsReviewed',
 'fogStatusCandidateSqlApproved','standalonePg17CandidateAppliedAndRolledBack',
 'signedFogStatusPolicyPassed','signedMovementCleanupIsolationPassed',
 'qaOnlyHistoricalDryRunPassed','qaSchemaInstalled',
 'pendingEightInstalled','qaVercelDeployed','productionReleaseAuthorized'
];
const noChangeKeys=[
 'originalSqlAndGrantsUnchanged','qaSqlAndGrantsUnchanged',
 'existingVercelUnchanged','noRawLiveFunctionBodiesExported',
 'noSecretsCommitted','noPaidResources','noMerge','noProductionDeploy'
];
const SOURCE_COUNTS={
 exactNewRepoLiveFunctionMatches:4,plannedSignedCases:12,sourceOnly:true
};
const PREV_MANIFEST=PREV+'manifest.json';
const PREV_INDEX=PREV+'metadata-index.json';
const PREV_MATRIX=PREV+'signed-authorization-matrix.json';
export function validateR104FogGuard(manifest,matrix,{repoRoot=ROOT}={}){
 const root=resolve(repoRoot);
 if(!exact(manifest,['schema','workPackage','decision','parentPr',
   'parentSha','observedLocalDate','scope','original','qa',
   'sourceFindings','candidate','evidence','gates','unchanged'])||
   manifest.schema!==1||manifest.workPackage!=='B10-R18-104'||
   manifest.decision!=='NO_GO'||manifest.parentPr!==205||
   manifest.parentSha!=='2508e16fd5256d51d751df358c7f55d3394fc604'||
   manifest.observedLocalDate!=='2026-11-17'||
   manifest.scope!==
    'SOURCE_EXACT_FOG_STATUS_METADATA_DISCLOSURE_AND_ACTOR_BOUND_MOTION_CLEANUP_REVIEW')
  fail('parent, provenance or NO_GO decision changed');
 if(!same(manifest.original,{
   projectRef:'lwhwgqaunxbmvyndswze',status:'ACTIVE_HEALTHY',
   historicalMigrations:83,sqlUnchanged:true,
   exposedFogStatusAuthenticatedOnly:true,
   fogStatusHasDirectMembershipGuard:false,
   privateMapRulesAnonSelectable:false,
   privateMapRulesAuthenticatedSelectable:false,
   rlsCombatPolicyCallers:1,allNewExactSourceParityFunctions:4,
   priorR103ExactSourceParityFunctions:6
  })||!same(manifest.qa,{
   projectRef:'bgydsamxypjslergfpla',status:'ACTIVE_HEALTHY',
   registeredMigrations:0,publicApplicationTables:0,sqlUnchanged:true
  })||!same(manifest.sourceFindings,{
   fogStatusSourceLevelMetadataOracle:true,
   runUserDisclosureReproduction:false,
   cleanupSessionActorIsAuthenticatedCaller:true,
   cleanupPreviewActorIsAuthenticatedCaller:true,
   viewCampaignMapUsesCallerMembership:true,
   availablePolicyConsumer:'public.map_combats.dm or nonfog viewers read combat roster',
   trueCollisionOrFogSecuritySignedVerified:false
  }))
  fail('original/QA state or source-level finding misreported');
 const expectedCandidate={
   path:BASE+'unapplied-fog-status-guard.sql',
   gitBlobSha:CANDIDATE_BLOB,
   intendedVisibility:'ASSIGNED_MAP_PLAYER_OR_CAMPAIGN_DM',
   primaryGuard:'public.can_view_campaign_map',
   sameCampaignRuleJoin:true,retainsAuthenticatedExecute:true,
   forbidsAnonAndPublicExecute:true,preservesMapCombatPolicy:true,
   appliedToAnyDatabase:false,postApplyVerified:false,rollbackExecuted:false
 };
 const expectedEvidence={
   signedMatrix:BASE+'signed-acceptance-matrix.json',
   validator:'scripts/release/validate-world-v2-r18-104-fog-guard.mjs',
   tests:'tests/world-v2-r18-104-fog-guard.test.mjs',
   runbook:'docs/testing/world-v2-r18-104-fog-status-disclosure-and-actor-bound-cleanup-2026-11-17.md',
   ...SOURCE_COUNTS
 };
 if(!same(manifest.candidate,expectedCandidate)||
   !same(manifest.evidence,expectedEvidence)||
   !exact(manifest.gates,gateKeys)||gateKeys.some(k=>manifest.gates[k]!==false)||
   !exact(manifest.unchanged,noChangeKeys)||
   noChangeKeys.some(k=>manifest.unchanged[k]!==true))
  fail('unperformed install, signed QA, or production release claimed');
 // Reuse the exact immutable R18-103 original live fingerprint snapshot.
 const old=validateR103Source(read(root,PREV_MANIFEST),read(root,PREV_INDEX),
  read(root,PREV_MATRIX),{repoRoot:root});
 if(old.decision!=='NO_GO'||old.liveFunctionSha256Fingerprints!==20||
    old.exactGitSourceBodiesRechecked!==6||
    old.executedSignedAuthorizationCases!==0)
  fail('prior source parity and security gate changed');
 const oldIndex=read(root,PREV_INDEX);
 const sourceBodies=new Map();
 for(const [schema,name,path] of SOURCES){
  const live=oldIndex.functions.find(x=>x.schema===schema&&x.name===name);
  if(!live||!live.securityDefiner||!live.authExecute||live.anonExecute||
   !live.configuredEmptySearchPath)
   fail('live callable-function grant or owner expectations changed');
  const body=extractR103FunctionSource(readFileSync(join(root,path),'utf8'),schema,name);
  if(Buffer.byteLength(body,'utf8')!==live.bodyBytes||
   sha256(body)!==live.bodySha256)
   fail('new Git function body not identical to original live SHA-256');
  sourceBodies.set(name,body);
 }
 const fog=sourceBodies.get('is_map_fog_published');
 if(!/from\s+forge_visibility\.map_rules\b/i.test(fog)||
    !/r\.map_id\s*=\s*p_map/i.test(fog)||
    !/r\.fog_enforced\b/i.test(fog)||
    /\bauth\.uid\b|\bcan_view_campaign_map\b|\bis_campaign_dm\b/i.test(fog))
  fail('original fog status private map-rules oracle no longer matches evidence');
 const end=sourceBodies.get('end_map_motion_sessions');
 if(!/actor\s+uuid\s*:=\s*auth\.uid\s*\(\s*\)/i.test(end)||
    !/s\.actor_id\s*=\s*actor/i.test(end)||
    !/s\.map_id\s*=\s*p_map/i.test(end)||
    !/perform\s+public\.end_map_motion_previews\s*\(/i.test(end))
  fail('end_map_motion_sessions actor scope/delegation missing');
 const previews=sourceBodies.get('end_map_motion_previews');
 if(!/r\.actor_id\s*=\s*auth\.uid\s*\(\s*\)/i.test(previews)||
    !/r\.map_id\s*=\s*p_map/i.test(previews))
  fail('movement preview cleanup was not actor-scoped');
 const membership=sourceBodies.get('can_view_campaign_map');
 if(!/member\.user_id\s*=\s*auth\.uid\s*\(\s*\)/i.test(membership)||
    !/member\.campaign_id\s*=\s*p_campaign/i.test(membership)||
    !/member\.role\s*=\s*'dm'/i.test(membership)||
    !/override\.map_id/i.test(membership))
  fail('membership helper does not check requested campaign/viewer/map');
 const originalPolicy=readFileSync(join(root,SOURCES[0][2]),'utf8');
 if(!/create\s+policy\s+"dm or nonfog viewers read combat roster"/i.test(originalPolicy)||
   !/public\.can_view_campaign_map\(campaign_id,map_id\)/i.test(originalPolicy)||
   !/not\s+public\.is_map_fog_published\(map_id\)/i.test(originalPolicy))
  fail('combat roster RLS policy consumer missing');
 const candidate=readFileSync(join(root,expectedCandidate.path));
 if(blobsha(candidate)!==CANDIDATE_BLOB)
  fail('candidate differs from immutable never-applied SQL blob');
 const sql=candidate.toString('utf8');
 const tokens=[
  /create\s+or\s+replace\s+function\s+public\.is_map_fog_published\s*\(\s*p_map\s+uuid\s*\)/i,
  /returns\s+boolean[\s\S]*?language\s+sql\s+stable\s+security\s+definer\s+set\s+search_path\s*=\s*''/i,
  /from\s+public\.battle_maps\s+m\s+join\s+forge_visibility\.map_rules\s+r/i,
  /r\.map_id\s*=\s*m\.id\s+and\s+r\.campaign_id\s*=\s*m\.campaign_id/i,
  /m\.id\s*=\s*p_map[\s\S]*?r\.fog_enforced[\s\S]*?public\.can_view_campaign_map\s*\(\s*m\.campaign_id\s*,\s*m\.id\s*\)/i,
  /revoke\s+all\s+on\s+function\s+public\.is_map_fog_published\(uuid\)\s+from\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
  /grant\s+execute\s+on\s+function\s+public\.is_map_fog_published\(uuid\)\s+to\s+authenticated/i
 ];
 if(tokens.some(x=>!x.test(sql))||
  !/\bBEGIN\s*;/i.test(sql)||!/\bCOMMIT\s*;/i.test(sql)||
  /\b(?:drop\s+(?:table|function|schema)|create\s+(?:table|policy)|alter\s+table|truncate)\b/i.test(sql))
  fail('guarded privacy candidate has unsafe SQL statements');
 if(!same(matrix,read(root,expectedEvidence.signedMatrix))||
  !exact(matrix,['schema','workPackage','decision','projectRef','caseCount',
    'note','cases','hostPrerequisite','signedCasesExecuted','securityAccepted'])||
  matrix.schema!==1||matrix.workPackage!=='B10-R18-104'||
  matrix.decision!=='NO_GO'||matrix.projectRef!=='bgydsamxypjslergfpla'||
  matrix.caseCount!==12||matrix.cases?.length!==12||
  matrix.signedCasesExecuted!==0||matrix.securityAccepted!==false)
  fail('signed acceptance case record altered or falsely passed');
 const ids=new Set();
 for(const c of matrix.cases){
  if(!exact(c,['id','actor','scenario','expected','status',
    'signedAccountTested','sqlInstalled'])||
    !/^[A-Z]+-[0-9]{2}$/.test(c.id)||ids.has(c.id)||
    typeof c.actor!=='string'||c.actor.length<2||
    typeof c.scenario!=='string'||c.scenario.length<25||
    typeof c.expected!=='string'||c.expected.length<20||
    c.status!=='NOT_RUN'||c.signedAccountTested!==false||
    c.sqlInstalled!==false)
   fail('invented signed test or invalid case');
  ids.add(c.id);
 }
 return Object.freeze({
  workPackage:'B10-R18-104',engineeringGate:'SOURCE_ONLY',
  decision:'NO_GO',newExactLiveSourceMatches:4,
  previousExactLiveSourceMatches:6,
  fogStatusDisclosureSourceConfirmed:true,
  actorBoundSessionCleanupSourceConfirmed:true,
  actorBoundPreviewCleanupSourceConfirmed:true,
  privacyCandidateStagedButNotApplied:true,
  originalOrQaSqlApplied:false,
  signedCasesExecuted:0,plannedSignedCases:12,
  productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('offline only, no arguments or database');
  const result=validateR104FogGuard(
   read(ROOT,BASE+'manifest.json'),read(ROOT,BASE+'signed-acceptance-matrix.json'));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('R104 FOG STATUS NO-GO: offline source gate failed.\n');
  process.exitCode=1;
 }
}
