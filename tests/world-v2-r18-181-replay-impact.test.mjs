import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-181-history-replay-impact/manifest.json','utf8'));
test('R181 exact R180 parent, no hosted writes or semantic signoff',()=>{
 assert.equal(m.workPackage,'B10-R18-181');
 assert.equal(m.parentPr,289);
 assert.equal(m.parentSha,'9412e8e35a7a1251f341f13e98156823eda5b912');
 assert.equal(m.decision,'NO_GO');
 for(const k of ['sourceOnly','noHostedWrites','noRawPrivateSqlExport','noRuntimeChange','noVersionedMigrationEdit','noMerge','noDeploy','noPaidResources'])
  assert.equal(m[k],true,k);
 for(const k of ['all83MigrationSemanticApproval','all67PrivilegedFunctionChainsApproved','qaHistoryReplayApproved','qaSchemaInstalled','ownerQaInstallApproved','signedQaPassed','originalSecurityPatchesApplied','productionReleaseApproved'])
  assert.equal(m[k],false,k);
});
test('83 original registered SQL sources, top-level categories and unresolved DO blocks',()=>{
 assert.equal(m.exactOriginalMigrationRecordCount,83);
 assert.equal(m.lexicalSegments,943);
 assert.equal(m.topLevelStatements,937);
 assert.equal(m.nonSqlTrailingCommentSegments,6);
 assert.equal(m.topLevel.deleteCount,0);assert.equal(m.topLevel.truncateCount,0);
 assert.equal(m.topLevel.updateCount,4);assert.equal(m.topLevel.insertCount,3);
 assert.equal(m.topLevel.dropCount,40);assert.equal(m.topLevel.dropPolicyCount,23);
 assert.equal(m.topLevel.dropTriggerCount,17);assert.equal(m.topLevel.dropTableCount,0);
 assert.equal(m.topLevel.doBlockCount,12);
 assert.equal(m.topLevel.grantCount,111);assert.equal(m.topLevel.revokeCount,190);
 assert.equal(m.unknownLeadingStatementParses,0);
 assert.equal(Object.values(m.recognizedHeadDistribution).reduce((a,b)=>a+b,0),937);
 assert.equal(m.doBlocks.reduce((n,x)=>n+x.statements,0),12);
 assert.ok(m.doBlocks.every(x=>x.fullySemanticReviewed===false));
});
test('four direct UPDATEs and three Storage bucket INSERTs cannot be marked safe by syntax alone',()=>{
 assert.deepEqual(m.topLevelUpdates.map(x=>x.table),['battle_maps','chat_messages','campaign_tool_issues','map_visibility_ticks']);
 assert.ok(m.topLevelUpdates.every(x=>x.wherePresent&&x.dataEffectSemanticApproval===false));
 assert.equal(m.topLevelInserts.length,3);
 assert.ok(m.topLevelInserts.every(x=>x.table==='storage.buckets'&&x.explicitPrivateFlag&&x.hasOnConflict&&!x.semanticApproval));
 assert.equal(m.doBlockWithNestedDataUpdate,'20261105163541');
 assert.deepEqual(m.doBlocksWithDynamicExecute,['20261105112515','20261106074754']);
});


test('historical DO rewrites only existing monitor/reference RPCs, not static map helper',()=>{
 const d=m.dynamicFunctionRewrite;
 assert.equal(d.version,'20261106074754');
 assert.equal(d.mapAuthorizationFunctionDefinedStatically,'public.can_view_campaign_map(uuid,uuid)');
 assert.equal(d.rewriteMechanism,'DO_BLOCK_PG_GET_FUNCTIONDEF_STRING_REPLACE_EXECUTE');
 assert.deepEqual(d.targetFunctions.map(x=>x.name),['public.get_token_monitor_values','public.post_token_reference']);
 assert.deepEqual(d.targetFunctions.map(x=>x.signature),['(p_map uuid)','(p_token uuid,p_code text)']);
 assert.ok(d.targetFunctions.every(x=>x.matchRequired&&x.exactPriorBodyVerified===false&&x.signedRegressionPassed===false));
 assert.equal(d.sourcePatternChecked,true);
 assert.equal(d.exactChronologicalInputDefinitionsProven,false);
 assert.equal(d.allRewrittenRpcsApproved,false);
 assert.equal(d.isolatedReplayCompatibilityVerified,false);
 assert.equal(d.releaseGate,'DO_NOT_EXPOSE_QA_API_DURING_HISTORY_REPLAY');
});
