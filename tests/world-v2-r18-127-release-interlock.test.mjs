import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 R127_LIVE_ENABLED,R127_REQUIRED_ATTESTATIONS,
 createSceneReleaseInterlock,sceneClientCompatibility
} from '../staging/world-v2-b10-r18-127-safe-cutover-interlock/SceneReleaseInterlock.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const sha='a'.repeat(40),parent='b'.repeat(40);
let sequence=0;
const identity={candidateSha:sha,expectedParentSha:parent,attemptId:'r127-synthetic-qa'};
const make=()=>createSceneReleaseInterlock(identity);
function proof(step,changes={}){
 const flags=Object.fromEntries(R127_REQUIRED_ATTESTATIONS[step].map(k=>[k,true]));
 return {...identity,receipt:'r127-receipt-'+step+'-'+(++sequence),...flags,...changes};
}
const stages=[
 ['attestFence','fence','fenced'],
 ['attestServerV3','server','server-v3'],
 ['attestClientV3','client','client-v3'],
 ['attestSignedQa','qa','signed-qa-v3'],
 ['attestReleaseReadiness','release','ready-for-human-release-review']
];

test('R127 source-only identity and release states never grant production permission',()=>{
 assert.equal(R127_LIVE_ENABLED,false);
 const gate=make(),snap=gate.snapshot();
 assert.equal(snap.phase,'planning');
 assert.equal(snap.productionAuthorized,false);
 assert.equal(snap.hostedActionPerformed,false);
 assert.equal(snap.legacyV2FallbackAllowed,false);
 assert.equal(snap.canRequestHumanReleaseReview,false);
 assert.deepEqual(snap.attested,[]);
});
test('R127 cannot skip maintenance, server, client, signed QA or explicit release readiness',()=>{
 const gate=make();
 for(const [fn,step] of stages.slice(1))
  assert.throws(()=>gate[fn](proof(step)),{code:'out_of_order_'+step});
 assert.equal(gate.snapshot().phase,'planning');
});
test('R127 requires every independently reviewed gate; a single false or missing field blocks progress',()=>{
 for(const step of Object.keys(R127_REQUIRED_ATTESTATIONS)){
  for(const flag of R127_REQUIRED_ATTESTATIONS[step]){
   const gate=make();
   const idx=stages.findIndex(s=>s[1]===step);
   if(idx<0)continue;
   for(const [fn,s] of stages.slice(0,idx))gate[fn](proof(s));
   const candidate=proof(step,{[flag]:false});
   assert.throws(()=>gate[stages[idx][0]](candidate),e=>e.code==='missing_required_'+flag);
   delete candidate[flag];
   assert.throws(()=>gate[stages[idx][0]](candidate),e=>e.code==='missing_required_'+flag);
   assert.equal(gate.snapshot().phase,idx===0?'planning':stages[idx-1][2]);
  }
 }
});
test('R127 rejects mismatched source, parent, attempt, reused receipt and undocumented approval',()=>{
 const gate=make();
 for(const [field,value] of [
  ['candidateSha','c'.repeat(40)],
  ['expectedParentSha','d'.repeat(40)],
  ['attemptId','r127-old-attempt']
 ])assert.throws(()=>gate.attestFence(proof('fence',{[field]:value})),{code:'stale_or_mismatched_proof'});
 assert.throws(()=>gate.attestFence(proof('fence',{receipt:'bad'})),{code:'invalid_or_reused_receipt'});
 const accepted=proof('fence');
 assert.equal(gate.attestFence(accepted).phase,'fenced');
 assert.throws(()=>gate.attestServerV3({...proof('server'),receipt:accepted.receipt}),{code:'invalid_or_reused_receipt'});
 assert.equal(gate.snapshot().phase,'fenced');
});
test('R127 valid synthetic evidences reach only human review, never deploy or security authorization',()=>{
 const gate=make();
 for(const [fn,step,phase] of stages){
  const result=gate[fn](proof(step));
  assert.equal(result.phase,phase);
  assert.equal(result.productionAuthorized,false);
  assert.equal(result.hostedActionPerformed,false);
  assert.equal(result.legacyV2FallbackAllowed,false);
 }
 assert.equal(gate.snapshot().canRequestHumanReleaseReview,true);
 assert.deepEqual(gate.snapshot().attested,stages.map(x=>x[1]));
 assert.equal(typeof gate.deploy,'undefined');
 assert.equal(typeof gate.merge,'undefined');
 assert.equal(typeof gate.reopenV2,'undefined');
});
test('R127 rollback is a demand to fence, not evidence that sessions are fenced',()=>{
 const gate=make();
 gate.attestFence(proof('fence'));
 gate.attestServerV3(proof('server'));
 const intent=gate.abort('Unexpected recipient fanout during validation');
 assert.equal(intent.phase,'abort-required');
 assert.equal(intent.abortReason,'Unexpected recipient fanout during validation');
 assert.equal(intent.abortedFrom,'server-v3');
 assert.equal(intent.requiresServerSideFence,true);
 assert.equal(intent.productionAuthorized,false);
 assert.equal(intent.legacyV2FallbackAllowed,false);
 assert.throws(()=>gate.attestClientV3(proof('client')),{code:'out_of_order_client'});
 for(const flag of R127_REQUIRED_ATTESTATIONS.abortFence){
  assert.throws(()=>gate.attestAbortFence(proof('abortFence',{[flag]:false})),
   {code:'missing_required_'+flag});
 }
 assert.equal(gate.attestAbortFence(proof('abortFence')).phase,'aborted-fenced');
 assert.throws(()=>gate.attestFence(proof('fence')),{code:'out_of_order_fence'});
 assert.equal(gate.snapshot().canRequestHumanReleaseReview,false);
});
test('R127 abort after full mock signoff still revokes the modeled release review',()=>{
 const gate=make();
 for(const [fn,step] of stages)gate[fn](proof(step));
 assert.equal(gate.snapshot().canRequestHumanReleaseReview,true);
 gate.abort('Old socket unexpectedly remained subscribed');
 assert.equal(gate.snapshot().canRequestHumanReleaseReview,false);
 assert.equal(gate.snapshot().requiresServerSideFence,true);
 gate.attestAbortFence(proof('abortFence'));
 assert.equal(gate.snapshot().phase,'aborted-fenced');
});
test('R127 never accepts a blanket waiver of critical revocation, URL or privileged RPC security',()=>{
 const flags=R127_REQUIRED_ATTESTATIONS.qa;
 assert.ok(flags.includes('signedStorageAccessExposureRemediated'));
 assert.ok(flags.includes('criticalRevocationAndPrivilegeIssuesResolved'));
 assert.ok(!flags.some(k=>/Waived|Accepted/.test(k)));
 assert.ok(R127_REQUIRED_ATTESTATIONS.release.includes('noOutstandingCriticalSecurityExceptions'));
 const gate=make();
 for(const [fn,step] of stages.slice(0,3))gate[fn](proof(step));
 const missing=proof('qa',{criticalRevocationAndPrivilegeIssuesResolved:false});
 assert.throws(()=>gate.attestSignedQa(missing),
  {code:'missing_required_criticalRevocationAndPrivilegeIssuesResolved'});
 assert.equal(gate.snapshot().phase,'client-v3');
});

test('R127 compatibility blocks legacy browsers, mismatched backend, stale or unsigned state',()=>{
 const safe={bundledProtocol:'v3',serverProtocol:'v3',serverMode:'serving-v3',
  signedActorMatch:true,membershipChecked:true,sceneAuthorized:true,
  legacyClientBlocked:true,clientMaskActive:true};
 const valid=sceneClientCompatibility(safe);
 assert.equal(valid.action,'attempt-v3-join');
 assert.equal(valid.authorizesUser,false);
 assert.equal(valid.fallback,'never-v2');
 for(const [key,value] of [
  ['bundledProtocol','v2'],['serverProtocol','v2'],
  ['serverMode','maintenance'],['signedActorMatch',false],
  ['membershipChecked',false],['sceneAuthorized',false],
  ['legacyClientBlocked',false],['clientMaskActive',false]
 ]){
  const denied=sceneClientCompatibility({...safe,[key]:value});
  assert.equal(denied.action,'remain-masked',key);
  assert.equal(denied.fallback,'never-v2');
  assert.equal(denied.authorizesUser,false);
 }
 assert.equal(sceneClientCompatibility().action,'remain-masked');
});
test('R127 documentation and manifest preserve independent hard release blockers',()=>{
 const m=JSON.parse(read('staging/world-v2-b10-r18-127-safe-cutover-interlock/manifest.json'));
 const doc=read('docs/testing/world-v2-r18-127-rollout-recovery-2026-11-19.md');
 assert.equal(m.workPackage,'B10-R18-127');
 assert.equal(m.parentSha,'b37bc136ee39d2045d32703a2d08079f375256f6');
 assert.equal(m.parentPr,234);
 assert.equal(m.productionReleaseAuthorized,false);
 assert.equal(m.noHostedSqlWrites,true);
 assert.equal(m.noLiveSourceChanges,true);
 assert.equal(m.noVersionedMigrations,true);
 assert.equal(m.noMerge,true);
 assert.equal(m.noDeploy,true);
 assert.equal(m.originalMigrationCountObserved,83);
 assert.equal(m.qaMigrationCountObserved,0);
 assert.equal(m.qaPublicTableCountObserved,0);
 assert.equal(m.rolloutOperationallyExecuted,false);
 assert.equal(m.zeroDowntimeVerified,false);
 assert.equal(m.realSignedQaPassed,false);
 assert.equal(m.legacyClientsServerBlocked,false);
 assert.equal(m.preissuedStorageLinksRevoked,false);
 for(const term of ['server-side','legacy','rollback','fail-closed','signed',
   'reconnect','R18-123','R18-126','67','83','#231','NO-GO'])
  assert.ok(doc.toLowerCase().includes(term.toLowerCase()),term);
});
test('R127 source does not claim to run deployment, hosted SQL or per-frame authorization',()=>{
 const code=read('staging/world-v2-b10-r18-127-safe-cutover-interlock/SceneReleaseInterlock.js');
 for(const unsafe of [/fetch\s*\(/,/setInterval\s*\(/,/setTimeout\s*\(/,
  /requestAnimationFrame\s*\(/,/supabase\.rpc\(/,/realtime\.send\(/,
  /\.channel\s*\(/,/deploy\s*\(/,/VITE_WORLD_ENGINE_V2_READY.*true/])
  assert.doesNotMatch(code,unsafe);
 const previous=read('staging/world-v2-b10-r18-126-scene-v3-cutover-contract/SceneV3Transition.js');
 assert.match(previous,/R126_LIVE_ENABLED=false/);
 assert.match(previous,/get_authorized_scene_channel_v3/);
 assert.match(previous,/reconnect-requires-fresh-epoch/);
 const sentinel=read('staging/world-v2-b10-r18-123-access-revocation-guard/CampaignAccessSentinel.js');
 assert.match(sentinel,/R123_LIVE_ENABLED=false/);
 const teardown=read('staging/world-v2-b10-r18-123-access-revocation-guard/CampaignRevocationTeardown.js');
 assert.match(teardown,/awaitConfirmedUnmount/);
});
