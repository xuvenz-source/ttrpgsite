/**
 * B10-R18-97. No-network, read-only source checks for an INCOMPLETE QA
 * schema bootstrap. A historical provider observation cannot authenticate
 * an actual CLI fetch or authorise SQL execution. This ALWAYS returns NO_GO.
 */
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR48NarrowPackage} from './validate-world-v2-r18-48-narrow-package.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PATH='staging/world-v2-b10-r18-97-qa-schema-preflight/manifest.json';
const PREV='staging/world-v2-b10-r18-96-free-qa-provisioning/manifest.json';
const fail=x=>{throw Error('R97 QA BOOTSTRAP NO-GO: '+x);};
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const allFalse=o=>Object.values(o).every(v=>v===false);
const INVALID=[
 '20261106_spellcasting.sql','20261106_token_reference_codes.sql',
 '20261106_token_status_effects.sql','20261106_ui_scale_preferences.sql',
 '20261106_visual_macros.sql','20261106_weapon_attack_cards.sql'
];
const PENDING=[
 '20261113021005_r47_capture_original_sources.sql',
 '20261113021007_r47_wall_edge_clearance.sql',
 '20261113021010_r47_cross_map_collision_guards.sql',
 '20261113021012_r47_campaign_affinity.sql',
 '20261113021020_r47_atomic_finalize_rpc.sql',
 '20261113021022_r47_blocked_terminal_semantics.sql',
 '20261113024116_r48_narrow_release_seal.sql'
];

export function validateR97QaBootstrap(m,{repoRoot=ROOT}={}){
 const root=resolve(repoRoot);
 if(!exact(m,['schema','workPackage','decision','sourceOnly','parentPr',
   'parentSha','observedDateLocal','scope','original','qa','repository',
   'sealedPending','requiredGates','changes'])||
   m.schema!==1||m.workPackage!=='B10-R18-97'||m.decision!=='NO_GO'||
   m.sourceOnly!==true||m.parentPr!==198||
   m.parentSha!=='5d51d1b1e64179a0a4944e54e06b68cd6db900ea'||
   m.observedDateLocal!=='2026-11-16'||
   m.scope!=='READ_ONLY_ORIGINAL_HISTORY_PARITY_AND_QA_BOOTSTRAP_BLOCKERS')
  fail('parent or source-only release state differs');
 const previous=JSON.parse(readFileSync(join(root,PREV),'utf8'));
 const frozen=JSON.parse(readFileSync(join(root,
  'staging/world-v2-b10-r18-08-remote-history-content-hashes.json'),'utf8'));
 const original=m.original,qa=m.qa,r=m.repository,p=m.sealedPending;
 if(previous.qaSupabase.projectRef!=='bgydsamxypjslergfpla'||
    previous.qaSupabase.registeredMigrations!==0||
    previous.production.supabaseRef!=='lwhwgqaunxbmvyndswze')
  fail('prior provisioned QA identity has changed');
 if(!exact(original,['projectRef','status','registeredMigrations','latestMigration',
  'frozenHistoryFile','liveSelectOnlyMatchedDigests','liveSelectOnlyMismatchCount',
  'sqlBodiesFetchedToIsolatedWorkspace','cliLinkedFetchExecuted'])||
   original.projectRef!=='lwhwgqaunxbmvyndswze'||original.status!=='ACTIVE_HEALTHY'||
   original.registeredMigrations!==83||original.latestMigration!=='20261109171247'||
   original.frozenHistoryFile!=='staging/world-v2-b10-r18-08-remote-history-content-hashes.json'||
   original.liveSelectOnlyMatchedDigests!==83||original.liveSelectOnlyMismatchCount!==0||
   original.sqlBodiesFetchedToIsolatedWorkspace!==false||
   original.cliLinkedFetchExecuted!==false)
  fail('original historical read-only observation or unperformed CLI altered');
 const historical=frozen.rows;
 if(frozen.originalMigrationVersionCount!==83||frozen.expectedNewestVersion!==
   '20261109171247'||!Array.isArray(historical)||historical.length!==83)
  fail('frozen 83-history source seal changed');
 const versions=new Set();
 for(const row of historical){
  if(!exact(row,['version','name','statement_count','fetched_sql_md5'])||
   !/^\d{14}$/.test(row.version)||!/^[A-Za-z0-9_-]+$/.test(row.name)||
   !Number.isSafeInteger(row.statement_count)||row.statement_count<1||
   !/^[0-9a-f]{32}$/.test(row.fetched_sql_md5)||versions.has(row.version))
   fail('duplicate/malformed frozen historical SQL fingerprint');
  versions.add(row.version);
 }
 if(!exact(qa,['projectRef','status','registeredMigrations','publicApplicationTables',
   'bootstrapSqlApplied','productionDataImported'])||
   qa.projectRef!=='bgydsamxypjslergfpla'||qa.projectRef===original.projectRef||
   qa.status!=='ACTIVE_HEALTHY'||qa.registeredMigrations!==0||
   qa.publicApplicationTables!==0||
   qa.bootstrapSqlApplied!==false||qa.productionDataImported!==false)
  fail('isolated empty QA backend no longer matches snapshot');
 if(!exact(r,['rootMigrationDirectory','rootSqlFiles',
   'wellFormedTimestampedSqlFiles','invalidTimestampedSqlFiles',
   'duplicateTimestampVersion','historicalVersionsWithRootFile',
   'originalHistoricalVersionsMissingInRoot',
   'rootTimestampedSqlFilesNotHistorical','originalHistoryBodiesFullyReconstructed',
   'rootDirectorySafeToPush'])||
   r.rootMigrationDirectory!=='supabase/migrations'||r.rootSqlFiles!==62||
   r.wellFormedTimestampedSqlFiles!==56||!same(r.invalidTimestampedSqlFiles,INVALID)||
   r.duplicateTimestampVersion!=='20261109000500'||
   r.historicalVersionsWithRootFile!==20||
   r.originalHistoricalVersionsMissingInRoot!==63||
   r.rootTimestampedSqlFilesNotHistorical!==36||
   r.originalHistoryBodiesFullyReconstructed!==false||
   r.rootDirectorySafeToPush!==false)
  fail('incomplete local migration history was misrepresented');
 const local=readdirSync(join(root,'supabase/migrations'))
  .filter(s=>s.endsWith('.sql'));
 const good=local.filter(s=>/^\d{14}_[A-Za-z0-9_-]+\.sql$/.test(s));
 const bad=local.filter(s=>!good.includes(s)).sort();
 const localVersions=good.map(s=>s.slice(0,14));
 const matches=new Set(localVersions.filter(v=>versions.has(v)));
 const notHist=good.filter(s=>!versions.has(s.slice(0,14)));
 if(local.length!==62||good.length!==56||
   !same(bad,INVALID.slice().sort())||
   localVersions.filter(v=>v==='20261109000500').length!==2||
   matches.size!==20||versions.size-matches.size!==63||notHist.length!==36)
  fail('root migrations changed; this preflight must be rebuilt from live source');
 if(!exact(p,['baselinePath','originalR05','stagedNarrowPending','totalWithR05',
   'candidateR57R77Included','appliedOnQa'])||
   p.baselinePath!=='staging/world-v2-b10-r18-48-narrow-pending/manifest.json'||
   p.originalR05!=='20261111023204_world_v2_b10_integrated_motion.sql'||
   p.stagedNarrowPending!==7||p.totalWithR05!==8||
   p.candidateR57R77Included!==false||p.appliedOnQa!==false)
  fail('pending package identity drift');
 const manifest=JSON.parse(readFileSync(join(root,p.baselinePath),'utf8'));
 if(manifest.releaseDecision!=='NO_GO'||manifest.safeToApply!==false||
   manifest.expectedPendingTotalWithR05!==8||
   !same(manifest.pending?.map(x=>x.filename),PENDING)||
   !same(readdirSync(join(root,manifest.stagedMigrationDirectory))
     .filter(x=>x.endsWith('.sql')).sort(),PENDING.slice().sort())||
   !local.includes(p.originalR05))
  fail('staged narrow source or original R05 missing');
 const r48=validateR48NarrowPackage({repoRoot:root});
 if(r48.decision!=='NO_GO'||r48.pendingWithR05!==8||
   r48.safeToApply!==false)fail('R48 original source seal invalid');
 const gateKeys=['recoverOriginal83SqlBodies','verifyAll83FetchedBodyHashes',
  'verifyNoProductionSecretsOrDataInHistoricalSql','inspectPortabilityAuthRealtimeExtensions',
  'qaScopedWorkspaceSourceAndProjectGuard','independentlyVerifiedQaOnlyDryRun',
  'syntheticPostgresBootstrapRollback','approvedQaOnlySchemaInstall',
  'qaEightPendingSeparateReview','qaOAuthAndSignedMultiplayerAcceptance',
  'productionReleaseAuthorized'];
 const changeKeys=['originalProjectModified','qaDatabaseModified',
  'existingVercelProjectModified','qaVercelDeploymentCreated',
  'paidResourceCreated','productionDeployed'];
 if(!exact(m.requiredGates,gateKeys)||!allFalse(m.requiredGates)||
   !exact(m.changes,changeKeys)||!allFalse(m.changes))
  fail('unverified migration, security or deploy gate marked complete');
 return Object.freeze({workPackage:'B10-R18-97',decision:'NO_GO',
  historicalMetadataMatched:83,completeSqlHistoryAvailable:false,
  safeToPushRepoRoot:false,qaSchemaInstalled:false,releaseAuthorized:false});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('no parameters or remote execution permitted');
  const report=validateR97QaBootstrap(JSON.parse(readFileSync(join(ROOT,PATH),'utf8')));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
