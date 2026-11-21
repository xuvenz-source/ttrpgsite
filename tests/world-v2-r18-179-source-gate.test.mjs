import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-179-revoked-sheet-invite-combined/manifest.json','utf8'));
const hash=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)).update(Buffer.from([0])).update(s).digest('hex');
test('exact R178 parent, immutable NO_GO',()=>{
 assert.equal(m.parentPr,287);assert.equal(m.parentSha,'7f97035a752cf9e8ae89ca52079bb8be2fc7295e');
 assert.equal(m.decision,'NO_GO');
 for(const k of ['noHostedWrites','noActiveRuntimeEdits','noVersionedMigrationEdits','noMerge','noDeploy','noPaidInfrastructure'])
  assert.equal(m[k],true,k);
 for(const k of ['syntheticPg17Passed','signedHostedQaPassed','all83HistoricalSemanticAuditPassed','all67PrivilegedChainsApproved','originalHostedRepairsApplied','qaSchemaInstalled','ownerReleaseApproved'])
  assert.equal(m[k],false,k);
});
test('six staged scratch candidates unchanged and pinned',()=>{
 assert.deepEqual(m.existingCandidates.map(x=>x.step),['R115','R120','R122','R148','R150','R173']);
 for(const c of m.existingCandidates){assert.equal(hash(readFileSync(c.path,'utf8')),c.gitBlobSha,c.step);assert.equal(c.hostedApplied,false);}
});
test('one PG17 file first proves negative control then loads R115 before positive assertions',()=>{
 const src=readFileSync('tests/world-v2-r18-179-postgres/combined.sql','utf8');
 assert.ok(src.indexOf('UNSAFE_REVOKED_OWNER_WRITE')<src.indexOf('\\i staging/world-v2-b10-r18-115-'));
 assert.ok(src.indexOf('\\i staging/world-v2-b10-r18-115-')<src.indexOf('BAD_POST_FIX'));
 assert.match(src,/removed owner still mutates sheet after R115/);
 assert.match(src,/reinstated owner denied/);
 assert.match(src,/auth deletion retained removed ID/);
 assert.match(src,/INTENTIONALLY VULNERABLE synthetic/);
 assert.equal(m.expectedPhases.length,12);
});
test('runner requires fictional localhost CI and refuses remote targets',()=>{
 const s=readFileSync('tests/world-v2-r18-179-postgres/run.sh','utf8');
 for(const v of ['GITHUB_ACTIONS','R179_ISOLATED','world_v2_r18_179','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PGHOSTADDR'])
  assert.ok(s.includes(v));
 assert.match(s,/tests\/world-v2-r18-179-postgres\/combined.sql/);
});
