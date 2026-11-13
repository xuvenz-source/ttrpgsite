import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseR51MigrationList,parseR51DryRun} from
 '../scripts/release/validate-world-v2-r18-51-cli-evidence.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const frozen=JSON.parse(readFileSync(join(root,
 'staging/world-v2-b10-r18-08-remote-history-content-hashes.json'),'utf8'));
const narrow=JSON.parse(readFileSync(join(root,
 'staging/world-v2-b10-r18-48-narrow-pending/manifest.json'),'utf8'));
const remote=frozen.rows.map(x=>x.version);
const files=['20261111023204_world_v2_b10_integrated_motion.sql',
 ...narrow.pending.map(x=>x.filename)];
const pending=files.map(x=>x.slice(0,14));
const d='2026-11-13 00:00:00';
const fmt=(local,rem)=>local.padEnd(17)+' │ '+rem.padEnd(17)+' │ '+d;
function unicodeList({box=false,crlf=false}={}){
 const body=[
  'Connecting to remote database...',
  box?'│ LOCAL │ REMOTE │ TIME (UTC) │':'LOCAL │ REMOTE │ TIME (UTC)',
  '──────────────────────┼─────────────────┼──────────────────',
  ...remote.map(v=>fmt(v,v)),
  ...pending.map(v=>fmt(v,'')),
  'Finished supabase migration list.'
 ].join('\n');
 return crlf?body.replace(/\n/g,'\r\n'):body;
}
const officialDry=()=>[
 'Connecting to remote database...',
 'DRY RUN: migrations will *not* be pushed to the database.',
 ...files.map(f=>'Would push migration '+f+'...'),
 'Finished supabase db push.'
].join('\n');
const checked=t=>parseR51MigrationList({text:t,remote,pending});

test('R18-52 official CLI Unicode columns: precisely 83 registered and 8 pending',()=>{
 const outcome=checked(unicodeList());
 assert.deepEqual(outcome,{remoteCount:83,pendingCount:8,localCount:91,
  historyAligned:true});
 assert.equal(parseR51DryRun({text:officialDry(),files}).printedPendingFiles,8);
});
test('R18-52 permits Unicode bordered header and CRLF but never alters history',()=>{
 const output=checked(unicodeList({box:true,crlf:true}));
 assert.equal(output.remoteCount,83);
 assert.equal(output.pendingCount,8);
});
test('R18-52 rejects Unicode remote-only history and stale/missing local versions',()=>{
 const s=unicodeList(),h=fmt(remote[0],remote[0]);
 assert.throws(()=>checked(s.replace(h,fmt('',remote[0]))),/history mismatch/);
 assert.throws(()=>checked(s.replace(h,fmt(remote[0],''))),/history mismatch/);
 assert.throws(()=>checked(s.replace(h,fmt('20261113021015',remote[0]))),
  /history mismatch/);
});
test('R18-52 rejects extra, missing, duplicate, or reordered Unicode pending versions',()=>{
 const s=unicodeList(),p=fmt(pending[0],''),other=fmt(pending[1],'');
 assert.throws(()=>checked(s.replace(p,'')),/exactly 83 registered plus 8 pending/);
 assert.throws(()=>checked(s+'\n'+fmt('20261113021017','')),/exactly 83 registered plus 8 pending/);
 assert.throws(()=>checked(s.replace(p,other)),/history mismatch/);
 assert.throws(()=>checked(s.replace(p,fmt('20261113021015',''))),/history mismatch/);
});
test('R18-52 refuses mixed table delimiters and ambiguous Unicode version rows',()=>{
 const s=unicodeList();
 assert.throws(()=>checked(s.replace('LOCAL │ REMOTE │ TIME (UTC)',
  'LOCAL │ REMOTE | TIME (UTC)')),/mixed ASCII and Unicode/);
 assert.throws(()=>checked(s.replace(fmt(remote[1],remote[1]),
  'INVALID │ '+remote[1]+' │ '+d)),/unparsed or ambiguous/);
 assert.throws(()=>checked(s.replace('LOCAL │ REMOTE │ TIME (UTC)',
  'LOCAL │ REMOTE │ LOCAL DB')),/list rows precede CLI header/);
});
test('R18-52 official dry run rejects live apply, unknown SQL and reordered files',()=>{
 const s=officialDry();
 assert.throws(()=>parseR51DryRun({
  text:s.replace('DRY RUN: migrations will *not* be pushed to the database.',
   'Pushing migrations to the database.'),files
 }),/missing explicit dry-run/);
 assert.throws(()=>parseR51DryRun({
  text:s.replace('Would push migration '+files[0],
   'Applying migration '+files[0]),files
 }),/actual migration execution/);
 assert.throws(()=>parseR51DryRun({
  text:s.replace(files[2],'20261113021015_r47_step_bbox_prefilter.sql'),files
 }),/exactly eight reviewed/);
 assert.throws(()=>parseR51DryRun({
  text:s.replace(files[1],files[0]),files
 }),/exactly eight reviewed/);
});
test('R18-52 source checker remains offline-only with fail-closed NO_GO result',()=>{
 const src=readFileSync(join(root,
  'scripts/release/validate-world-v2-r18-51-cli-evidence.mjs'),'utf8');
 assert.match(src,/decision:'NO_GO',safeToApply:false/);
 assert.match(src,/actualLinkedCliInvocationIndependentlyAttested:false/);
 assert.match(src,/independentDmP1P2Accepted:false/);
 assert.match(src,/freeTierLoadAccepted:false/);
 assert.doesNotMatch(src,/child_process|spawnSync\(|execSync\(|writeFileSync\(|https\.request\(/);
});
