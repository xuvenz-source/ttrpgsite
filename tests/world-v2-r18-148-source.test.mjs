import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-148-privileged-membership-guards/';
const m=JSON.parse(read(base+'manifest.json'));
const sql=read(base+'unapplied-privileged-membership-guards.sql');
const runner=read('tests/world-v2-r18-148-postgres/run.sh');
const docs=read('docs/testing/world-v2-r18-148-privileged-membership-guards-2026-11-21.md');
test('R148 exact green R147 ancestor and NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-148');
 assert.equal(m.parentPr,255);
 assert.equal(m.parentSha,'471a7b2349e98477909ab67143e272f98f9ef548');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.sourceOnly,true);
 assert.equal(m.productionReleaseAuthorized,false);
 for(const k of ['newRuntimeSourceEdits','newVersionedMigrations','newExposedApiGrants','hostedSqlMutations','hostedDeployments','merges','paidResources']) assert.equal(m[k],0,k);
 assert.deepEqual(m.unresolvedIssues,[220,223,229,231]);
 assert.equal(m.originalReadOnlyGrantAttestation.serviceRoleHasTruncate,true);
 assert.equal(m.originalReadOnlyGrantAttestation.serviceRoleBypassesRls,true);
 assert.equal(m.originalReadOnlyGrantAttestation.campaignMembersCustomTriggers,0);
});
test('R148 guard is a separate uninstalled R120/R122-compatible candidate',()=>{
 for(const x of [
  'BEFORE TRUNCATE ON public.campaign_members',
  'FOR EACH STATEMENT',
  'REVOKE TRUNCATE ON public.campaign_members',
  'FROM PUBLIC,anon,authenticated,service_role',
  'BEFORE UPDATE OF role ON public.campaign_members',
  'OLD.role IS DISTINCT FROM NEW.role',
  "ERRCODE='42501'",
  'never-revoked account',
 ]) assert.ok(sql.toLowerCase().includes(x.toLowerCase()),x);
 assert.doesNotMatch(sql,/GRANT\s+(?:ALL|TRUNCATE)\s+ON/i);
 assert.doesNotMatch(sql,/DISABLE TRIGGER|DROP TABLE|TRUNCATE\s+public\./i);
});
test('R148 runner has strict no-hosted guard and negative escalation cases',()=>{
 for(const x of [
  'GITHUB_ACTIONS','R148_ISOLATED','127.0.0.1','world_v2_r18_148',
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY',
  'CREATE ROLE service_role NOLOGIN BYPASSRLS','has_table_privilege',
  'owner-truncate','service-role-upgrade','owner-role-demote',
  'no-op role UPDATE','old-invite','new-dm-negative-control',
  'ROLLBACK','NO_GO'
 ]) assert.ok(runner.toLowerCase().includes(x.toLowerCase()),x);
 assert.doesNotMatch(runner,/\bsupabase\s+(?:link|db|deploy|migration)\b/);
});
test('R148 retains fresh DM INSERT risk and real-world blockers',()=>{
 assert.equal(m.negativeControl,'PRIVILEGED_NEW_DM_INSERT_STILL_POSSIBLE_FOR_UNREVOKED_IDENTITY');
 assert.equal(m.exactSourceOriginalSchemaReplayed,false);
 assert.equal(m.realSignedActorsTested,false);
 assert.equal(m.realServiceRoleWorkflowsAudited,false);
 for(const x of ['83','QA','67','TRUNCATE','Realtime','Storage','R127','INSERT','DM','service_role','NO_GO']) assert.ok(docs.includes(x),x);
});
