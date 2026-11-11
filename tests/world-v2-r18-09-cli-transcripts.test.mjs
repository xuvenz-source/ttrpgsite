import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR18CliTranscripts} from '../scripts/release/validate-world-v2-r18-09-cli-transcripts.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const snapshot=JSON.parse(readFileSync(join(root,'staging/world-v2-b10-r18-07-live-migration-baseline.json'),'utf8'));
const target=snapshot.targetFilename;
const pendingVersion=snapshot.expectedTargetVersion;

function fixture(){
  const lines=[' Local | Remote | Time (UTC)','-------|--------|-----------'];
  for(const {version} of snapshot.applied)
    lines.push(' '+version+' | '+version+' | 2026-11-11 00:00:00');
  lines.push(' '+pendingVersion+' |                | 2026-11-11 00:00:00');
  return {
    cliVersion:'2.81.3',
    migrationListOutput:lines.join('\n'),
    dryRunOutput:'DRY RUN: migrations will *not* be pushed to the database.\nWould push these migrations:\n • '+target+'\nFinished supabase db push.\n'
  };
}

test('R18-09 accepts only a one-pending offline CLI transcript and always returns NO-GO',()=>{
 const report=validateR18CliTranscripts(fixture());
 assert.equal(report.decision,'NO_GO');
 assert.equal(report.safeToApply,false);
 assert.equal(report.logOnly,true);
 assert.equal(report.actualLinkedCliExecutedByValidator,false);
 assert.equal(report.authenticatedRemoteExecutionProven,false);
 assert.equal(report.frontendCanaryVerified,false);
 assert.deepEqual(report.expectedPendingMigrations,[target]);
 assert.equal(report.matchedRemoteRows,83);
});

test('R18-09 missing, duplicate, or mismatched remote versions fail',()=>{
 const data=fixture();
 const row=snapshot.applied[0].version;
 assert.throws(()=>validateR18CliTranscripts({...data,migrationListOutput:data.migrationListOutput.replace(row+' | '+row,'                | '+row)}),/Unapproved or mismatched/);
 const rows=data.migrationListOutput.split('\n');
 rows.splice(2,1);
 assert.throws(()=>validateR18CliTranscripts({...data,migrationListOutput:rows.join('\n')}),/Expected 83 matched/);
 const duplicate=data.migrationListOutput.replace(snapshot.applied[1].version+' | '+snapshot.applied[1].version,row+' | '+row);
 assert.throws(()=>validateR18CliTranscripts({...data,migrationListOutput:duplicate}),/Unapproved or mismatched/);
});

test('R18-09 target remotely installed must not look pending',()=>{
 const data=fixture();
 const changed=data.migrationListOutput.replace(pendingVersion+' |                |',pendingVersion+' | '+pendingVersion+' |');
 assert.throws(()=>validateR18CliTranscripts({...data,migrationListOutput:changed}),/Unapproved or mismatched/);
});

test('R18-09 local second pending migration fails closed',()=>{
 const data=fixture();
 const wrong=data.migrationListOutput+'\n 20261111999999 |                | 2026-11-11 00:00:00';
 assert.throws(()=>validateR18CliTranscripts({...data,migrationListOutput:wrong}),/Expected 83 matched/);
});

test('R18-09 disabled migrations and misleading up-to-date fail',()=>{
 const data=fixture();
 assert.throws(()=>validateR18CliTranscripts({...data,dryRunOutput:data.dryRunOutput+'\nSkipping migrations because it is disabled in config.toml'}),/forbidden/);
 assert.throws(()=>validateR18CliTranscripts({...data,dryRunOutput:data.dryRunOutput+'\nRemote database is up to date.'}),/forbidden/);
});

test('R18-09 rejects dry-run output implying roles, seeds, or SQL actions',()=>{
 const data=fixture();
 for(const phrase of ['Would seed these files:','Would create custom roles auth.sql','Applying migration '+target,'Do you want to push these migrations?']){
  assert.throws(()=>validateR18CliTranscripts({...data,dryRunOutput:data.dryRunOutput+'\n'+phrase}),/forbidden/);
 }
});

test('R18-09 exact target filename only, no extra migration bullets',()=>{
 const data=fixture();
 const extra='20261111023205_unreviewed.sql';
 assert.throws(()=>validateR18CliTranscripts({...data,dryRunOutput:data.dryRunOutput.replace(' • '+target,' • '+extra)}),/reviewed R05/);
 assert.throws(()=>validateR18CliTranscripts({...data,dryRunOutput:data.dryRunOutput.replace(' • '+target,' • '+target+'\n • '+extra)}),/reviewed R05/);
});

test('R18-09 needs a positive dry-run marker and full transcript capture',()=>{
 const data=fixture();
 assert.throws(()=>validateR18CliTranscripts({...data,dryRunOutput:data.dryRunOutput.replace('DRY RUN: migrations will *not* be pushed to the database.','')}),/safety marker/);
 assert.throws(()=>validateR18CliTranscripts({...data,dryRunOutput:data.dryRunOutput.replace('Finished supabase db push.','')}),/Incomplete/);
});

test('R18-09 rejects wrong version, malformed table, absent captures and oversize',()=>{
 const data=fixture();
 assert.throws(()=>validateR18CliTranscripts({...data,cliVersion:'2.83.0'}),/pinned CLI/);
 assert.throws(()=>validateR18CliTranscripts({...data,migrationListOutput:'hello'}),/Expected 83 matched/);
 assert.throws(()=>validateR18CliTranscripts({...data,dryRunOutput:null}),/Two separately captured/);
 assert.throws(()=>validateR18CliTranscripts({...data,dryRunOutput:'x'.repeat(50001)}),/safety limit/);
});

test('R18-09 CLI parser does not invoke shell, network, SQL or claim applied migration',()=>{
 const source=readFileSync(join(root,'scripts/release/validate-world-v2-r18-09-cli-transcripts.mjs'),'utf8');
 assert.doesNotMatch(source,/child_process|spawnSync|execSync|applyMigration\(|fetch\(/);
 assert.match(source,/safeToApply:false/);
 assert.match(source,/actualLinkedCliExecutedByValidator:false/);
 assert.match(source,/sqlInstallationAuthorized:false/);
});

test('R18-09 staging release ledger preserves all ten outstanding branches and no SQL approval',()=>{
 const ledger=JSON.parse(readFileSync(join(root,'staging/next-release-ledger.json'),'utf8'));
 const status=JSON.parse(readFileSync(join(root,'staging/world-v2-b10-r18-09-cli-transcript-readiness.json'),'utf8'));
 assert.equal(status.releaseDecision,'NO_GO');
 assert.equal(status.productionApproval,false);
 assert.equal(status.databaseApproval,false);
 assert.equal(status.actualLinkedCliDryRunPerformed,false);
 assert.equal(status.backendMigrationApplied,false);
 assert.equal(ledger.releaseBranch,ledger.upcomingRelease.releaseBranch);
 assert.ok(ledger.upcomingRelease.outstandingBranches.length>=10);
 assert.ok(ledger.upcomingRelease.outstandingBranches.includes(status.stagingBranch));
 assert.equal(new Set(ledger.upcomingRelease.outstandingBranches).size,
  ledger.upcomingRelease.outstandingBranches.length);
 assert.equal(ledger.upcomingRelease.databaseReleaseVersion,null);
 assert.equal(ledger.features.find(x=>x.id==='world-v2-b10-r18-09-cli-transcript-verification')?.linkedPullRequest,111);
});
