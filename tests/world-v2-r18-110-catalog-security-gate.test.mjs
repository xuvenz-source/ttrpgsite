import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR110CatalogSecurityGate}
 from '../scripts/release/validate-world-v2-r18-110-catalog-security-gate.mjs';
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=()=>JSON.parse(readFileSync(join(ROOT,
 'staging/world-v2-b10-r18-110-live-security-gate/manifest.json'),'utf8'));
const noGo=/R110 CATALOG SECURITY NO-GO/;
test('R110 reconciles exact live-readonly catalog metadata with R102/R104/R105 prior source',()=>{
 const m=manifest();
 const v=validateR110CatalogSecurityGate(m);
 assert.equal(v.workPackage,'B10-R18-110');
 assert.equal(v.decision,'NO_GO');
 assert.equal(v.originalPublicRlsTables,31);
 assert.equal(v.publicTablesWithoutRls,0);
 assert.equal(v.authenticatedPublicDefinerReviewRequired,67);
 assert.equal(v.privateSchemaAnonymousExecuteButNoUsage,7);
 assert.equal(v.sourceConfirmedFogStatusMetadataDisclosure,true);
 assert.equal(v.privateHumanSqlReviewApproved,false);
 assert.equal(v.qaSchemaInstallAuthorized,false);
 assert.equal(v.productionReleaseAuthorized,false);
});
test('R110 rejects altered original or QA identity and claimed security completion',()=>{
 const change=fn=>{const m=manifest();fn(m);assert.throws(
  ()=>validateR110CatalogSecurityGate(m),noGo);};
 change(m=>m.provenance.originalProjectRef='bgydsamxypjslergfpla');
 change(m=>m.catalog.qaRegisteredMigrations=83);
 change(m=>m.catalog.originalPublicTablesMissingRls=1);
 change(m=>m.catalog.schemaDefinerSummary[1].anonCallable=7);
 change(m=>m.catalog.publicCallableDefinersWithoutDirectAuthUidText=0);
 change(m=>m.catalog.sevenPrivilegeReviewTargets[3].source_md5='0'.repeat(32));
 change(m=>m.frozenPrivateRecovery.operatorSessionIndependentlyAttested=true);
 change(m=>m.frozenPrivateRecovery.aggregateSha256='f'.repeat(64));
 change(m=>m.fogGuard.candidateAppliedToQa=true);
 change(m=>m.fogGuard.originalFunctionRestoreIsSafeRollback=true);
 change(m=>m.releaseGates.all67AuthenticatedDefinerRpcsReviewed=true);
 change(m=>m.releaseGates.productionReleaseAuthorized=true);
 change(m=>m.unchanged.qaSqlUnchanged=false);
});
test('R110 source verifier cannot query production or export private historical SQL',()=>{
 const src=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-110-catalog-security-gate.mjs'),'utf8');
 assert.doesNotMatch(src,/\b(?:fetch|spawnSync|execSync|apply_migration|writeFileSync)\s*\(/);
 assert.match(src,/validateR110CatalogSecurityGate/);
 assert.match(src,/productionReleaseAuthorized:false/);
 assert.match(src,/fogCandidateAlreadyApplied:false/);
 const m=manifest();
 assert.equal(JSON.stringify(m).includes('CREATE OR REPLACE FUNCTION'),false);
 assert.equal(m.frozenPrivateRecovery.rawPrivateSqlInRepository,false);
});
