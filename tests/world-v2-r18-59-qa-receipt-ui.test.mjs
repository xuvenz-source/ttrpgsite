import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';
import {createWorldV2AcceptanceReceipt,emptyWorldV2QaChecks,
 WORLD_V2_QA_REQUIRED_CHECKS,WORLD_V2_QA_CHECK_LABELS}
 from '../src/engine/v2/WorldV2QaReceipt.js';
import {validateR58MultiplayerQa}
 from '../scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');
const FULL_SHA='54aa1964ae54a55f6637a1ddaa9c8ac210aa6128';
const BASELINE_SHA='5ca8c83bdef4a5d9870020b0f2b16723f7790e38';
const NOW='2026-11-13T12:00:00.000Z';
const runs=['dm','p1','p2'];
function snapshot(role){
 let t=0;
 const tracer=createWorldV2Trace({enabled:true,limit:256,now:()=>t});
 if(role==='p2'){
  tracer.event('observer.frame-accepted','ok');
  tracer.event('observer.authorized','ok');
 }else{
  for(let i=0;i<6;i++){
   tracer.event('movement.grabbed','grabbed');
   let done=tracer.begin('authority.advance');t+=16;done();
   done=tracer.begin('authority.commit');t+=30;done();
   tracer.event('movement.committed','committed');
  }
 }
 let done=tracer.begin('render.frame');t+=0.6;done();
 return tracer.snapshot();
}
function receipt(role,overrides={}){
 return createWorldV2AcceptanceReceipt(snapshot(role),{
  role,captureTag:{dm:'a'.repeat(24),p1:'b'.repeat(24),p2:'c'.repeat(24)}[role],
  runCode:'R59-TEST-001',buildSha:FULL_SHA,
  capturedAt:NOW,independentSignInDeclared:true,
  independentBrowserDeclared:true,dmPreview:false,
  checks:Object.fromEntries(
   WORLD_V2_QA_REQUIRED_CHECKS[role].map(k=>[k,'pass'])),
  ...overrides
 });
}
const verify=rs=>validateR58MultiplayerQa({
 receipts:rs,expectedBuildSha:FULL_SHA,now:new Date(NOW)
});
test('R18-59 panel-compatible DM/P1/passive-P2 safe receipts pass R58 format but NOT release authorization',()=>{
 const three=runs.map(r=>receipt(r));
 const x=verify(three);
 assert.equal(x.receiptCount,3);
 assert.equal(x.selfReportedEvidenceComplete,true);
 assert.equal(x.safeToDeploy,false);
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.differentSignedInAccountsIndependentlyVerified,false);
 assert.equal(x.fogRevocationIndependentlyObservedByReviewer,false);
 assert.equal(x.authenticatedLinkedSupabaseCliDryRunVerified,false);
 assert.equal(x.productionReleaseApproved,false);
 assert.equal(x.roleResults.p2.traceCoverage,true);
 assert.equal(x.roleResults.p1.traceCoverage,true);
});
test('R18-59 all checklists default to not_run, not prefilled artificial PASS',()=>{
 for(const role of runs){
  const c=emptyWorldV2QaChecks(role);
  assert.deepEqual(Object.keys(c),WORLD_V2_QA_REQUIRED_CHECKS[role]);
  assert.ok(Object.values(c).every(v=>v==='not_run'));
  for(const name of Object.keys(c))
   assert.equal(typeof WORLD_V2_QA_CHECK_LABELS[name],'string');
  const r=receipt(role,{checks:c});
  assert.equal(verify([r]).selfReportedEvidenceComplete,false);
  assert.equal(verify([r]).roleResults[role].checksComplete,false);
 }
});
test('R18-59 report strips injected user IDs, signed sight, coordinates, arbitrary counts',()=>{
 const raw=snapshot('dm');
 raw.userId='PRIVATE_ACCOUNT';
 raw.mapId='PRIVATE_MAP';
 raw.signedSight={visible:[{id:'PRIVATE_NPC',x:17,y:19}]};
 raw.jwt='PRIVATE_JWT';
 raw.events[0].playerEmail='PRIVATE_EMAIL';
 raw.tokenCoordinates=[{x:14,y:7}];
 const r=createWorldV2AcceptanceReceipt(raw,{
  role:'dm',runCode:'R59-TEST-001',buildSha:FULL_SHA,
  captureTag:'a'.repeat(24),capturedAt:NOW,
  checks:emptyWorldV2QaChecks('dm')
 });
 const out=JSON.stringify(r);
 for(const secret of ['PRIVATE_ACCOUNT','PRIVATE_MAP','PRIVATE_NPC',
  'PRIVATE_JWT','PRIVATE_EMAIL','tokenCoordinates','signedSight',
  'userId','mapId','jwt','playerEmail'])
  assert.equal(out.includes(secret),false,'leaked '+secret);
 assert.deepEqual(Object.keys(r).sort(),[
  'schema','runCode','role','captureTag','capturedAt','buildSha',
  'independentSignInDeclared','independentBrowserDeclared',
  'previewMode','checks','trace'].sort());
});
test('R18-59 no spoofed build identity, role, extra observations, or arbitrary labels',()=>{
 assert.throws(()=>receipt('p1',{buildSha:'not-a-commit'}),/Invalid local QA/);
 assert.throws(()=>receipt('p1',{buildSha:BASELINE_SHA,runCode:'wrong run'}),/Invalid local QA/);
 assert.throws(()=>receipt('p1',{role:'admin'}),/Invalid local QA/);
 assert.throws(()=>receipt('p1',{captureTag:'user@email'}),/Invalid local QA/);
 assert.throws(()=>receipt('p1',{checks:{...emptyWorldV2QaChecks('p1'),signedSight:'pass'}}),/Invalid local QA/);
 assert.throws(()=>receipt('p1',{checks:{...emptyWorldV2QaChecks('p1'),solidWall:'yes'}}),/Invalid local QA/);
 assert.throws(()=>receipt('p1',{capturedAt:'invalid'}),/Invalid local QA/);
});
test('R18-59 self-declared sign-in and DM preview do not count as independent QA',()=>{
 const preview=verify([receipt('dm',{dmPreview:true})]);
 assert.equal(preview.roleResults.dm.declaredIndependent,false);
 const x=verify([receipt('p1',{independentSignInDeclared:false})]);
 assert.equal(x.roleResults.p1.declaredIndependent,false);
 const oldBuild=verify([receipt('p1',{buildSha:BASELINE_SHA})]);
 assert.equal(oldBuild.roleResults.p1.buildMatches,false);
});
test('R18-59 synthetic trace exporter rejects hidden payloads rather than forwarding unsafe keys',()=>{
 const raw=snapshot('p1');
 raw.counts['PRIVATE_NPC_ID']=9;
 assert.throws(()=>createWorldV2AcceptanceReceipt(raw,{
  role:'p1',runCode:'R59-TEST-001',buildSha:FULL_SHA,captureTag:'b'.repeat(24),
  capturedAt:NOW,checks:emptyWorldV2QaChecks('p1')
 }),/Invalid bounded World V2 diagnostic trace/);
 const bad=snapshot('p2');
 bad.events[0].detail='hidden wall coordinates';
 assert.throws(()=>createWorldV2AcceptanceReceipt(bad,{
  role:'p2',runCode:'R59-TEST-001',buildSha:FULL_SHA,captureTag:'c'.repeat(24),
  capturedAt:NOW,checks:emptyWorldV2QaChecks('p2')
 }),/Invalid bounded World V2 diagnostic trace/);
});
test('R18-59 existing quick report, panel opt-in switch and gesture isolation are retained',()=>{
 const s=read('src/engine/v2/WorldTraceCapturePanel.jsx');
 const board=read('src/engine/v2/WorldV2Board.jsx');
 const common=read('src/engine/v2/WorldV2QaReceipt.js');
 assert.match(board,/WorldTraceCapturePanel isDM=\{isDM\} dmPreview=\{dmPreview\}/);
 assert.match(board,/worldV2Trace\.enabled&&/);
 assert.match(s,/if\(!worldV2Trace\.enabled\)return null/);
 assert.match(s,/Quick scenario report/);
 assert.match(s,/R18-58 multiplayer acceptance/);
 assert.match(s,/createWorldV2DiagnosticReport\(snapshot/);
 assert.match(s,/createWorldV2AcceptanceReceipt\(snapshot/);
 assert.match(s,/worldV2Trace\.clear\(\)/);
 assert.match(s,/navigator\.clipboard\.writeText\(output\)/);
 assert.match(s,/Manually copy safe QA report/);
 assert.match(s,/onKeyDown=\{e=>e\.stopPropagation\(\)\}/);
 assert.match(s,/onPointerDownCapture=\{e=>e\.stopPropagation\(\)\}/);
 assert.match(s,/crypto\.getRandomValues\(values\)/);
 assert.match(common,/self-reported test results/i);
 for(const code of [s,common]){
  assert.doesNotMatch(code,/createClient\(|\.rpc\(|\.channel\(|\bfetch\(|WebSocket\(|localStorage\.|sessionStorage\.|setInterval\(/);
  assert.doesNotMatch(code,/service_role|request\.jwt\.claim|document\.cookie/);
 }
});
test('R18-59 build SHA is public Git provenance only; unexposed env must fail closed',()=>{
 const vite=read('vite.config.js');
 const panel=read('src/engine/v2/WorldTraceCapturePanel.jsx');
 assert.match(vite,/VERCEL_GIT_COMMIT_SHA/);
 assert.match(vite,/process\.env\.GITHUB_SHA/);
 assert.match(vite,/^[\s\S]*\/\^\[0-9a-f\]\{40\}\$\//i);
 assert.match(vite,/'import\.meta\.env\.VITE_WORLD_V2_QA_BUILD_SHA'/);
 assert.match(vite,/JSON\.stringify\(buildSha\)/);
 assert.match(panel,/Build SHA unavailable/);
 assert.match(panel,/do not enter an undeployed staging commit/i);
 assert.doesNotMatch(vite,/SUPABASE_(?:KEY|URL|PASSWORD|TOKEN)|VERCEL_TOKEN|service_role/);
});
