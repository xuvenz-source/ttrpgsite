import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const dir='staging/world-v2-b10-r18-150-service-insert-privilege/';
const m=JSON.parse(read(dir+'manifest.json'));
const candidate=read(dir+'unapplied-revoke-service-role-insert.sql');
const run=read('tests/world-v2-r18-150-postgres/run.sh');
test('R150 trusted parent and no premature release',()=>{
 assert.equal(m.parentPr,257);
 assert.equal(m.parentSha,'1fb7ad406ca421b51eaaa24656a0a5b6ea6550b5');
 assert.equal(m.decision,'NO_GO');
 for(const k of ['originalSqlChanged','qaSqlChanged','runtimeEdited','versionedMigrationCreated','productionReleaseAuthorized'])assert.equal(m[k],false,k);
 for(const k of ['requiresIndependentAdminWorkflowAudit','requiresOriginalPrivate83Audit','requiresSignedActorQA','requiresR127HumanApproval'])assert.equal(m[k],true,k);
 assert.deepEqual(m.unresolvedIssues,[220,223,229,231]);
});
test('R150 only revokes privileged direct member INSERT in disposable candidate',()=>{
 assert.match(candidate,/REVOKE INSERT ON TABLE public\.campaign_members FROM service_role;/);
 assert.doesNotMatch(candidate,/GRANT\s+(?:ALL|INSERT)|CREATE\s+TRIGGER|DROP\s+TABLE|ALTER\s+TABLE/i);
 assert.ok(candidate.includes('NOT AN APPLIED MIGRATION'));
});
test('R150 runner tests SEC DEFINER authoring and never connects hosted',()=>{
 for(const token of ['GITHUB_ACTIONS','R150_ISOLATED','127.0.0.1','world_v2_r18_150',
 'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','has_table_privilege',
 'service-direct-dm','service-direct-player','browser-direct','synthetic_create_campaign',
 'dm_remove_campaign_player','revoked-rejoin','TRUNCATE','NO_GO'])assert.ok(run.includes(token),token);
 assert.doesNotMatch(run,/\bsupabase\s+(?:link|db|deploy|migration)\b/);
 const fixture=read('tests/world-v2-r18-150-postgres/synthetic-create-campaign.sql');
 assert.match(fixture,/SECURITY DEFINER/);
 assert.match(fixture,/auth.uid\(\)/);
 assert.match(fixture,/VALUES\(p_campaign,actor,'dm'\)/);
});
test('R150 refuses to certify originals/admin workflows',()=>{
 const doc=read('docs/testing/world-v2-r18-150-service-role-insert-privilege-2026-11-21.md');
 for(const x of ['67','83','service_role','create_campaign','join_campaign',
 'Realtime','Storage','R127','NO_GO','QA','INSERT'])assert.ok(doc.includes(x),x);
 assert.equal(m.ownerAndPrivilegedFunctionBypassStillNeedReview,true);
});
