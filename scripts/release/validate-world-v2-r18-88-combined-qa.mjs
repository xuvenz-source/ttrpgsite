/**
 * B10-R18-88. OFFLINE, READ-ONLY combined QA source-seal release gate.
 * This executable can ONLY return NO_GO. It does not fetch official CLI
 * history, sign participants, install SQL or authorize any deployment.
 * Requires BOTH the original R48 83+8 narrow package proof and immutable
 * R57/R77 private function install/inverse identities and exact order.
 */
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR48NarrowPackage} from './validate-world-v2-r18-48-narrow-package.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const MANIFEST='staging/world-v2-b10-r18-88-combined-qa/manifest.json';
const PARENT='26e6887f223653f2426f87145c3a86828ec41c1d';
const BRANCH='stage/world-v2-b10-r18-88-combined-qa-release-preflight-2026-11-15';
const PROJECT='lwhwgqaunxbmvyndswze';
const ORIGINAL_FOG='ee3356af321fec1a3e167a75c6245e86';
const ORIGINAL_RAY='a9fc198168c29fd5d80041b05337017e';
const COMBINED_FOG='f37c8d13e8d48bea123b4c811ae6de4d';
const installations=[
 ['supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql',
 '6adf9a0b43e833c1b7f13befaca458b14781f74b','sealed_post_83_plus_8_candidate_only'],
 ['supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql',
 '06a0e142608dcd53aefe739c451230ac906c51df','sealed_post_83_plus_8_ray_inline_candidate_only']
];
const inverses=[
 ['supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql',
 '6320a8a6a0e61ec8127891576a81f025b4c17027','sealed_post_83_plus_8_ray_inline_rollback_only'],
 ['supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql',
 '66745cc8305b8ff11cfac58a18c3864d2052ae3e','sealed_post_83_plus_8_rollback_only']
];
const PENDING=[
 '20261111023204','20261113021005','20261113021007','20261113021010',
 '20261113021012','20261113021020','20261113021022','20261113024116'
];
const fail=(s)=>{throw Error('R88 COMBINED QA NO-GO: '+s)};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const blob=s=>{const b=Buffer.from(s,'utf8');return createHash('sha1')
 .update('blob '+b.length+'\0').update(b).digest('hex')};
const noAdditional=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));
const expectFalse=(obj,keys)=>keys.every(k=>obj?.[k]===false);

export function validateR88CombinedQa({repoRoot=ROOT,manifest}={}){
 const root=realpathSync(resolve(repoRoot));
 const m=manifest??JSON.parse(readFileSync(join(root,MANIFEST),'utf8'));
 if(!m||m.schema!==1||m.workPackage!=='B10-R18-88'||
  m.kind!=='READ_ONLY_SEALED_COMBINED_QA_CANDIDATE_PREFLIGHT'||
  m.decision!=='NO_GO'||m.candidateReadyToApply!==false||
  m.productionReleaseAuthorized!==false)
  fail('unexpected source manifest, no-go status or release authorization');
 const source=m.source;
 if(!source||source.repo!=='xuvenz-source/ttrpgsite'||
  source.parentPr!==189||source.parentSha!==PARENT||
  source.headBranch!==BRANCH||source.sourceSealed!==true||
  source.runtimeFilesChanged!==false||source.rootMigrationsChanged!==false||
  source.scope!=='tests + offline verification + source-only QA planning')
  fail('source identity or scope changed');
 const readOnly=m.project;
 if(!readOnly||readOnly.projectRef!==PROJECT||
  readOnly.readOnlyObservedDate!=='2026-11-15'||
  readOnly.liveRegisteredMigrations!==83||
  readOnly.liveNewestVersion!=='20261109171247'||
  readOnly.liveFogFunctionMd5!==ORIGINAL_FOG||
  readOnly.liveRayFunctionMd5!==ORIGINAL_RAY||
  readOnly.liveFogAcl!=='{postgres=X/postgres}'||
  readOnly.liveRayAcl!==null||
  readOnly.anonPrivateSchemaUsage!==false||
  readOnly.authenticatedPrivateSchemaUsage!==false||
  readOnly.activeSessions!==0||
  readOnly.waitingLocksAtObservation!==0)
  fail('read-only preinstall observation must remain exactly NO_GO');
 const historic=validateR48NarrowPackage({repoRoot:root});
 if(historic.decision!=='NO_GO'||historic.pendingWithR05!==8)
  fail('R48 sealed original eight migrations are no longer intact');
 const migration=m.pendingMigrations;
 const r48=JSON.parse(readFileSync(join(root,
  'staging/world-v2-b10-r18-48-narrow-pending/manifest.json'),'utf8'));
 if(!migration||migration.expectedTotalAfterPrerequisites!==91||
   migration.expectedNewCount!==8||
   migration.requiredFirst!==PENDING[0]||
   migration.requiredLast!==PENDING[7]||
   !eq(migration.versions,PENDING)||
   migration.stagedManifest!=='staging/world-v2-b10-r18-48-narrow-pending/manifest.json'||
   migration.requiredOriginalR05GitBlob!=='f4e296725c09055685321726cbe4bc6e09dbce5a'||
   !eq(migration.excludedUnapprovedVersions,['20261113021015','20261113021017'])||
   migration.officialLinkedCliVersion!=='2.81.3'||
   migration.officialLinkedHistoryFetchAndDryRunVerified!==false||
   migration.mustNotUseDefaultV3CliTarget!==true||
   migration.requiresPhysicalApplyBeforeCandidate!==true||
   r48.expectedPendingTotalWithR05!==8||
   !eq(r48.pending.map(x=>x.filename.slice(0,14)),PENDING.slice(1)))
  fail('official 83+8 history, source seal or pinned CLI blocker changed');
 const c=m.candidate;
 if(!c||c.installOrder?.length!==2||c.rollbackOrder?.length!==2)
  fail('missing original install and independent inverse chain');
 for(const [index,expected] of installations.entries()){
  const [path,sha,guard]=expected,item=c.installOrder[index];
  const content=readFileSync(join(root,path),'utf8');
  if(!noAdditional(item,['path','gitBlobSha','guard'])||
    item.path!==path||item.gitBlobSha!==sha||item.guard!==guard||
    blob(content)!==sha||!content.includes(guard)||
    !content.includes('83')||!content.includes('91'))
   fail('original sealed install identity/order/guard drift '+path);
 }
 for(const [index,expected] of inverses.entries()){
  const [path,sha,guard]=expected,item=c.rollbackOrder[index];
  const content=readFileSync(join(root,path),'utf8');
  if(!noAdditional(item,['path','gitBlobSha','guard'])||
    item.path!==path||item.gitBlobSha!==sha||item.guard!==guard||
    blob(content)!==sha||!content.includes(guard))
   fail('original sealed inverse identity/order/guard drift '+path);
 }
 if(c.atomicProcedure!=='ONE explicit transaction after separate operator review; do not auto-commit'||
  c.dryRunOnlyFixture!=='tests/world-v2-b10-postgres/r88-combined-savepoint-rollback.sql'||
  c.rootMigrationsExcluded!==true||c.anyPublicGrantChange!==false||
  c.synchronousPrivateSightPreserved!==true||
  c.originalCanonicalCollisionPreserved!==true||
  c.originalFogMd5!==ORIGINAL_FOG||c.originalRayMd5!==ORIGINAL_RAY||
  c.newFogMd5!==COMBINED_FOG||c.canarySqlApplied!==false||
  c.rollbackTestedOnlyOnDisposableFixture!==true)
  fail('combined canary source or transaction plan misrepresents release status');
 const fixture=readFileSync(join(root,c.dryRunOnlyFixture),'utf8');
 const sourceFixture=readFileSync(join(root,
  'tests/world-v2-b10-postgres/r86-full-trigger-eight-viewer-candidate-matrix.sql'),'utf8');
 const runner=readFileSync(join(root,
  'tests/world-v2-b10-postgres/rehearse-r05.sh'),'utf8');
 for(const item of [...installations,...inverses])
  if(!fixture.includes('\\i '+item[0]))
   if(item[0].includes('rollback.sql'))continue;else fail('fixture install lost '+item[0]);
 if(!fixture.includes('SAVEPOINT r88_partial;')||
   !fixture.includes('SAVEPOINT r88_combined;')||
   !fixture.includes('ROLLBACK TO SAVEPOINT r88_partial;')||
   !fixture.includes('ROLLBACK TO SAVEPOINT r88_combined;')||
   !fixture.includes('R88-09 partial-failure and full combined rollback both restore exactly')||
   !sourceFixture.includes('\\i tests/world-v2-b10-postgres/r88-combined-savepoint-rollback.sql')||
   !runner.includes('r05_psql -v r84_full=1 -v r86_matrix=1 -v r88_atomic=1 -f'))
  fail('isolated, fail-closed local PostgreSQL 17 rollback rehearsal removed');
 const gates=m.requiredGates;
 const required=[
 'authenticatedPinnedOfficialLinkedCli83Plus8',
 'fetchedHistoricalSqlBodiesMatch83',
 'independentMultiuserDmP1PassiveP2',
 'authenticatedQaPreviewWithExactBuild',
 'wallCollisionRevocationFogAndInstantRegrab',
 'browserLatencyP95AndObserverConvergence',
 'freeTierRamCpuSwapLocksUnderLoad',
 'separateOperatorApproval','productionPermission'];
 if(!noAdditional(gates,required)||!expectFalse(gates,required))
  fail('unverified actor, migration, free-tier or release gate falsely approved');
 const d=m.deployment,flags=[
  'permanentQaPreviewChanged','productionChanged','supabaseWritePerformed',
  'migrationApplied','vercelEnvironmentChanged','runtimeFlagsEnabled'
 ];
 if(!d||!expectFalse(d,flags)||d.releaseState!=='BLOCKED'||
    d.qaTargetBuild!==null)
  fail('staging-only no-deployment rule was relaxed');
 return Object.freeze({
  workPackage:'B10-R18-88',decision:'NO_GO',safeToApply:false,
  project:PROJECT,registeredMigrations:83,requiredMigrations:91,
  officialLinkedCliVerified:false,combinedSourcesSourceSealed:4,
  originalPrivateAclIntact:true,transactionalRollbackRehearsalStaged:true,
  signedMultiplayerQaAccepted:false,freeTierLoadAccepted:false,
  previewDeployed:false,productionDeployed:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(validateR88CombinedQa(),null,2)+'\n')}
 catch(e){process.stderr.write(e.message+'\n');process.exitCode=1}
}
