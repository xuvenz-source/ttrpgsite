import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(join(root,'staging/world-v2-b10-r18-160-forward-security-repair-gates/manifest.json'),'utf8'));
const read=(p)=>readFileSync(join(root,p),'utf8');
const gitBlob=(s)=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');

test('R160 is exactly parented to R159 and cannot be mistaken for release approval',()=>{
 assert.equal(manifest.workPackage,'B10-R18-160');
 assert.equal(manifest.parentPr,267);
 assert.equal(manifest.parentSha,'ddf48efc2a53a26aeab033799e4f52898fbb3343');
 assert.equal(manifest.decision,'NO_GO');
 for(const flag of ['sourceOnly','noOriginalOrQaWrites','noVersionedMigrations','noRuntimeSourceChanges','noMerge','noDeploy','noPaidResources','manualActionNeededForNextReleaseGate']){
  assert.equal(manifest[flag],true,flag);
 }
 assert.equal(Object.values(manifest.negativeReleaseClaims).every(x=>x===false),true);
 assert.ok(manifest.sharedPrerequisites.every(x=>x.passed===false));
});

test('R160 references exactly the four independently staged, byte-pinned SQL candidates',()=>{
 assert.deepEqual(manifest.candidateSources.map(x=>x.issue),[220,212,223,229]);
 assert.deepEqual(manifest.candidateSources.map(x=>x.pr),[219,206,226,228]);
 assert.ok(manifest.candidateSources.every(x=>x.mustPrecedeSignedQa));
 for(const x of manifest.candidateSources){
  assert.match(x.path,/^staging\/world-v2-b10-r18-(104|115|120|122)-/);
  const content=read(x.path);
  assert.equal(gitBlob(content),x.gitBlobSha,x.key+' unexpectedly changed');
  assert.match(content,/UNAPPLIED|DO NOT APPLY|NOT A MIGRATION|NOT a versioned migration/i,x.key);
 }
});

test('R160 pins essential authorization boundaries, not just optimistic source flags',()=>{
 const sheet=read(manifest.candidateSources[0].path);
 assert.match(sheet,/not exists\s*\(\s*select 1 from public\.campaign_members/i);
 assert.match(sheet,/m\.campaign_id=p_campaign and m\.user_id=actor/i);
 assert.match(sheet,/REVOKE ALL ON FUNCTION public\.can_edit_campaign_sheet/);
 const fog=read(manifest.candidateSources[1].path);
 assert.match(fog,/public\.can_view_campaign_map\(m\.campaign_id,m\.id\)/);
 assert.match(fog,/r\.map_id=m\.id AND r\.campaign_id=m\.campaign_id/);
 assert.match(fog,/REVOKE ALL ON FUNCTION public\.is_map_fog_published/);
 const invites=read(manifest.candidateSources[2].path);
 assert.match(invites,/forge_security\.campaign_member_revocations/);
 assert.match(invites,/reject_revoked_member_insertion/);
 assert.match(invites,/dm_reinstate_campaign_player/);
 const writers=read(manifest.candidateSources[3].path);
 assert.match(writers,/reject_campaign_member_identity_update/);
 assert.match(writers,/TRUNCATE[\s\S]*bypasses row DELETE triggers/i);
 assert.match(writers,/No REVOKE is staged yet/i);
 assert.ok(manifest.invariants.some(x=>/already issued signed bearer URL/.test(x)));
});

test('R160 signed QA matrix is complete but genuinely unexecuted',()=>{
 const cases=manifest.qaAcceptanceMatrix;
 assert.equal(cases.length,18);
 assert.equal(new Set(cases.map(x=>x.id)).size,18);
 assert.ok(cases.every(x=>x.result==='NOT_RUN'));
 assert.equal(cases.filter(x=>x.executionContext==='SIGNED_QA_AUTH').length,17);
 assert.equal(cases.filter(x=>x.executionContext==='CONTROLLED_PRIVILEGED_WRITER_AUDIT').length,1);
 for(const word of ['fog','sheet','invite','signed','realtime','truncate','motion','storage']){
  assert.ok(cases.some(x=>x.operation.includes(word)),word);
 }
 const gates=manifest.sharedPrerequisites;
 assert.equal(gates.length,10);
 assert.ok(gates.find(x=>x.id==='H01')?.requiresTrustedOperator);
 assert.ok(gates.find(x=>x.id==='H07')?.requiresOperatorApproval);
 assert.ok(gates.find(x=>x.id==='H09')?.requiresSignedQa);
 assert.ok(gates.find(x=>x.id==='H10')?.requiresOwnerApproval);
});
