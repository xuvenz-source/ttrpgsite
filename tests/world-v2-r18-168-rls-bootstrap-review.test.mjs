import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-168-initial-rls-bootstrap-security/manifest.json','utf8'));
test('R168 exact R167 source-only parent and NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-168');assert.equal(m.parentPr,276);assert.equal(m.parentSha,'e16320f5d15894a083f1724046fc314905012266');
 assert.equal(m.decision,'NO_GO');assert.equal(m.sourceOnly,true);
 assert.ok(Object.values(m.immutability).every(x=>x===true));
 for(const key of ['original83FullySemanticReviewed','remaining67PrivilegedFunctionsApproved','qaSchemaInstalled','signedQaAuthCompleted','ownerReleaseApproved']) assert.equal(m[key],false,key);
});
test('R168 original first-party policy chronology and gap until RLS bootstrap',()=>{
 const history=m.historicalReadOnlyInspection;
 assert.equal(history.length,3);
 assert.equal(history[0].createsCoreTables.length,7);
 assert.equal(history[0].initialTablesMayBeExposedBeforeSubsequentRls,true);
 assert.equal(history[1].createsPolicies,19);
 assert.equal(history[1].allCreatedPoliciesToAuthenticated,true);
 assert.equal(history[1].anonymousOrPublicPolicyCreated,false);
 assert.equal(history[2].dropsPolicy,'members view characters');
 assert.equal(history[2].createsPolicy,'owner or dm read characters');
 assert.ok(history.every(x=>x.securitySemanticApproval===false));
});
test('R168 current direct RLS positive checks cannot grant privileged definer signoff',()=>{
 const c=m.currentCatalogCrosscheck;
 assert.equal(c.publicApplicationTables,31);
 assert.equal(c.publicTablesWithoutRls,0);
 assert.equal(c.anonymousSelectablePublicTables,0);
 assert.equal(c.totalPublicPolicies,77);
 assert.equal(c.directCharacterSelect.currentMembershipPredicate,true);
 assert.equal(c.directCharacterUpdate.hasWithCheck,true);
 assert.equal(c.directMapTokenSelect.canObserveMapToken,true);
 assert.equal(c.mapCombatSelect.knownIssue,212);
 assert.ok(m.replaySecuritySequence.some(x=>x.includes('partial')||x.includes('foundational')));
 assert.deepEqual(m.openSecurityIssues,[212,218,220,223,229,231]);
 assert.equal(m.hardeningIssue,275);
});
