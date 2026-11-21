import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-169-combat-token-rpc-audit/manifest.json','utf8'));

test('R169 exact R168 parent and immutable NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-169');assert.equal(m.parentPr,277);assert.equal(m.parentSha,'ee219e79d34743223c1e2b5834c5c736a0326dab');assert.equal(m.decision,'NO_GO');
 for(const k of ['sourceOnly','noOriginalOrQaWrites','noRawOriginalSqlExport','noMigrationHistoryEdit','noAppRuntimeChange','noMerge','noDeploy','noPaidInfrastructure'])assert.equal(m[k],true,k);
 assert.ok(Object.values(m.pending).every(v=>v===false));
});
test('R169 pins fourteen exact original privileged call-chain observations',()=>{
 assert.equal(m.privilegedRpcInventory.length,14);
 assert.equal(new Set(m.privilegedRpcInventory.map(x=>x.name)).size,14);
 assert.equal(m.sourceObservations.signedCallableCount,14);
 assert.equal(m.sourceObservations.anonymousCallableCount,0);
 assert.equal(m.sourceObservations.functionsWithDirectAuthUid,11);
 assert.deepEqual(m.sourceObservations.functionsDelegatingWithoutDirectAuthUid,['get_dm_map_npc_values','get_npc_token_values','publish_map_environment']);
 assert.equal(m.sourceObservations.directMutationStatementFunctions,9);
 assert.equal(m.sourceObservations.detectedMutationFunctionsWithAuthHelperAhead,9);
 assert.equal(m.sourceObservations.detectedMutationFunctionsWithoutAuthHelperAhead,0);
 assert.ok(m.privilegedRpcInventory.every(x=>x.authenticatedExecute&&!x.anonymousExecute&&!x.semanticApproval&&x.signedQa==='NOT_RUN'));
 assert.ok(m.privilegedRpcInventory.every(x=>/^[a-f0-9]{32}$/.test(x.sourceMd5)&&x.sourceBytes>0));
});
test('R169 does not confuse heuristic guard checks with signed QA',()=>{
 assert.equal(m.signedQaCases.length,14);
 assert.equal(new Set(m.signedQaCases.map(x=>x.id)).size,14);
 assert.ok(m.signedQaCases.every(x=>x.result==='NOT_RUN'));
 assert.equal(m.sourceObservations.sourceHeuristicNotProof,true);
 assert.deepEqual(m.securityBlockers,[212,218,220,223,229,231]);
 assert.equal(m.defenseInDepthIssue,275);
});
