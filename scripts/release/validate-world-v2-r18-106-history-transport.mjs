/**
 * R18-106: exact upstream Supabase CLI v2.81.3 migration-fetch transport
 * contract versus 83 frozen original metadata rows. OFFLINE, never reads
 * original SQL, never connects to either Supabase project or applies SQL.
 *
 * Upstream tag v2.81.3 commit bce705147ae90b9bddd6dfc24986744ced1d97d4
 * git blob cb78c70d8e248bea96831e2156773039129fef13:
 * internal/migration/fetch/fetch.go produces:
 *   fmt.Sprintf("%s_%s.sql", r.Version, r.Name)
 *   strings.Join(r.Statements, ";\n") + ";\n"
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR105IsolatedFogTest}
 from './validate-world-v2-r18-105-isolated-fog-test.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const DIR='staging/world-v2-b10-r18-106-private-history-transport/';
const ORIGINAL='lwhwgqaunxbmvyndswze';
const QA='bgydsamxypjslergfpla';
const fail=msg=>{throw Error('R106 HISTORY TRANSPORT NO-GO: '+msg)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const exact=(o,fields)=>o&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).length===fields.length&&fields.every(x=>Object.hasOwn(o,x));
const read=(root,path)=>JSON.parse(readFileSync(join(root,path),'utf8'));
const gitBlob=(data)=>createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');

const upstream={
 tag:'v2.81.3',commitSha:'bce705147ae90b9bddd6dfc24986744ced1d97d4',
 repository:'supabase/cli',
 sourcePath:'internal/migration/fetch/fetch.go',
 sourceBlobSha:'cb78c70d8e248bea96831e2156773039129fef13',
 outputName:'<version>_<name>.sql',joinSeparator:';\n',finalTerminator:';\n',
 emptyDirectoryBeforeFetch:true,sourceVerifiedByGitHubTag:true,
 claimSignedOperatorSessionVerified:false
};
const history={
 originalProjectRef:ORIGINAL,qaProjectRef:QA,expectedOriginalMigrations:83,
 latestVersion:'20261109171247',
 originalStoredSqlBytes:709936,
 cliReconstructedSqlBytes:710102,
 terminalBytesPerMigration:2,
 frozenR08Path:'staging/world-v2-b10-r18-08-remote-history-content-hashes.json',
 frozenR08BlobSha:'89013c6315f84b5ff226947e83b0cf417f1cb52f',
 frozenR101Path:'staging/world-v2-b10-r18-101-history-risk-audit/metadata-index.json',
 frozenR101BlobSha:'67fdae5b0e151d994c1542d373aeddaafe88f7dc',
 originalSqlRetrievedInThisTask:false,
 qaSqlReplayed:false
};
const safety={
 privateWorkspaceMustBeOutsideGit:true,
 privateWorkspaceInitiallyEmpty:true,
 privateWorkspaceOperatorMustLinkOriginal:true,
 qaTargetMustNotBeLinkedDuringSourceFetch:true,
 mayNotCopyProductionUserRows:true,
 forbidMigrationRepair:true,
 forbidUnreviewedDbPush:true,
 pendingEightSqlExcluded:true,
 signedAuthenticatedSessionNotYetAttested:true
};
const gates=[
 'realOperatorAuthenticatedCliFetchCompleted',
 'original83BodiesLocallyMd5Verified',
 'original83BodySecurityReviewed',
 'qaMirrorIndependentlyVerified',
 'qaOnlyDryRunAuthenticated',
 'qaHistoricalSchemaInstallApproved',
 'qaHistorical83Installed',
 'pendingEightInstalled',
 'qaSignedDmP1P2Acceptance',
 'qaVercelDeployed',
 'productionReleaseAuthorized'
];
const unchanged=[
 'originalSqlUnchanged','qaSqlUnchanged',
 'noRawHistoricalSqlInGitOrChat','noSecretsCommitted',
 'noProductionOrQaVercelDeployment','noPaidResources',
 'noMerge','noProductionDeploy'
];

/** Synthetic-only reproduction of exactly what CLI v2.81.3 emits.
 * This is NOT a remote migration fetch or SQL export method.
 */
export function serializeR106SyntheticHistory({version,name,statements}={}){
 if(!/^[0-9]{14}$/.test(version??'')||
   !/^[A-Za-z0-9_-]+$/.test(name??'')||
   !Array.isArray(statements)||statements.length<1||
   !statements.every(x=>typeof x==='string'&&x.length>0))
  fail('invalid synthetic migration row');
 const filename=version+'_'+name+'.sql';
 const body=Buffer.from(statements.join(';\n')+';\n','utf8');
 return Object.freeze({filename,body,md5:createHash('md5').update(body).digest('hex')});
}

export function validateR106TransportManifest(manifest,{repoRoot=ROOT}={}){
 const root=resolve(repoRoot);
 if(!exact(manifest,['schema','workPackage','decision','parentPr',
  'parentSha','observedDateLocal','scope','cli','historical',
  'safety','gates','unchanged'])||
  manifest.schema!==1||manifest.workPackage!=='B10-R18-106'||
  manifest.decision!=='NO_GO'||manifest.parentPr!==207||
  manifest.parentSha!=='e1d954a81142d3c13b9f2c4057c06b8ffea78b42'||
  manifest.observedDateLocal!=='2026-11-17'||
  manifest.scope!=='CLI_V2_81_3_83_HISTORY_SERIALIZATION_SOURCE_LOCK_AND_PRIVATE_WORKSPACE_PREFLIGHT')
  fail('package source identity changed');
 if(!same(manifest.cli,upstream)||!same(manifest.historical,history)||
  !same(manifest.safety,safety)||!exact(manifest.gates,gates)||
  gates.some(x=>manifest.gates[x]!==false)||
  !exact(manifest.unchanged,unchanged)||
  unchanged.some(x=>manifest.unchanged[x]!==true))
  fail('CLI format, original count, security or release NO_GO changed');

 const r08=readFileSync(join(root,history.frozenR08Path));
 const r101=readFileSync(join(root,history.frozenR101Path));
 if(gitBlob(r08)!==history.frozenR08BlobSha||
    gitBlob(r101)!==history.frozenR101BlobSha)
  fail('historic original metadata Git blob drift');
 const frozen=JSON.parse(r08.toString('utf8'));
 const risk=JSON.parse(r101.toString('utf8'));
 if(frozen.originalMigrationVersionCount!==83||
  frozen.expectedNewestVersion!==history.latestVersion||
  frozen.productionBaseSha!=='90df8c960e79e8d66c322095611427da7bb09de4'||
  !Array.isArray(frozen.rows)||frozen.rows.length!==83||
  risk.workPackage!=='B10-R18-101'||risk.metrics?.history_count!==83||
  risk.metrics.total_sql_bytes!==history.originalStoredSqlBytes||
  !Array.isArray(risk.entries)||risk.entries.length!==83)
  fail('83-count or original stored SQL bytes differ from frozen baseline');
 const found=new Set();
 let sum=0;
 for(let i=0;i<83;i++){
  const row=frozen.rows[i],entry=risk.entries[i];
  if(!row||!entry||!/^\d{14}$/.test(row.version)||
    !/^[A-Za-z0-9_-]+$/.test(row.name)||
    !/^[0-9a-f]{32}$/.test(row.fetched_sql_md5)||
    row.version!==entry.version||row.name!==entry.name||
    row.fetched_sql_md5!==entry.body_md5||
    !Number.isInteger(row.statement_count)||row.statement_count<1||
    !Number.isSafeInteger(entry.sql_bytes)||entry.sql_bytes<1||
    found.has(row.version))
   fail('frozen 83 filename/MD5/version/statement-count changed');
  found.add(row.version);
  sum+=entry.sql_bytes;
 }
 if(sum!==history.originalStoredSqlBytes||
  history.originalStoredSqlBytes+83*history.terminalBytesPerMigration!==
  history.cliReconstructedSqlBytes)
  fail('CLI terminal bytes do not reconcile to original source database history');
 if(frozen.rows[82].version!==history.latestVersion)
  fail('original last migration changed');

 const old=validateR105IsolatedFogTest(
  read(root,'staging/world-v2-b10-r18-105-isolated-fog-test/manifest.json'),
  {repoRoot:root});
 if(old.decision!=='NO_GO'||old.qaMigrationsApplied!==0||
  old.actualHostedSignedUserCasesExecuted!==0||
  old.productionReleaseAuthorized!==false)
  fail('previous fog and hosted QA gates were weakened');

 return Object.freeze({
  workPackage:'B10-R18-106',decision:'NO_GO',
  upstreamCliVersion:'2.81.3',
  originalHistoryRowsMatched:83,
  officialCliFetchWritesTerminalSemicolonNewline:true,
  originalStoredSqlBytes:709936,
  expectedCliFetchedSqlBytes:710102,
  expectedTerminalBytesAdded:166,
  authenticatedOriginalSqlFilesRecovered:0,
  operatorPrivateWorkspaceReady:false,
  qaMigrationsInstalled:0,
  productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('offline source validation accepts no arguments');
  process.stdout.write(JSON.stringify(validateR106TransportManifest(
   read(ROOT,DIR+'manifest.json')),null,2)+'\n');
 }catch{
  process.stderr.write('R106 HISTORY TRANSPORT NO-GO: source verification failed.\n');
  process.exitCode=1;
 }
}
