import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-182-dynamic-rpc-lineage/manifest.json','utf8'));
test('R182 correct exact previous source and persistent NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-182');
 assert.equal(m.parentPr,290);
 assert.equal(m.parentSha,'6eced6676b262259aa9b30a007a5ea32df6c6706');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.originalRegisteredMigrationLineageObservedInPlace,true);
 assert.equal(m.privateSqlBodiesExported,false);
 for(const k of ['noOriginalOrQaWrites','noVersionedMigrationChanges','noRuntimeChanges','noMerge','noDeploy','noPaidInfrastructure'])assert.equal(m[k],true,k);
 for(const k of ['pg17SyntheticRunPassed','all83HistorySemanticSignoff','all67DefinerSignoff','signedQaPassed','qaMigrationsInstalled','ownerQaApproval','r127ProductionApproval'])assert.equal(m[k],false,k);
});
test('both dynamic targets require exact chronological R06074748 and static map helper stays separate',()=>{
 const d=m.dynamicRewrite;
 assert.equal(d.version,'20261106074754');
 assert.equal(d.staticCanViewMapDefinition,true);
 assert.deepEqual(d.targets.map(x=>x.function),[
  'public.get_token_monitor_values(p_map uuid)',
  'public.post_token_reference(p_token uuid,p_code text)'
 ]);
 assert.ok(d.targets.every(x=>x.priorMigration==='20261106074748'&&x.sourceAnchorOccurrence===1&&!x.sourceExactFullMigrationReplayed));
 assert.equal(d.completeReapplicationExpectedToFailOnMonitorGuard,true);
 assert.equal(d.selectiveSecondRewriteIdempotent,false);
 assert.deepEqual(m.chronology.getTokenMonitorValues.map(x=>x.version),[
  '20261105144953','20261105151706','20261106074748','20261107110539'
 ]);
});
test('scratch SQL includes actor denial, authorized map test and guarded repeat rejection',()=>{
 const s=readFileSync('tests/world-v2-r18-182-postgres/run.sh','utf8');
 for(const key of ['GITHUB_ACTIONS','R182_ISOLATED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PGHOSTADDR','world_v2_r18_182'])assert.ok(s.includes(key));
 const pre=readFileSync('tests/world-v2-r18-182-postgres/verify-before.sql','utf8');
 const after=readFileSync('tests/world-v2-r18-182-postgres/verify-after.sql','utf8');
 const patch=readFileSync('tests/world-v2-r18-182-postgres/rewrite-model.sql','utf8');
 assert.match(pre,/pre-patch owner-only token reference bypass not reproduced/);
 assert.match(after,/revoked P1 token reference survived/);
 assert.match(patch,/get_token_monitor_values/);
 assert.match(patch,/post_token_reference/);
 assert.match(patch,/Expected monitor map check not found/);
});
