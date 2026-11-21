import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-170-high-risk-history-marker-adjudication/manifest.json','utf8'));

test('R170 exact R169 source-only child and NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-170');assert.equal(m.parentPr,278);assert.equal(m.parentSha,'e867a8d48293ac3903036d946f7b160b368e8ec8');assert.equal(m.decision,'NO_GO');
 assert.equal(m.totalMigrationSources,83);
 for(const k of ['originalSqlInPlaceReadOnly','sourceOnly','noHostedSqlWrites','noMigrationHistoryChanges','noRuntimeChanges','noMerge','noDeploy','noPaidResources'])assert.equal(m[k],true,k);
 for(const k of ['rawOriginalSqlExported','history83SemanticApproval','all67RpcApproval','qaInstalled','realSignedQaPassed','productionReleaseApproved'])assert.equal(m[k],false,k);
});
test('R170 high-risk history markers are reconciled without grant alarm overstatement',()=>{
 const x=m.sourceMarkers;
 assert.equal(x.dynamicExecuteFormatFiles,1);assert.equal(x.userMetadataFiles,1);assert.equal(x.serviceRoleIdentifierFiles,10);
 assert.equal(x.storageObjectsTextFiles,5);assert.equal(x.directStorageObjectsDmlFiles,0);
 assert.equal(x.heuristicPublicOrAnonFunctionGrantFiles,5);
 assert.equal(x.actualPublicOrAnonExecuteGrantsInFiveSuspectFiles,0);
 assert.equal(x.actualAuthenticatedExecuteGrantsInFiveSuspectFiles,22);
 assert.equal(x.filesWithExtensionOrAlterRoleMarker,1);
 assert.equal(x.filesWithFunctionDeclarationMarker,66);
 const p=m.priorityAdjudications;
 assert.equal(p.length,8);
 assert.equal(p.find(y=>y.version==='20261105112515').formatIdentifierEscaped,true);
 assert.equal(p.find(y=>y.version==='20261106090848').usesAuthJwtForPermission,false);
 assert.equal(p.filter(y=>y.actualAuthenticatedExecuteGrantStatements).reduce((a,y)=>a+y.actualAuthenticatedExecuteGrantStatements,0),22);
 assert.equal(m.history83SemanticApproval,false);
});
test('R170 keeps known issues, reviewer and signed QA gates unresolved',()=>{
 assert.deepEqual(m.openIssues,[212,218,220,223,229,231]);
 assert.equal(m.latentGrantHardeningIssue,275);
 assert.ok(m.interpretationConstraints.some(x=>x.includes('statement-aware')));
 assert.ok(m.requiredNextReview.some(x=>x.includes('QA')));
});
