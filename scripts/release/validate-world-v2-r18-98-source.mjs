/**
 * R18-98 immutable SOURCE-ONLY receipt. Does not authenticate a CLI session
 * or verify operator-local recovered SQL. NEVER authorizes QA/production SQL.
 */
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR97QaBootstrap} from './validate-world-v2-r18-97-qa-bootstrap.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const RECEIPT='staging/world-v2-b10-r18-98-private-history/manifest.json';
const R97='staging/world-v2-b10-r18-97-qa-schema-preflight/manifest.json';
const fail=s=>{throw Error('R98 SOURCE NO-GO: '+s)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=(x,expected)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===expected.length&&expected.every(k=>Object.hasOwn(x,k));
const exactly=(value,expected)=>keys(value,Object.keys(expected))&&same(value,expected);
const flags=(o,want)=>o&&Object.values(o).every(v=>v===want);
export function validateR98Source(m,{repoRoot=ROOT}={}){
 if(!keys(m,['schema','workPackage','decision','parentPr','parentSha',
  'observedDateLocal','scope','source','qa','artifacts','gates','unchanged'])||
  m.schema!==1||m.workPackage!=='B10-R18-98'||m.decision!=='NO_GO'||
  m.parentPr!==199||
  m.parentSha!=='f0c1d8e957a38be014caa72b6a483cae7522c3c8'||
  m.observedDateLocal!=='2026-11-17'||
  m.scope!=='OPERATOR_PRIVATE_PINNED_HISTORICAL_FETCH_SOURCE_ONLY')
  fail('source receipt parent/identity mismatch');
 const original={
  projectRef:'lwhwgqaunxbmvyndswze',status:'ACTIVE_HEALTHY',
  readOnlyMigrationRows:83,readOnlySqlBodyDigestsMatched:83,
  readOnlySqlDigestMismatches:0,latestMigration:'20261109171247',
  authoritativeFrozenDigests:'staging/world-v2-b10-r18-08-remote-history-content-hashes.json',
  rawSqlBodiesExposedToChat:false,rawSqlBodiesCommittedToGit:false
 };
 const qa={
  projectRef:'bgydsamxypjslergfpla',status:'ACTIVE_HEALTHY',
  registeredMigrations:0,applicationTables:0,
  migrationApplied:false,productionDataImported:false
 };
 const artifacts={
  privateValidator:'scripts/release/validate-world-v2-r18-98-private-history.mjs',
  privateFetchRunner:'scripts/release/run-world-v2-r18-98-private-history-fetch.mjs',
  sourceVerifier:'scripts/release/validate-world-v2-r18-98-source.mjs',
  tests:'tests/world-v2-r18-98-private-history.test.mjs',
  runbook:'docs/testing/world-v2-r18-98-operator-private-history-2026-11-17.md',
  importedCliVersion:'2.81.3',originalHistoricalFilesRequired:83,
  allowedRemoteCommand:'migration fetch --linked',
  pendingEightFilesFetchedOrApplied:false,historicalSqlBodyFilesInRepository:false
 };
 const gateNames=[
  'operatorAuthenticatedCliFetchCompleted','original83PrivateFilesMD5Verified',
  'privateWorkspaceInspectedForSecretsAndData',
  'sourceExactQaOnlyWorkspacePrepared','qaOnlyLinkedDryRunVerified',
  'qaBootstrapReviewedApproved','qaSqlApplied','qaAuthConfigured',
  'signedHostedDMAndPlayersAccepted','productionReleaseAuthorized'
 ];
 const unchangedNames=[
  'productionSqlUnchanged','qaSqlUnchanged',
  'originalVercelConfigUnchanged','qaVercelUndeployed',
  'noPaidInfrastructure','noMerges','noProductionDeploy'
 ];
 if(!exactly(m.source,original)||!exactly(m.qa,qa)||
  !exactly(m.artifacts,artifacts)||
  !keys(m.gates,gateNames)||!flags(m.gates,false)||
  !keys(m.unchanged,unchangedNames)||!flags(m.unchanged,true))
  fail('live observation, private fetch, sql or release gate misstated');
 const prior=JSON.parse(readFileSync(join(resolve(repoRoot),R97),'utf8'));
 const r97=validateR97QaBootstrap(prior,{repoRoot:resolve(repoRoot)});
 if(r97.decision!=='NO_GO'||r97.historicalMetadataMatched!==83||
  prior.requiredGates.recoverOriginal83SqlBodies!==false||
  prior.qa.registeredMigrations!==0||
  prior.original.projectRef!==m.source.projectRef||
  prior.qa.projectRef!==m.qa.projectRef)
  fail('frozen R97 incomplete bootstrap gate does not match');
 return Object.freeze({workPackage:'B10-R18-98',decision:'NO_GO',
  originalSourceMd5RowsMatched:83,privateFetchRunnerStaged:true,
  historicalSqlBodiesRecoveredByChatGPT:false,
  qaBootstrapSqlApplied:false,operatorAuthenticatedFetchAttested:false,
  productionReleaseAuthorized:false});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('no arguments, secrets or remote calls allowed');
  const result=validateR98Source(JSON.parse(readFileSync(join(ROOT,RECEIPT),'utf8')));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('R98 SOURCE NO-GO: inspect source-only receipt locally.\n');
  process.exitCode=1;
 }
}
