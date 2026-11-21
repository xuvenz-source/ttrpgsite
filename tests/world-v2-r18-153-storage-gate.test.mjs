import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditR153,R153_LIVE_ENABLED} from '../staging/world-v2-b10-r18-153-original-storage-policy-release-gate/OriginalStoragePolicyGate.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir='staging/world-v2-b10-r18-153-original-storage-policy-release-gate/';
const read=p=>JSON.parse(readFileSync(join(root,dir+p),'utf8'));
const m=read('manifest.json'),t=read('original-storage-policy-metadata.json'),a=read('signed-acceptance-matrix.json');
test('R153 release remains fail-closed on exact parent',()=>{
 const r=auditR153({root});
 assert.equal(R153_LIVE_ENABLED,false);
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.originalPolicies,8);
 assert.equal(r.permissiveSelectPolicies,3);
 assert.equal(r.unknownSelectPolicySemantics,1);
 assert.equal(r.signedCasesDefined,18);
 assert.equal(r.signedCasesExecuted,0);
 assert.equal(r.releaseAuthorized,false);
});
test('R153 rejects an invented signed QA pass and previously issued URL cutoff',()=>{
 for(const id of ['STOR-05','REV-01','REV-05','REV-06']){
  const b=structuredClone(a);const c=b.cases.find(c=>c.id===id);
  c.status='PASSED';c.actual='DENY';c.evidenceRef='invented';
  assert.throws(()=>auditR153({root,matrixOverride:b}),/signed acceptance/);
 }
 for(const id of ['REV-05','REV-06']){
  const b=structuredClone(a);
  b.cases.find(c=>c.id===id).expected='DENY';
  assert.throws(()=>auditR153({root,matrixOverride:b}),/signed acceptance/);
 }
});
test('R153 rejects hiding original SELECT policy metadata risk',()=>{
 for(const mutate of [
  o=>{o.knownOriginalSelectOrdinal7ActualSemanticsReviewed=true;},
  o=>{o.policies[6].identity=true;},
  o=>{o.policyCounts.permissive=7;}
 ]){
  const b=structuredClone(t);mutate(b);
  assert.throws(()=>auditR153({root,topologyOverride:b}),/R153 NO_GO/);
 }
 const b=structuredClone(m);b.original83SemanticReviewApprovals=83;
 assert.throws(()=>auditR153({root,manifestOverride:b}),/R153 NO_GO/);
});
test('R153 does not mark original SQL, actual signed QA or human review complete',()=>{
 assert.equal(m.parentPr,260);
 assert.equal(m.parentSha,'0fecf887e85f012b7000211407dfa4fd068da929');
 assert.equal(m.originalOrQaSqlWrites,0);
 assert.equal(m.qaHistoryDryRunApproved,false);
 assert.deepEqual(m.blockedIssues,[220,223,229,231]);
 const doc=readFileSync(join(root,'docs/testing/world-v2-r18-153-live-storage-policy-gate-2026-11-21.md'),'utf8');
 for(const term of ['83','67','OR','signed','Realtime','NO_GO','manual','R127','QA','no private SQL'])
  assert.ok(doc.toLowerCase().includes(term.toLowerCase()),term);
});
