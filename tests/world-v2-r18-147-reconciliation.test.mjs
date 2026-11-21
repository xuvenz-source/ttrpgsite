import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditR147,R147_LIVE_ENABLED} from
 '../staging/world-v2-b10-r18-147-revocation-candidate-reconciliation/CandidateReconciliationAudit.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const path='staging/world-v2-b10-r18-147-revocation-candidate-reconciliation/manifest.json';
const manifest=JSON.parse(readFileSync(join(root,path),'utf8'));
const clone=o=>JSON.parse(JSON.stringify(o));
test('R147 five exact Git blob candidates are reconciled without live activation',()=>{
 const r=auditR147({root});
 assert.equal(R147_LIVE_ENABLED,false);
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.reusedCandidates,5);
 assert.equal(r.releaseAuthorized,false);
 assert.deepEqual(r.unresolvedIssues,[220,223,229,231]);
});
test('R147 cannot silently mark original privilege, invite or old socket resolved',()=>{
 for(const gap of Object.keys(manifest.gaps)){
  const altered=clone(manifest);altered.gaps[gap]=false;
  assert.throws(()=>auditR147({root,manifestOverride:altered}),/open gap suppressed/);
 }
 const altered=clone(manifest);altered.currentOriginalFixesInstalled=true;
 assert.throws(()=>auditR147({root,manifestOverride:altered}),/release\/ancestry gate/);
});
test('R147 refuses substitution of a drifted or missing prior candidate',()=>{
 const c=manifest.priorCandidates[0],changed=clone(manifest);
 changed.priorCandidates[0].gitBlob='0'.repeat(40);
 assert.throws(()=>auditR147({root,manifestOverride:changed}),/Git blob drift/);
 const data=readFileSync(join(root,c.path),'utf8').replace(/public\.campaign_members m/g,'public.campaign_memberz m');
 assert.throws(()=>auditR147({root,sourceOverride:{[c.path]:data}}),/Git blob drift/);
});
test('R147 preserves all original 83-migration and runtime releases as NO_GO',()=>{
 assert.equal(manifest.noHostedWrites,true);
 assert.equal(manifest.noVersionedMigrations,true);
 assert.equal(manifest.noRuntimeSourceChanges,true);
 assert.equal(manifest.noNewGrants,true);
 assert.equal(manifest.noDeployment,true);
 assert.equal(manifest.noMerge,true);
 assert.equal(manifest.currentOriginalFixesInstalled,false);
 assert.equal(manifest.allCandidateBehaviorsSignedQaVerified,false);
});
