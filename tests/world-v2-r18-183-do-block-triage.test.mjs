import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-183-do-block-triage/manifest.json','utf8'));
test('R183 exact source-only parent and uncompromising NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-183');
 assert.equal(m.parentPr,291);
 assert.equal(m.parentSha,'bfe5c68496dabbddbaffc5f2e2df06c88975a0ce');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.originalMigrationCount,83);assert.equal(m.executableTopLevelStatements,937);
 for(const k of ['noHostedWrites','noPrivateSqlExport','noRootMigrationChange','noRuntimeChange','noMerge','noDeploy','noPaidResources'])
 assert.equal(m[k],true,k);
 for(const k of ['original83SemanticSignoff','all67PrivilegedFunctionSignoff','qaHistoryReplayApproved','qaMigrationsInstalled','signedQAPassed','ownerQaInstallApproval','productionApproved'])
 assert.equal(m[k],false,k);
});
test('all 12 DO blocks classified but none approved',()=>{
 assert.equal(m.inPlaceDoBlockCount,12);
 assert.equal(m.doBlocks.length,12);
 assert.deepEqual([...new Set(m.doBlocks.map(x=>x.id))].length,12);
 assert.ok(m.doBlocks.every(x=>x.sourceInspectedInPlace&&!x.sqlBodyExported&&!x.fullSemanticApproval&&!x.hostedSignedReplayPassed));
 assert.deepEqual(Object.values(m.classes).reduce((a,b)=>a+b,0),12);
 for(const [k,n] of Object.entries(m.classes))assert.equal(m.doBlocks.filter(x=>x.category===k).length,n,k);
});
test('sensitive replay effects cannot be confused with plain no-op SQL',()=>{
 const s=m.sourceDerivedConclusions;
 assert.equal(s.DODataMutationTarget,'public.campaigns.token_display_config');
 assert.deepEqual(s.DORpcPatchTargets,['public.get_token_monitor_values(p_map uuid)','public.post_token_reference(p_token uuid,p_code text)']);
 assert.ok(s.DORealtimeIncludesSensitiveCandidateTables.includes('public.characters'));
 assert.ok(s.DORealtimeIncludesSensitiveCandidateTables.includes('public.npc_templates'));
 assert.equal(s.privatePublicationRlsSignedQaVerified,false);
 assert.equal(s.historicalBackfillDataIdempotenceVerified,false);
 assert.equal(s.completeDynamicPatchSourceReplayVerified,false);
});
