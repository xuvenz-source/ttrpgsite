import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-161-original-history-ai-audit/manifest.json','utf8'));
test('R161 exact-parent, source-only, no self-authorization',()=>{
 assert.equal(m.workPackage,'B10-R18-161');
 assert.equal(m.parentPr,268);
 assert.equal(m.parentSha,'e5dec83f2158344c6deed0663d66273df09ad4c1');
 assert.equal(m.decision,'NO_GO');
 for(const k of ['sourceOnly','originalAndQaSqlUnchanged','noOriginalSqlExport','noVersionedMigrationCreated','noRuntimeSourceChanges','noMerge','noDeploy','noPaidResources'])assert.equal(m[k],true,k);
 for(const k of ['technicalAuditCompleted','independentHumanReviewPerformed','ownerAcceptsNoSecondPartyReview','all67CallableDefinerPathsSemanticallyReviewed','hostedQaSignedAcceptancePassed'])assert.equal(m[k],false,k);
});
test('R161 provenance inventory partitions 83 stored bodies and 62 git files',()=>{
 assert.equal(m.counts.originalMigrationRecords,83);
 assert.equal(m.counts.originalWithStoredSql,83);
 assert.equal(m.counts.originalBytes,709936);
 assert.equal(m.sourceInventory.length,83);
 assert.equal(new Set(m.sourceInventory.map(x=>x.version)).size,83);
 assert.equal(m.sourceInventory.reduce((a,x)=>a+x.storedSqlBytes,0),709936);
 assert.equal(m.sourceInventory.filter(x=>x.sourceComparison==='EXACT_GIT_BLOB').length,47);
 assert.equal(m.sourceInventory.filter(x=>x.sourceComparison==='WHITESPACE_AND_LINE_COMMENT_NORMALIZED_MATCH').length,14);
 assert.equal(m.sourceInventory.filter(x=>x.sourceComparison==='ORIGINAL_ONLY').length,22);
 assert.equal(m.gitOnlyUnappliedCandidate.length,1);
 assert.equal(m.counts.trackedGitSqlFiles,62);
 assert.equal(m.gitOnlyUnappliedCandidate[0],'20261111023204_world_v2_b10_integrated_motion.sql');
 assert.equal(m.sourceInventory.filter(x=>x.gitFile).length+ m.gitOnlyUnappliedCandidate.length,62);
 assert.ok(m.sourceInventory.every(x=>x.semanticAudit==='NOT_YET_COMPLETED'));
});
test('R161 keeps only sanitized metadata and refuses false normalized-content approval',()=>{
 assert.match(m.normalizationCaveat,/heuristic only/);
 assert.equal(m.sourceRiskFlags,'LEXICAL_TRIAGE_ONLY_NOT_SEMANTIC_APPROVAL');
 assert.ok(m.sourceInventory.every(x=>!('sql' in x)&&!('body' in x)&&!('sourceText' in x)));
 assert.ok(m.sourceInventory.every(x=>Array.isArray(x.lexicalRiskHints)));
 assert.equal(m.reviewerModel,'AI_LED_TECHNICAL_AUDIT_NO_INDEPENDENT_SECOND_REVIEWER');
});
