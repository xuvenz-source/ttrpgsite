/**
 * B10-R18-112 — offline-only metadata/confirmed Git-source authorization
 * edge reconciliation. This is neither proof of runtime permissions
 * nor independent review of the private 83 SQL files.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PATH='staging/world-v2-b10-r18-112-indirect-privilege-chains/manifest.json';
const R102='staging/world-v2-b10-r18-102-privileged-rpc-audit/catalog-index.json';
const R103='staging/world-v2-b10-r18-103-live-source-parity/metadata-index.json';
const R110='staging/world-v2-b10-r18-110-live-security-gate/manifest.json';
const fail=()=>{throw Error('R112 PRIVILEGE CHAIN NO-GO: catalog or Git source mismatch')};
const read=(root,path)=>JSON.parse(readFileSync(join(root,path),'utf8'));
const hash=(value)=>createHash('sha256').update(value,'utf8').digest('hex');
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const EDGES=Object.freeze([
 ['get_campaign_sheet_inventory',['public.can_edit_campaign_sheet_inventory']],
 ['get_dm_map_npc_values',['public.is_campaign_dm']],
 ['get_npc_token_values',['public.is_campaign_dm']],
 ['is_map_fog_published',[]],
 ['patch_campaign_sheet_noninventory',['public.can_edit_campaign_sheet']],
 ['preview_map_motion',['forge_visibility.dispatch_movement_preview']],
 ['publish_map_environment',['public.is_campaign_dm','forge_visibility.bump_tick']]
]);
const HELPER_EDGES=Object.freeze([
 ['public.can_edit_campaign_sheet',['public.is_campaign_dm'],true,false,true,
  '5a8fed2bdc8427c884f89440c0eebe03',790],
 ['public.can_edit_campaign_sheet_inventory',['public.can_edit_campaign_sheet'],false,false,true,
  '0f45ba1e88b16997f82d67110252be9c',427],
 ['public.can_view_campaign_map',[],true,true,true,'cf708e7eaa9f2a4493e94bcc1fb63d98',448],
 ['public.is_campaign_dm',[],true,true,true,'a9dc5287aa552c0d39c3793daadafb19',148],
 ['forge_visibility.bump_tick',[],false,false,false,'af1bae044976db69c23d9765e7533b03',475],
 ['forge_visibility.dispatch_movement_preview',['public.is_campaign_dm','public.can_view_campaign_map'],
  true,false,false,'59ea9ae8fe24b401bda9536f35606c99',6397]
]);
const EXPECTED_ANCHORS=Object.freeze([
 {name:'get_dm_map_npc_values',
  repoPath:'supabase/migrations/20261109000500_dm_map_npc_protected_columns.sql',
  liveSourceSha256:'5e5c0657353a54f4812ee5b547e4575bf666f2e8c72a3fe1b6918cfff8293de5',
  bytes:263,requiredSourceGuards:['joins_map_and_campaign','dm_helper','npc_only','map_scoped']},
 {name:'dispatch_movement_preview',
  repoPath:'supabase/migrations/20261108091818_observer_and_per_viewer_visibility_release_20261108.sql',
  liveSourceSha256:'b897f48495a9a8add788741b64bf4a52c9cd5b9c1969d6e6dd50dadd8965063c',
  bytes:6397,requiredSourceGuards:['direct_identity','map_viewer_permission','wall_override_dm','token_owner_and_visibility']}
]);
export function extractR112GitFunctionBody(sql,schema,name){
 if(typeof sql!=='string'||!['public','forge_visibility'].includes(schema)||
    !/^[a-z_][a-z_0-9]*$/.test(name))fail();
 const anchor=new RegExp('\\bCREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+'+
  schema+'\\.'+name+'\\s*\\(','gi');
 const matches=[...sql.matchAll(anchor)];
 if(matches.length!==1)fail();
 const after=sql.slice(matches[0].index+matches[0][0].length);
 const body=/\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;/i.exec(after);
 if(!body)fail();
 return body[2];
}
const normalizeName=s=>s.schema+'.'+s.name;
export function validateR112IndirectChain(manifest,{repoRoot=ROOT}={}){
 const root=resolve(repoRoot);
 if(manifest?.schema!==1||manifest.workPackage!=='B10-R18-112'||
   manifest.decision!=='NO_GO'||manifest.date!=='2026-11-18'||
   manifest.source!=='READ_ONLY_ORIGINAL_PG_PROC_BOOLEAN_HELPER_CANDIDATES_AND_PRIOR_LIVE_EXACT_GIT_PARITY'||
   manifest.originalProjectRef!=='lwhwgqaunxbmvyndswze'||
   manifest.qaProjectRef!=='bgydsamxypjslergfpla'||
   manifest.registeredOriginalMigrations!==83||manifest.registeredQaMigrations!==0||
   manifest.sourceProjectSqlModified!==false||manifest.qaProjectSqlModified!==false)fail();
 const r102=read(root,R102),r103=read(root,R103),r110=read(root,R110);
 if(r102.totals?.authenticatedCallable!==67||
   r102.totals?.functionsWithoutDirectAuthIdentity!==7||
   r103.totals?.sourceParityMatches!==6||
   r110.catalog?.publicCallableDefinersWithoutDirectAuthUidText!==7)fail();
 const observed=r110.catalog.sevenPrivilegeReviewTargets;
 if(!Array.isArray(manifest.privilegedFunctions)||manifest.privilegedFunctions.length!==7||
    !exact(manifest.privilegedFunctions.map(f=>f.name),EDGES.map(x=>x[0]))||
    !exact(observed.map(x=>x.name),EDGES.map(x=>x[0])))fail();
 for(let i=0;i<7;i++){
  const f=manifest.privilegedFunctions[i],e=observed[i];
  const r=r102.functions.find(x=>x.schema==='public'&&x.name===f.name);
  const r103f=r103.functions.find(x=>x.schema==='public'&&x.name===f.name);
  if(!r||!r103f||f.sourceBytes!==e.bytes||f.sourceMd5!==e.source_md5||
     f.sourceBytes!==r103f.bodyBytes||!r.securityDefiner||
     r.markers?.directAuthIdentity!==false||
     f.authenticatedCallable!==true||f.anonymousCallable!==false||
     f.securityDefiner!==true||f.ownerRole!=='postgres'||
     f.configuredEmptySearchPath!==true||f.directAuthUidText!==false||
     !exact(f.helperCandidateReferences,EDGES[i][1])||
     f.authorizationApproved!==false||f.signedCrossAccountTestsPassed!==false)fail();
 }
 if(!Array.isArray(manifest.helpers)||manifest.helpers.length!==6)fail();
 const validNames=new Set(manifest.helpers.map(normalizeName));
 for(let i=0;i<HELPER_EDGES.length;i++){
  const h=manifest.helpers[i],e=HELPER_EDGES[i];
  if(normalizeName(h)!==e[0]||h.securityDefiner!==true||
     h.configuredEmptySearchPath!==true||
     !exact(h.helperCandidateReferences,e[1])||
     h.directAuthUidText!==e[2]||
     h.authenticatedCallable!==e[3]||h.authenticatedSchemaUsage!==e[4]||
     h.sourceMd5!==e[5]||h.sourceBytes!==e[6]||
     h.authorizationApproved!==false||!h.helperCandidateReferences.every(x=>validNames.has(x)))fail();
 }
 for(const [,deps] of EDGES)if(!deps.every(x=>validNames.has(x)))fail();
 if(!exact(manifest.repositorySourceAnchors,EXPECTED_ANCHORS))fail();
 const guards=[
  [/\bFROM\s+public\.map_tokens\s+t\b/i,
   /\bJOIN\s+public\.battle_maps\s+m\s+ON\s+m\.id\s*=\s*t\.map_id\s+AND\s+m\.campaign_id\s*=\s*t\.campaign_id\b/i,
   /\bt\.character_id\s+IS\s+NULL\b/i,
   /\bt\.map_id\s*=\s*p_map\b/i,
   /\bpublic\.is_campaign_dm\s*\(\s*m\.campaign_id\s*\)/i],
  [/\bactor\s+uuid\s*:=\s*auth\.uid\s*\(\s*\)/i,
   /\bnot\s+public\.can_view_campaign_map\s*\(\s*m\.campaign_id\s*,\s*p_map\s*\)/i,
   /\bif\s+p_ignore_collision\s+and\s+not\s+dm\s+then\s+return\s+false\b/i,
   /\btoken\.owner_id\s+is\s+distinct\s+from\s+actor\b/i]
 ];
 for(let i=0;i<EXPECTED_ANCHORS.length;i++){
  const a=EXPECTED_ANCHORS[i];
  const sql=readFileSync(join(root,a.repoPath),'utf8');
  const schema=i===0?'public':'forge_visibility';
  const body=extractR112GitFunctionBody(sql,schema,a.name);
  const bytes=Buffer.byteLength(body,'utf8');
  if(bytes!==a.bytes||hash(body)!==a.liveSourceSha256||
     guards[i].some(re=>!re.test(body)))fail();
  const parity=r103.functions.find(x=>x.schema===schema&&x.name===a.name);
  const verified=r103.verifiedSourceMatches.find(x=>x.schema===schema&&x.name===a.name);
  if(!parity||!verified||!verified.checkedByDirectLiveBodyEquality||
     verified.expectedSourceSha256!==hash(body)||
     verified.expectedSourceBytes!==bytes||parity.bodySha256!==hash(body))fail();
 }
 const k=manifest.knownVulnerability;
 if(!exact(k,{
  rpc:'is_map_fog_published',historicalSourceFogStatusOracle:true,
  sourceHashMatchedPrior:true,disposablePg17Reproduced:true,
  r104CandidateBlobSha:'c84d7cf8b0958621f11ec273cb36361e2501a77f',
  candidateAppliedToOriginal:false,candidateAppliedToQa:false,signedHostedCasesExecuted:0
 }))fail();
 const needed=['NPC-01','NPC-02','SHEET-01','SHEET-02','MOVE-01','MOVE-02','ENV-01','FOG-01'];
 const matrix=read(root,'staging/world-v2-b10-r18-103-live-source-parity/signed-authorization-matrix.json');
 if(!exact(manifest.requiredSignedCases,needed)||
    needed.some(id=>!matrix.cases.some(c=>c.id===id&&c.status==='NOT_RUN'))||
    matrix.authorizationAccepted!==false)fail();
 if(!exact(manifest.gate,{
  sourceMarkersAreHeuristics:true,exactTwoGitSourceBodyParityFromR103:true,
  private83SqlHumanAuditComplete:false,privilegedSevenSemanticReviewApproved:false,
  independentOperatorLoginAttested:false,hostedSignedAuthAccepted:false,
  qa83HistoryDryRunApproved:false,qaSchemaInstallAuthorized:false,
  productionReleaseAuthorized:false,noSQLOrCredentialsExported:true
 }))fail();
 return Object.freeze({
  workPackage:'B10-R18-112',decision:'NO_GO',
  privilegedCallersTraced:7,nonFogHelperCallers:6,
  knownFogStatusLeakStillBlocked:true,
  exactGitSourceBodiesGuardsCrossChecked:2,
  priorLiveBodyParityStillAnchored:true,
  signedQaCasesNotRun:8,
  independentPrivateSqlReviewApproved:false,qaSchemaInstallAuthorized:false,
  productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail();
  process.stdout.write(JSON.stringify(validateR112IndirectChain(read(ROOT,PATH)),null,2)+'\n');
 }catch{
  process.stderr.write('R112 PRIVILEGE CHAIN NO-GO: source metadata mismatch, no SQL change made.\n');
  process.exitCode=1;
 }
}
