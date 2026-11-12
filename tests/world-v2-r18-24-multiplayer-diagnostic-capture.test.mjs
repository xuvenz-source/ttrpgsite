import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';
import {
 WORLD_V2_QA_CASES,createWorldV2DiagnosticReport
} from '../src/engine/v2/WorldTraceDiagnosticReport.js';

function snapshot(){
 let now=0;
 const trace=createWorldV2Trace({enabled:true,limit:256,now:()=>now});
 trace.event('input.pick','ok');
 trace.event('movement.approved','ok');
 const finish=trace.begin('authority.advance');
 now=320;finish();
 trace.event('movement.committed','committed');
 return trace.snapshot();
}
test('R18-24 produces only bounded diagnostic allowlists with NO release approval',()=>{
 const out=createWorldV2DiagnosticReport(snapshot(),{
  role:'player-2',caseId:'A03',dmPreview:false
 });
 assert.equal(out.kind,'world-v2-local-qa-capture');
 assert.equal(out.role,'player-2');
 assert.equal(out.roleSource,'self-selected');
 assert.equal(out.caseId,'A03');
 assert.equal(out.releaseDecision,'NO_GO');
 assert.equal(out.authenticatedAccountsVerified,false);
 assert.equal(out.recipientRealtimeIsolationVerified,false);
 assert.equal(out.fogAuthorizationVerified,false);
 assert.equal(out.canonicalConvergenceVerified,false);
 assert.ok(out.trace.events.length>=2);
 assert.equal(out.trace.durations['authority.advance'].p95Ms,320);
 assert.deepEqual(Object.keys(out).sort(),[
  'authenticatedAccountsVerified','canonicalConvergenceVerified',
  'caseId','dmPreview','fogAuthorizationVerified','kind','recipientRealtimeIsolationVerified',
  'releaseDecision','role','roleSource','schema','trace'
 ].sort());
});
test('R18-24 never serializes unknown IDs, coordinates, JWTs or private signed data',()=>{
 const raw=snapshot();
 raw.accountId='SECRET_USER_ID';
 raw.mapId='SECRET_MAP_ID';
 raw.tokenPositions=[{x:17,y:92}];
 raw.signedSight={visiblePieces:[{id:'SECRET_NPC_ID'}],jwt:'SECRET_TOKEN'};
 raw.cookies='SECRET_SESSION_COOKIE';
 const out=JSON.stringify(createWorldV2DiagnosticReport(raw,{
  role:'dm',caseId:'A05'
 }));
 for(const value of ['SECRET_USER_ID','SECRET_MAP_ID','SECRET_NPC_ID',
  'SECRET_TOKEN','SECRET_SESSION_COOKIE','tokenPositions','signedSight',
  'accountId','mapId','cookies'])
  assert.equal(out.includes(value),false,value);
});
test('R18-24 rejects injected event labels and details before export',()=>{
 const raw=snapshot();
 raw.events[0]={ms:1,event:'account.id.SECRET',detail:'other'};
 assert.throws(()=>createWorldV2DiagnosticReport(raw),/Invalid bounded/);
 const v=snapshot();
 v.events[0].detail='SECRET_NPC_COORD';
 assert.throws(()=>createWorldV2DiagnosticReport(v),/Invalid bounded/);
});
test('R18-24 rejects forged counts, durations, and snapshot bounds',()=>{
 const variants=[
  r=>r.counts['secret.user.id']=1,
  r=>r.counts['authority.advance.error']=-1,
  r=>r.durations['secret.rpc']={samples:1,p50Ms:1,p95Ms:2,maxMs:3},
  r=>r.durations['authority.advance'].p95Ms=-1,
  r=>r.durations['authority.advance'].samples=700,
  r=>r.events[0].ms=-1,
  r=>r.limit=1,
  r=>r.events=Array.from({length:257},()=>({event:'input.pick',detail:'ok',ms:1})),
  r=>r.enabled=false,
 ];
 for(const apply of variants){
  const data=snapshot();apply(data);
  assert.throws(()=>createWorldV2DiagnosticReport(data),/Invalid bounded/);
 }
});
test('R18-24 valid roles/scenarios only, preview is explicitly local',()=>{
 const cases=WORLD_V2_QA_CASES.map(([id])=>id);
 assert.equal(new Set(cases).size,cases.length);
 for(const id of ['A01','A03','A05','A08','A10','A12','fog','stress'])
  assert.ok(cases.includes(id));
 assert.throws(()=>createWorldV2DiagnosticReport(snapshot(),{
  role:'role_admin',caseId:'A03'
 }),/Invalid bounded/);
 assert.throws(()=>createWorldV2DiagnosticReport(snapshot(),{
  role:'dm',caseId:'SECRET_NPC_ID'
 }),/Invalid bounded/);
 const report=createWorldV2DiagnosticReport(snapshot(),{
  role:'dm',caseId:'preview',dmPreview:true
 });
 assert.equal(report.dmPreview,true);
 assert.equal(report.releaseDecision,'NO_GO');
 assert.equal(report.authenticatedAccountsVerified,false);
});
test('R18-24 board controls appear only on opt-in, with no extra RPC or listeners',()=>{
 const board=readFileSync(new URL(
  '../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL(
  '../src/engine/v2/WorldTraceCapturePanel.jsx',import.meta.url),'utf8');
 const helper=readFileSync(new URL(
  '../src/engine/v2/WorldTraceDiagnosticReport.js',import.meta.url),'utf8');
 assert.match(board,/WorldTraceCapturePanel isDM=\{isDM\} dmPreview=\{dmPreview\}/);
 assert.match(board,/worldV2Trace\.enabled&&/);
 assert.match(panel,/if\(!worldV2Trace\.enabled\)return null/);
 assert.match(panel,/worldV2Trace\.clear\(\)/);
 assert.match(panel,/navigator\.clipboard\.writeText\(output\)/);
 assert.match(panel,/Manually copy safe QA report/);
 assert.match(panel,/onKeyDown=\{e=>e\.stopPropagation\(\)\}/);
 for(const text of [panel,helper]){
  assert.doesNotMatch(text,/(?:db|supabase)\.rpc\(|createClient\(|\.channel\(|\bfetch\(|WebSocket\(|localStorage\.|sessionStorage\.|setInterval\(/);
  assert.doesNotMatch(text,/AUTHORIZATION|service_role|request\.jwt\.claim/i);
 }
});
