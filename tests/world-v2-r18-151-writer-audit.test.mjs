import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditR151,R151_LIVE_ENABLED} from
 '../staging/world-v2-b10-r18-151-member-writer-audit/TrackedMemberWriterAudit.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir='staging/world-v2-b10-r18-151-member-writer-audit/';
const read=p=>readFileSync(join(root,p),'utf8');
const m=JSON.parse(read(dir+'manifest.json'));
const s=JSON.parse(read(dir+'tracked-repo-writer-snapshot.json'));
test('R151 scripts/Edge scan is scoped and does not authorize hosting',()=>{
 const r=auditR151({root});
 assert.equal(R151_LIVE_ENABLED,false);
 assert.equal(r.scannedScriptAndEdgeFiles,56);
 assert.equal(r.trackedLiteralDirectMembershipWritersFound,0);
 assert.equal(r.externalWritersDisproved,false);
 assert.equal(r.manualOperatorReviewRequired,true);
 assert.equal(r.releaseAuthorized,false);
});
test('R151 refuses to suppress external admin, deployed Edge or original history uncertainty',()=>{
 for(const fn of [x=>{x.externalIntegrationsCovered=true;},
 x=>{x.sourceSnapshotIsNotAttestationOfDeployedEdgeFunctions=false;},
 x=>{x.privateHistorical83BodiesSemanticReviewed=true;}]){
  const fake=structuredClone(s);fn(fake);
  assert.throws(()=>auditR151({root,snapshotOverride:fake}),/scope or limitations/);
 }
 const fake=structuredClone(m);fake.realAdminWriterInventoryComplete=true;
 assert.throws(()=>auditR151({root,manifestOverride:fake}),/hidden release gate/);
});
test('R151 SQL, deployment and source gates remain NO_GO',()=>{
 assert.deepEqual(m.unresolvedIssues,[220,223,229,231]);
 assert.equal(m.manualOperatorInputNeeded.length,3);
 for(const name of ['noOriginalOrQaSqlChanges','noRuntimeChanges','noMigrationChanges','noBrowserGrants','noMerge','noDeploy','noPaidResources'])assert.equal(m[name],true);
 const doc=read('docs/testing/world-v2-r18-151-writer-boundary-audit-2026-11-21.md');
 for(const t of ['83','67','service_role','R127','Storage','Realtime','NO_GO','QA','external','56'])assert.ok(doc.includes(t),t);
});
