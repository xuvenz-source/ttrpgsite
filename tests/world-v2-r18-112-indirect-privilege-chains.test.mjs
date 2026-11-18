import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR112IndirectChain,extractR112GitFunctionBody}
 from '../scripts/release/validate-world-v2-r18-112-indirect-privilege-chains.mjs';
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=()=>JSON.parse(readFileSync(join(ROOT,
 'staging/world-v2-b10-r18-112-indirect-privilege-chains/manifest.json'),'utf8'));
test('R112 preserves seven indirect RPC edges, source-bound safety guards and NO_GO',()=>{
 const r=validateR112IndirectChain(manifest());
 assert.equal(r.workPackage,'B10-R18-112');
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.privilegedCallersTraced,7);
 assert.equal(r.nonFogHelperCallers,6);
 assert.equal(r.exactGitSourceBodiesGuardsCrossChecked,2);
 assert.equal(r.knownFogStatusLeakStillBlocked,true);
 assert.equal(r.signedQaCasesNotRun,8);
 assert.equal(r.independentPrivateSqlReviewApproved,false);
 assert.equal(r.qaSchemaInstallAuthorized,false);
 assert.equal(r.productionReleaseAuthorized,false);
});
test('R112 refuses tampered helper paths, Git source fingerprints, missing role checks or false release claims',()=>{
 const noGo=/R112 PRIVILEGE CHAIN NO-GO/;
 const change=fn=>{const m=manifest();fn(m);assert.throws(()=>validateR112IndirectChain(m),noGo)};
 change(m=>m.originalProjectRef=m.qaProjectRef);
 change(m=>m.registeredQaMigrations=83);
 change(m=>m.privilegedFunctions[3].helperCandidateReferences=['public.is_campaign_dm']);
 change(m=>m.privilegedFunctions[0].sourceMd5='f'.repeat(32));
 change(m=>m.privilegedFunctions[1].authorizationApproved=true);
 change(m=>m.privilegedFunctions[2].directAuthUidText=true);
 change(m=>m.helpers[5].helperCandidateReferences=[]);
 change(m=>m.helpers[1].directAuthUidText=true);
 change(m=>m.helpers[4].authenticatedCallable=true);
 change(m=>m.repositorySourceAnchors[0].liveSourceSha256='0'.repeat(64));
 change(m=>m.knownVulnerability.candidateAppliedToQa=true);
 change(m=>m.knownVulnerability.historicalSourceFogStatusOracle=false);
 change(m=>m.gate.privilegedSevenSemanticReviewApproved=true);
 change(m=>m.gate.productionReleaseAuthorized=true);
 change(m=>m.requiredSignedCases[0]='INVALID-01');
});
test('R112 source extraction does not match duplicate functions, malformed dollar delimiters',()=>{
 const sql='CREATE OR REPLACE FUNCTION public.hello() RETURNS int AS $function$ SELECT 1; $function$;';
 assert.match(extractR112GitFunctionBody(sql,'public','hello'),/SELECT 1/);
 assert.throws(()=>extractR112GitFunctionBody(sql+'\n'+sql,'public','hello'),
  /R112 PRIVILEGE CHAIN NO-GO/);
 assert.throws(()=>extractR112GitFunctionBody('CREATE OR REPLACE FUNCTION public.hello() AS $x$broken','public','hello'),
  /R112 PRIVILEGE CHAIN NO-GO/);
});
test('R112 source-only evidence cannot mutate original or export private historical SQL',()=>{
 const script=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-112-indirect-privilege-chains.mjs'),'utf8');
 assert.doesNotMatch(script,/\b(?:spawnSync|execSync|writeFileSync|apply_migration|fetch)\s*\(/);
 assert.match(script,/createHash\('sha256'\)/);
 assert.match(script,/productionReleaseAuthorized:false/);
 const text=JSON.stringify(manifest());
 assert.doesNotMatch(text,/(?:CREATE OR REPLACE FUNCTION|INSERT INTO|sb_secret_)/);
});
