/**
 * B10-R18-100 immutable NO_GO-only static source receipt.
 * This does NOT perform or attest the operator-local QA SQL dry run.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR99Source} from './validate-world-v2-r18-99-source.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const RECEIPT='staging/world-v2-b10-r18-100-qa-only-preflight/manifest.json';
const PREV='staging/world-v2-b10-r18-99-private-attestation/manifest.json';
const fail=x=>{throw Error('R100 SOURCE NO-GO: '+x)};
const exact=(a,b)=>a&&typeof a==='object'&&!Array.isArray(a)&&
 Object.keys(a).length===Object.keys(b).length&&
 Object.keys(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);
export function validateR100Source(m,{repoRoot=ROOT}={}){
 if(!m||Object.keys(m).sort().join(',')!==
  'artifacts,decision,gates,observedDateLocal,original,parentPr,parentSha,qa,schema,scope,unchanged,workPackage'||
  m.schema!==1||m.workPackage!=='B10-R18-100'||m.decision!=='NO_GO'||
  m.parentPr!==201||
  m.parentSha!=='890be220775dd0fe60be927c05937a25a371cda8'||
  m.observedDateLocal!=='2026-11-17'||
  m.scope!=='PRIVATE_QA_ONLY_83_HISTORY_MIRROR_AND_PINNED_DRY_RUN_PREPARATION')
  fail('R18-100 parent or source-only release state changed');
 const original={projectRef:'lwhwgqaunxbmvyndswze',status:'ACTIVE_HEALTHY',
  historicalMigrationCount:83,sourceBodiesRecoveredByOperator:false};
 const qa={projectRef:'bgydsamxypjslergfpla',status:'ACTIVE_HEALTHY',
  registeredMigrations:0,publicApplicationTables:0,
  previewVercelProjectId:'prj_49bkFS9Ti4FoPa38LjNNxjgEaZwX',previewDeployments:0};
 const artifacts={validator:'scripts/release/validate-world-v2-r18-100-qa-workspace.mjs',
  runner:'scripts/release/run-world-v2-r18-100-qa-dry-run.mjs',
  sourceValidator:'scripts/release/validate-world-v2-r18-100-source.mjs',
  tests:'tests/world-v2-r18-100-qa-workspace.test.mjs',
  runbook:'docs/testing/world-v2-r18-100-qa-only-bootstrap-preflight-2026-11-17.md',
  expectedOriginalSqlFiles:83,pendingSqlFilesExcluded:8,
  cliVersion:'2.81.3',allowedDryRunCommand:'db push --dry-run --linked'};
 const gateNames=['operatorPrivate83BodyRecoveryCompleted','originalCaptureCrosschecked',
  'originalSqlSecurityReviewCompleted','qaWorkspaceSourceExactPrepared',
  'qaLinkedRefIndependentlyRechecked','qaDryRunPerformed',
  'qaOriginal83BootstrapApproved','qaOriginal83SqlInstalled',
  'qaPendingEightInstalled','qaAuthenticationAndMultiplayerVerified',
  'productionReleaseAuthorized'];
 const unchangedNames=['originalSqlUnchanged','qaSqlUnchanged',
  'existingVercelConfigUnchanged','qaVercelUndeployed','privateBodiesNotCommitted',
  'credentialsNotCommitted','noPaidResource','noMerge','noProductionDeploy'];
 const bool=(obj,names,v)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.keys(obj).length===names.length&&names.every(k=>Object.hasOwn(obj,k)&&obj[k]===v);
 if(!exact(m.original,original)||!exact(m.qa,qa)||
  !exact(m.artifacts,artifacts)||!bool(m.gates,gateNames,false)||
  !bool(m.unchanged,unchangedNames,true))
  fail('unsupported live source or release success flag');
 const previous=JSON.parse(readFileSync(join(resolve(repoRoot),PREV),'utf8'));
 const r99=validateR99Source(previous,{repoRoot});
 if(r99.decision!=='NO_GO'||previous.qa.registeredMigrations!==0||
  previous.evidence.actualAuthCliFetchCompleted!==false||
  previous.safeguards.productionReleaseAuthorized!==false)
  fail('previous historical recovery NO_GO seal changed');
 return Object.freeze({workPackage:'B10-R18-100',decision:'NO_GO',
  sourceHistoryCount:83,qaHistoryCount:0,
  isolatedQaMirrorPreflightStaged:true,
  privateHistoricalRecoveryPerformed:false,qaDryRunPerformed:false,
  qaSqlApplied:false,productionReleaseAuthorized:false});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('not an interactive/release command');
  const report=validateR100Source(JSON.parse(readFileSync(join(ROOT,RECEIPT),'utf8')));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch{
  process.stderr.write('R100 SOURCE NO-GO: source-only evidence rejected.\n');
  process.exitCode=1;
 }
}
