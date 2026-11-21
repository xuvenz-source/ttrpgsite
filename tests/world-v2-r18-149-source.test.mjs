import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditR149,R149_LIVE_ENABLED} from
 '../staging/world-v2-b10-r18-149-dm-bootstrap-audit/OriginalDmBootstrapAudit.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir='staging/world-v2-b10-r18-149-dm-bootstrap-audit/';
const read=p=>readFileSync(join(root,p),'utf8');
const m=JSON.parse(read(dir+'manifest.json'));
const s=JSON.parse(read(dir+'original-function-inventory.json'));
test('R149 original source-only writer inventory is anchored and not a release',()=>{
 const a=auditR149({root});
 assert.equal(R149_LIVE_ENABLED,false);
 assert.equal(a.decision,'NO_GO');
 assert.equal(a.directMemberInsertWriters,2);
 assert.equal(a.authCallableDefinersUnreviewed,67);
 assert.equal(a.ownerMatchNotSafe,true);
 assert.equal(a.releaseAuthorized,false);
});
test('R149 refuses to conceal the privileged DM and owner-update bypass',()=>{
 for(const fn of [mm=>{mm.productionReleaseAuthorized=true;},
   mm=>{mm.ownerMatchOnlyNotSufficient=false;},
   mm=>{mm.sqlChangedOnOriginal=true;} ]){
  const mm=structuredClone(m);fn(mm);
  assert.throws(()=>auditR149({root,manifestOverride:mm}),/release or ancestor gate/);
 }
 const ss=structuredClone(s);ss.campaignsOwnerIdUpdatePriv.serviceRole=false;
 assert.throws(()=>auditR149({root,snapshotOverride:ss}),/grants or cascade boundaries/);
 const tt=structuredClone(s);tt.directMemberInsertSecurityDefiners[0].dmLiteral=false;
 assert.throws(()=>auditR149({root,snapshotOverride:tt}),/DM bootstrap/);
});
test('R149 synthetic fixture explicitly proves *failure* of simplistic owner guard',()=>{
 const p=read('tests/world-v2-r18-149-postgres/owner-match-negative-control.sql');
 const run=read('tests/world-v2-r18-149-postgres/run.sh');
 for(const term of ['synthetic_owner_match_dm','public.synthetic_create_campaign',
 'owner_id=NEW.user_id','NOT A DEPLOYABLE SQL CANDIDATE'])assert.ok(p.includes(term),term);
 for(const term of ['GITHUB_ACTIONS','R149_ISOLATED','world_v2_r18_149',
 'SUPABASE_SERVICE_ROLE_KEY','ROLLBACK','privileged-bypass.log',
 'owner_id','INSERT 0 1','NO_GO'])assert.ok(run.includes(term),term);
 assert.doesNotMatch(run,/\bsupabase\s+(?:link|db|deploy|migration)\b/);
});
test('R149 security issues and historical QA release stay blocked',()=>{
 assert.deepEqual(m.unresolvedIssues,[220,223,229,231]);
 assert.equal(m.originalMigrations,83);
 assert.equal(m.qaMigrations,0);
 assert.equal(m.qaPublicApplicationTables,0);
 assert.equal(m.humanR127ReleaseApproved,false);
 assert.equal(m.realSignedQA,false);
 const doc=read('docs/testing/world-v2-r18-149-dm-bootstrap-audit-2026-11-21.md');
 for(const term of ['67','109','145','owner_id','service_role','TRUNCATE',
 'R127','Storage','Realtime','83','NO_GO']) assert.ok(doc.includes(term),term);
});
