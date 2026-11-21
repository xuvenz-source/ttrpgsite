import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const base='staging/world-v2-b10-r18-154-private-history-offline-assessment/';
const m=read(base+'manifest.json');
const c=read(base+'sanitized-report-contract.json');
const python=readFileSync(join(root,'scripts/release/r154_private_history_audit.py'),'utf8');
const doc=readFileSync(join(root,'docs/testing/world-v2-r18-154-offline-history-assessment-2026-11-21.md'),'utf8');

test('R154 parent exact green R153 and release NO_GO preserved',()=>{
 assert.equal(m.workPackage,'B10-R18-154');
 assert.equal(m.parentPr,261);
 assert.equal(m.parentSha,'ad4fe88e0c073541e084349d3deafee8cb4b06a8');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.sourceOnly,true);
 assert.equal(m.ownerDirection,'TRUST_AI_TECHNICAL_ASSESSMENT_PROCEED_AUTONOMOUSLY');
 assert.equal(m.firstPartyAssessmentPermitted,true);
 assert.equal(m.independentSecurityReviewCertified,false);
 assert.equal(m.firstPartyAssessmentIsIndependent,false);
 assert.equal(m.originalSqlChanged,false);
 assert.equal(m.qaSqlChanged,false);
 assert.equal(m.runtimeSourceChanged,false);
 assert.equal(m.versionedMigrationsChanged,false);
 assert.equal(m.exposedBrowserGrantsAdded,0);
 assert.equal(m.merged,false);
 assert.equal(m.deployed,false);
 assert.equal(m.paidResourcesUsed,false);
 assert.equal(m.productionReleaseAuthorized,false);
 assert.deepEqual(m.unresolvedIssues,[220,223,229,231]);
});

test('R154 operator history and signed QA states never marked completed',()=>{
 assert.equal(m.operatorReadOnlyOriginalHistorySha256Matched,83);
 assert.equal(m.operatorR111SecurityApprovals,0);
 assert.equal(m.offlineAuditorExecutedAgainstOriginalHistory,false);
 assert.equal(m.sanitizedOperatorReportReceived,false);
 assert.equal(m.original67SecurityDefinerCallChainsReviewed,false);
 assert.equal(m.actualOriginalStoragePolicySemanticsResolved,false);
 assert.equal(m.realSignedQAExecuted,false);
 assert.equal(m.originalHistoryQAReplayed,false);
 assert.equal(m.r127HumanProductionApproval,false);
 assert.equal(m.rolloutGates.length,5);
});

test('R154 offline audit cannot access SQL network, original hosted DB or private data in outputs',()=>{
 for(const s of ['PRIVATE_AUDIT_NO_GO','sourceBodySha256','MAX_SQL_BYTES',
   'stat.S_IMODE','is_symlink()','st.st_nlink','hashlib.sha256',
   'securityApproved','NO_GO','filenames_exported','private_sql_exported',
   'independent_security_review_completed','signed_qa_completed',
   'production_release_authorized']){
  assert.ok(python.includes(s),s);
 }
 assert.doesNotMatch(python,/^\s*(?:import|from)\s+(?:socket|urllib|requests|http|subprocess|psycopg|supabase)\b/m);
 assert.doesNotMatch(python,/https?:\/\/|CREATE\s+CLIENT/i);
 assert.equal(c.noNetworkAccess,true);
 assert.equal(c.noDatabaseConnections,true);
 assert.equal(c.noFilesWrittenByAuditor,true);
 assert.equal(c.noSqlTextInReport,true);
 assert.equal(c.noPathsOrFilenamesInReport,true);
 assert.equal(c.fullyAutomatedIndependentReview,false);
 assert.equal(c.authorizedToRunHostedSql,false);
 assert.equal(c.productionReleaseAuthorized,false);
});

test('R154 documents no independent approval and exact private-data boundary',()=>{
 for(const v of ['83','67','R111','R127','NO_GO','private','offline','independent',
 'signed','QA','no private SQL']){
  assert.ok(doc.toLowerCase().includes(v.toLowerCase()),v);
 }
});
