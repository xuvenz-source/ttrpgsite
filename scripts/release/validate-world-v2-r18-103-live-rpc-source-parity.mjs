/** R18-103 exact six live/Git function SHA-256 parity gate. OFFLINE/NO_GO. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR102PrivilegedRpc} from './validate-world-v2-r18-102-privileged-rpc-audit.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const BASE='staging/world-v2-b10-r18-103-live-source-parity/';
const PREV='staging/world-v2-b10-r18-102-privileged-rpc-audit/';
const BLOB='788a96c8c75a7734c628b3d969cf0ad8cd1609a4';
const fail=s=>{throw Error('R103 LIVE RPC NO-GO: '+s)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const shape=(x,ks)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k));
const read=(root,p)=>JSON.parse(readFileSync(join(root,p),'utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
const verified=[
 ['public','cancel_world_motion_v2','supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql'],
 ['public','get_dm_map_npc_values','supabase/migrations/20261109000500_dm_map_npc_protected_columns.sql'],
 ['public','get_world_visibility_v2','supabase/migrations/20261109102100_world_engine_v2_visibility_snapshots.sql'],
 ['forge_visibility','dispatch_movement_preview','supabase/migrations/20261108091818_observer_and_per_viewer_visibility_release_20261108.sql'],
 ['forge_world_v2','viewer_on_map','supabase/migrations/20261109100000_world_engine_v2_private_observer_stream.sql'],
 ['forge_world_v2','visibility_frame_v2','supabase/migrations/20261109102100_world_engine_v2_visibility_snapshots.sql']
];
const targetNames=[
 'cancel_world_motion_v2','end_authorized_navigation_gesture','end_map_motion_previews',
 'end_map_motion_sessions','get_campaign_sheet_inventory','get_dm_map_npc_values',
 'get_npc_token_values','get_world_visibility_v2','is_map_fog_published',
 'patch_campaign_sheet_noninventory','preview_map_motion','publish_map_environment'
];
const helperNames=[
 'public.can_edit_campaign_sheet','public.can_edit_campaign_sheet_inventory',
 'public.can_view_campaign_map','public.is_campaign_dm',
 'forge_world_v2.visibility_frame_v2','forge_world_v2.viewer_on_map',
 'forge_visibility.dispatch_movement_preview','forge_visibility.bump_tick'
];
const noIdentity=[
 'get_campaign_sheet_inventory','get_dm_map_npc_values','get_npc_token_values',
 'is_map_fog_published','patch_campaign_sheet_noninventory','preview_map_motion',
 'publish_map_environment'
];
const flags=[
 'direct_auth_uid','direct_auth_jwt','dm_helper','campaign_helper','viewer_helper',
 'movement_dispatch','visibility_frame','direct_session_actor','owner_marker',
 'campaign_marker','map_marker','filter_marker','raise_exception'
];
const falseGates=[
 'isMapFogPublishedPolicyResolved','endMapMotionSessionsAuthorizationSourceReviewed',
 'allTwentySourceFunctionsIndividuallyReviewed','signedDmP1P2OutsiderTestsPassed',
 'crossCampaignNpcSheetTestsPassed','private83HistoricalSqlRecovered',
 'historicalSqlPortabilitySecurityApproved','qaOnlyDryRunPerformed',
 'qaOriginal83SqlInstalled','pendingEightInstalled','qaFrontendDeployed',
 'productionReleaseAuthorized'
];
const trueGates=[
 'productionSqlUnchanged','qaSqlUnchanged','originalVercelUnchanged',
 'qaVercelUndeployed','noRawLiveSqlOrSecretsExported','noPaidResource',
 'noMerge','noProductionDeployment'
];
export function extractR103FunctionSource(text,schema,name){
 const pat=new RegExp('CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+'+
  schema+'\\.'+name+'\\s*\\(','ig');
 const hits=[...text.matchAll(pat)];
 if(hits.length!==1)fail('duplicate/missing Git function source');
 const tail=text.slice(hits[0].index+hits[0][0].length);
 const match=tail.match(/\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;/i);
 if(!match)fail('malformed function body');
 return match[2];
}
export function validateR103Source(m,index,matrix,{repoRoot=ROOT}={}){
 const root=resolve(repoRoot);
 if(!shape(m,['schema','workPackage','decision','parentPr','parentSha',
  'observedLocalDate','scope','original','qa','evidence','gates','unchanged'])||
  m.schema!==1||m.workPackage!=='B10-R18-103'||m.decision!=='NO_GO'||
  m.parentPr!==204||m.parentSha!=='defe689af62951bcf04b30d3a09483ec805548fb'||
  m.observedLocalDate!=='2026-11-17'||
  m.scope!=='LIVE_20_RPC_SHA256_SOURCE_FINGERPRINT_AND_SIX_SOURCE_EQUALITY_REVIEW')
  fail('source package parent and identity mismatch');
 if(!same(m.original,{
  projectRef:'lwhwgqaunxbmvyndswze',status:'ACTIVE_HEALTHY',
  historicalMigrationCount:83,liveFunctionsFingerprintVerified:20,
  exactRepositoryBodyParityConfirmed:6,rawLiveFunctionSourceExported:false,
  sqlOrPermissionChanges:false
 })||!same(m.qa,{
  projectRef:'bgydsamxypjslergfpla',status:'ACTIVE_HEALTHY',
  registeredMigrations:0,publicApplicationTables:0,sqlChanged:false
 }))fail('original or QA state tampered');
 const exactFiles={
  index:BASE+'metadata-index.json',indexGitBlobSha:BLOB,
  testMatrix:BASE+'signed-authorization-matrix.json',
  validator:'scripts/release/validate-world-v2-r18-103-live-rpc-source-parity.mjs',
  test:'tests/world-v2-r18-103-live-rpc-source-parity.test.mjs',
  runbook:'docs/testing/world-v2-r18-103-live-rpc-source-parity-2026-11-17.md',
  targetFunctionCount:12,privateHelperFunctionCount:8,exactRepoSourceParityCount:6,
  unauthorizedPublicationPolicyOpen:true,motionSessionActorPatternNotDetected:1,
  allFunctionsFullyReviewed:false
 };
 if(!same(m.evidence,exactFiles)||
  !shape(m.gates,falseGates)||falseGates.some(x=>m.gates[x]!==false)||
  !shape(m.unchanged,trueGates)||trueGates.some(x=>m.unchanged[x]!==true))
  fail('file seal or release gate changed');
 const raw=readFileSync(join(root,exactFiles.index));
 const blob=createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
 if(blob!==BLOB||!same(index,JSON.parse(raw.toString('utf8'))))
  fail('immutable live catalog Git blob or caller-supplied index changed');
 if(!shape(index,['schema','workPackage','decision','provenance','interpretation',
   'totals','functions','verifiedSourceMatches'])||
  index.schema!==1||index.workPackage!=='B10-R18-103'||index.decision!=='NO_GO'||
  !same(index.provenance,{
   sourceProjectRef:'lwhwgqaunxbmvyndswze',
   frozenRepoHead:'defe689af62951bcf04b30d3a09483ec805548fb',
   readOnlyMetadataOnly:true,rawLiveFunctionDefinitionsReturned:false,
   signedUserAuthorizationTested:false,observedLocalDate:'2026-11-17'
  })||
  typeof index.interpretation!=='string'||index.interpretation.length<175||
  !same(index.totals,{
   priorityExposedCount:12,helperCount:8,sourceParityMatches:6,
   anonExecutableCount:0,allEmptySearchPath:20,
   noDirectAuthPriority:7,noDirectActorBoundSessionText:1
  })||
  !Array.isArray(index.functions)||index.functions.length!==20||
  !Array.isArray(index.verifiedSourceMatches)||
  index.verifiedSourceMatches.length!==6)
  fail('function inventory or provenance mismatch');
 const byName=new Map();
 for(const f of index.functions){
  const full=f.schema+'.'+f.name;
  if(!shape(f,['schema','name','signature','returnType','bodySha256','bodyBytes',
   'securityDefiner','authExecute','anonExecute','configuredEmptySearchPath','markers'])||
   typeof f.signature!=='string'||typeof f.returnType!=='string'||
   !/^[a-f0-9]{64}$/.test(f.bodySha256)||
   !Number.isSafeInteger(f.bodyBytes)||f.bodyBytes<1||
   !shape(f.markers,flags)||!Object.values(f.markers).every(x=>typeof x==='boolean')||
   f.securityDefiner!==true||f.configuredEmptySearchPath!==true||
   f.anonExecute!==false||typeof f.authExecute!=='boolean'||byName.has(full))
    fail('function source fingerprints or permissions differ');
  byName.set(full,f);
 }
 if(targetNames.some(n=>!byName.get('public.'+n)?.authExecute)||
  helperNames.some(n=>!byName.has(n))||byName.size!==20||
  !same(index.functions.filter(f=>f.schema==='public'&&targetNames.includes(f.name)&&
   !f.markers.direct_auth_uid&&!f.markers.direct_auth_jwt).map(f=>f.name),noIdentity))
  fail('12 priority entrypoints or seven indirect identity gaps changed');
 const fog=byName.get('public.is_map_fog_published');
 if(fog.markers.direct_auth_uid||fog.markers.direct_auth_jwt||fog.markers.dm_helper||
  fog.markers.campaign_helper||fog.markers.viewer_helper||
  fog.markers.visibility_frame||fog.markers.movement_dispatch||
  byName.get('public.end_map_motion_sessions').markers.direct_session_actor)
  fail('unresolved fog publication/session actor-source marker altered');
 for(let i=0;i<6;i++){
  const x=index.verifiedSourceMatches[i],[schema,name,path]=verified[i];
  const f=byName.get(schema+'.'+name);
  if(!shape(x,['schema','name','repositoryPath','expectedSourceSha256',
   'expectedSourceBytes','checkedByDirectLiveBodyEquality','bodySha256Confirmed',
   'individualAuthorizationApproved'])||
   x.schema!==schema||x.name!==name||x.repositoryPath!==path||
   x.expectedSourceSha256!==f.bodySha256||x.expectedSourceBytes!==f.bodyBytes||
   x.checkedByDirectLiveBodyEquality!==true||x.bodySha256Confirmed!==true||
   x.individualAuthorizationApproved!==false)
   fail('verified live SQL parity changed');
  const source=extractR103FunctionSource(readFileSync(join(root,path),'utf8'),schema,name);
  if(Buffer.byteLength(source,'utf8')!==f.bodyBytes||sha(source)!==f.bodySha256)
   fail('Git function SQL no longer SHA-256-identical to live function');
 }
 if(!same(matrix,read(root,exactFiles.testMatrix))||
  !shape(matrix,['schema','workPackage','decision','providerProjectRef',
   'scenarioCount','hostPrecondition','note','cases','allHostedCasesExecuted',
   'authorizationAccepted'])||
  matrix.schema!==1||matrix.workPackage!=='B10-R18-103'||matrix.decision!=='NO_GO'||
  matrix.providerProjectRef!=='bgydsamxypjslergfpla'||
  matrix.scenarioCount!==17||matrix.cases?.length!==17||
  matrix.allHostedCasesExecuted!==false||matrix.authorizationAccepted!==false)
  fail('signed QA case matrix falsely completed');
 const seen=new Set();
 for(const x of matrix.cases){
  if(!shape(x,['id','rpc','scenario','expectedPolicy','status',
   'signedAccountsExercised','privateSqlExecuted'])||
   !/^[A-Z]+-[0-9]{2}$/.test(x.id)||seen.has(x.id)||
   typeof x.rpc!=='string'||x.rpc.length<5||
   typeof x.scenario!=='string'||x.scenario.length<30||
   typeof x.expectedPolicy!=='string'||x.expectedPolicy.length<25||
   x.status!=='NOT_RUN'||x.signedAccountsExercised!==false||
   x.privateSqlExecuted!==false)fail('invalid or claimed signed test');
  seen.add(x.id);
 }
 const older=validateR102PrivilegedRpc(read(root,PREV+'manifest.json'),
  read(root,PREV+'catalog-index.json'),read(root,PREV+'indirect-auth-review.json'),
  {repoRoot:root});
 if(older.decision!=='NO_GO'||older.advisorAndCatalogFunctionsReconciled!==67||
  older.functionAuthorizationReviewed!==false)
  fail('R102 privilege warning/source review status changed');
 return Object.freeze({
  workPackage:'B10-R18-103',decision:'NO_GO',
  liveFunctionSha256Fingerprints:20,exactGitSourceBodiesRechecked:6,
  unresolvedFogPublicationPolicy:true,withoutDirectIdentityTokens:7,
  plannedSignedAuthorizationCases:17,executedSignedAuthorizationCases:0,
  historicalRecoveryCompleted:false,qaSqlApplied:false,
  privilegedRpcSecurityApproved:false,productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('offline-only, no arguments');
  process.stdout.write(JSON.stringify(validateR103Source(
   read(ROOT,BASE+'manifest.json'),read(ROOT,BASE+'metadata-index.json'),
   read(ROOT,BASE+'signed-authorization-matrix.json')),null,2)+'\n');
 }catch{
  process.stderr.write('R103 LIVE RPC NO-GO: source verification rejected.\n');
  process.exitCode=1;
 }
}
