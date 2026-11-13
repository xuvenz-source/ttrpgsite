import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseR51MigrationList,parseR51DryRun,validateR51CliEvidence} from
 '../scripts/release/validate-world-v2-r18-51-cli-evidence.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');
const baseline=JSON.parse(read('staging/world-v2-b10-r18-08-remote-history-content-hashes.json'));
const manifest=JSON.parse(read('staging/world-v2-b10-r18-48-narrow-pending/manifest.json'));
const remote=baseline.rows.map(x=>x.version);
const files=['20261111023204_world_v2_b10_integrated_motion.sql',
 ...manifest.pending.map(x=>x.filename)];
const pending=files.map(x=>x.slice(0,14));
function list(){
 const header=['Connecting to remote database...','Local | Remote | Time (UTC)',
  '------|--------|-----------'];
 const historical=remote.map(x=>x+' | '+x+' | 2026-11-13 00:00:00');
 const unpublished=pending.map(x=>x+' |  | 2026-11-13 00:00:00');
 return [...header,...historical,...unpublished].join('\n');
}
const dry=()=>['Connecting to remote database...','DRY RUN: The following migrations would be pushed:',
 ...files.map(x=>' • '+x),'Dry run complete; no migrations were pushed.'].join('\n');
const l=opts=>parseR51MigrationList({text:list(),remote,pending,...opts});
const d=opts=>parseR51DryRun({text:dry(),files,...opts});
test('R18-51 accepts exact synthetic 83 applied + 8 narrow pending table, no migration push',()=>{
 assert.equal(remote.length,83);
 assert.equal(files.length,8);
 assert.equal(l().remoteCount,83);
 assert.equal(l().pendingCount,8);
 assert.equal(l().localCount,91);
 const result=d();
 assert.equal(result.dryRunOnly,true);
 assert.equal(result.printedPendingFiles,8);
 assert.equal(result.unexpectedMigrations,0);
});
test('R18-51 rejects missing/duplicate/unordered history and speculative R26 optimizer',()=>{
 assert.throws(()=>l({text:list().replace(remote[0]+' | '+remote[0],
  remote[0]+' | ')}),/history mismatch/);
 assert.throws(()=>l({text:list().replace(remote[0]+' | '+remote[0],
  ' | '+remote[0])}),/history mismatch/);
 assert.throws(()=>l({text:list().replace(pending[1]+' |  |',
  '20261113021015 |  |')}),/history mismatch/);
 assert.throws(()=>l({text:list().replace(pending[0]+' |  | 2026-11-13 00:00:00\n','')}),/exactly 83/);
 const extra='20261113021017 |  | 2026-11-13 00:00:00';
 assert.throws(()=>l({text:list()+'\n'+extra}),/exactly 83/);
 const reorder=list().replace(pending[0]+' |  | 2026-11-13 00:00:00',
  '20261113021022 |  | 2026-11-13 00:00:00');
 assert.throws(()=>l({text:reorder}),/history mismatch/);
});
test('R18-51 refuses non-CLI or ambiguous list formatting and detached remote rows',()=>{
 assert.throws(()=>l({text:'All migrations are up-to-date'}),/83 registered/);
 assert.throws(()=>l({text:list().replace('Local | Remote | Time (UTC)',
  'Migrations approved: 91')}),/precede CLI header/);
 assert.throws(()=>l({text:list().replace(remote[3]+' | '+remote[3],
  ' | '+remote[3])}),/history mismatch/);
 assert.throws(()=>l({text:list().replace(remote[3]+' | '+remote[3],
  'UNKNOWN '+remote[3]+' | '+remote[3])}),/ambiguous CLI migration version/);
 assert.throws(()=>l({text:list()+'\nERROR: migration history mismatch'}),/contains an error/);
});
test('R18-51 refuses extra/missing/reordered SQL, failed execution or fake dry-run',()=>{
 assert.throws(()=>d({text:dry().replace('DRY RUN','MIGRATION PUSH')}),/missing explicit dry-run/);
 assert.throws(()=>d({text:dry().replace('no migrations were pushed','applying migration')}),/actual migration execution/);
 assert.throws(()=>d({text:dry().replace(files[2],'20261113021015_r47_step_bbox_prefilter.sql')}),/exactly eight reviewed/);
 assert.throws(()=>d({text:dry().replace(' • '+files[4],'')}),/exactly eight reviewed/);
 assert.throws(()=>d({text:dry()+'\n'+'20261113021017_r47_commit_empty_work.sql'}),/exactly eight reviewed/);
 assert.throws(()=>d({text:'dry run\n'+files.slice().reverse().join('\n')}),/exactly eight reviewed/);
 assert.throws(()=>d({text:dry()+'\nSupabase migration repair'}),/contains an error/);
 assert.throws(()=>d({text:dry()+'\n--include-all'}),/contains an error/);
});
test('R18-51 detects secrets and output injection without exposing raw logs',()=>{
 assert.throws(()=>d({text:dry()+'\nSUPABASE_ACCESS_TOKEN=sensitive'}),/possible credentials/);
 assert.throws(()=>l({text:list()+'\x1b[31m'}),/unsafe or oversized/);
 assert.throws(()=>d({text:dry()+'x'.repeat(120000)}),/unsafe or oversized/);
});
test('R18-51 full inspector requires pinned CLI/exit codes and real workspace/receipt',()=>{
 assert.throws(()=>validateR51CliEvidence({
  cliVersion:'2.79.0',listExitCode:0,dryRunExitCode:0,
  migrationListText:list(),dryRunText:dry()
 }),/pinned CLI version/);
 assert.throws(()=>validateR51CliEvidence({
  cliVersion:'2.81.3',listExitCode:0,dryRunExitCode:1,
  migrationListText:list(),dryRunText:dry()
 }),/zero process exit statuses/);
 assert.throws(()=>validateR51CliEvidence({
  cliVersion:'2.81.3',listExitCode:0,dryRunExitCode:0,
  migrationListText:list(),dryRunText:dry()
 }),/R49 LINKED NO-GO|ENOENT|path/);
});
test('R18-51 inspector is statically inert and never grants production GO',()=>{
 const src=read('scripts/release/validate-world-v2-r18-51-cli-evidence.mjs');
 assert.match(src,/validateR49LinkedWorkspace/);
 assert.match(src,/validateR50ReadOnlyReceipt/);
 assert.match(src,/actualLinkedCliInvocationIndependentlyAttested:false/);
 assert.match(src,/independentDmP1P2Accepted:false/);
 assert.match(src,/productionApproval:false/);
 assert.match(src,/decision:'NO_GO',safeToApply:false/);
 assert.doesNotMatch(src,/child_process|spawnSync\(|execSync\(|writeFileSync\(|fetch\(|https\.request\(|createConnection\(/);
 assert.doesNotMatch(src,/supabase\s+db\s+push\s*(?:--linked)?\s*[\n'"]/);
});
