import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR103Source,extractR103FunctionSource}
 from '../scripts/release/validate-world-v2-r18-103-live-rpc-source-parity.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const BASE='staging/world-v2-b10-r18-103-live-source-parity/';
const json=p=>JSON.parse(readFileSync(join(ROOT,p),'utf8'));
const state=()=>[json(BASE+'manifest.json'),json(BASE+'metadata-index.json'),
 json(BASE+'signed-authorization-matrix.json')];
const fails=change=>{const args=state();change(...args);
 assert.throws(()=>validateR103Source(...args),/R103 LIVE RPC NO-GO/);};
test('R103 matches exact six live SQL source SHA-256 and 20 live function fingerprints',()=>{
 const x=validateR103Source(...state());
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.exactGitSourceBodiesRechecked,6);
 assert.equal(x.liveFunctionSha256Fingerprints,20);
 assert.equal(x.plannedSignedAuthorizationCases,17);
 assert.equal(x.executedSignedAuthorizationCases,0);
 assert.equal(x.qaSqlApplied,false);
 assert.equal(x.productionReleaseAuthorized,false);
});
test('R103 12 entrypoints and 8 helper fingerprints contain no exported live bodies',()=>{
 const [,i]=state();
 assert.equal(i.functions.length,20);
 assert.equal(i.verifiedSourceMatches.length,6);
 assert.equal(i.functions.every(x=>/^[a-f0-9]{64}$/.test(x.bodySha256)),true);
 assert.equal(i.functions.every(x=>!Object.hasOwn(x,'prosrc')&&
  !Object.hasOwn(x,'source')&&!Object.hasOwn(x,'sql')),true);
});
test('R103 detects altered SHA-256, byte counts, grants, file pointers and source claims',()=>{
 fails((m,i)=>i.functions[0].bodySha256='0'.repeat(64));
 fails((m,i)=>i.functions[0].bodyBytes+=1);
 fails((m,i)=>i.functions[0].anonExecute=true);
 fails((m,i)=>i.functions.find(x=>x.name==='cancel_world_motion_v2').authExecute=false);
 fails((m,i)=>i.functions[0].source='raw SQL');
 fails((m,i)=>i.verifiedSourceMatches[0].expectedSourceSha256='0'.repeat(64));
 fails((m,i)=>i.verifiedSourceMatches[0].individualAuthorizationApproved=true);
 fails((m)=>m.original.rawLiveFunctionSourceExported=true);
 fails((m)=>m.qa.registeredMigrations=83);
});
test('R103 unresolved fog and movement session actor checks remain explicit blockers',()=>{
 const [m,i]=state();
 const f=i.functions.find(x=>x.name==='is_map_fog_published');
 assert.equal(f.markers.direct_auth_uid,false);
 assert.equal(f.markers.dm_helper,false);
 assert.equal(m.gates.isMapFogPublishedPolicyResolved,false);
 assert.equal(i.functions.find(x=>x.name==='end_map_motion_sessions').markers.direct_session_actor,false);
 fails((m)=>m.evidence.unauthorizedPublicationPolicyOpen=false);
 fails((m,i)=>i.functions.find(x=>x.name==='is_map_fog_published').markers.direct_auth_uid=true);
});
test('R103 source extractor rejects absent or malformed definitions',()=>{
 assert.throws(()=>extractR103FunctionSource('','public','missing'),/R103 LIVE RPC NO-GO/);
 assert.throws(()=>extractR103FunctionSource(
 'CREATE OR REPLACE FUNCTION public.example() AS $x$ broken',
 'public','example'),/R103 LIVE RPC NO-GO/);
});
test('R103 signed DM/P1/P2 outsider matrix remains 17 NOT_RUN cases',()=>{
 const [m,,matrix]=state();
 assert.equal(matrix.cases.length,17);
 assert.equal(matrix.cases.every(x=>x.status==='NOT_RUN'&&
  !x.signedAccountsExercised&&!x.privateSqlExecuted),true);
 assert.equal(m.gates.signedDmP1P2OutsiderTestsPassed,false);
 fails((m,i,c)=>c.cases[0].status='PASS');
 fails((m,i,c)=>c.cases[1].signedAccountsExercised=true);
 fails((m,i,c)=>c.authorizationAccepted=true);
});
test('R103 prevents forged historical recovery, QA install and production release',()=>{
 const [m]=state();
 for(const key of Object.keys(m.gates))fails((x)=>x.gates[key]=true);
 for(const key of Object.keys(m.unchanged))fails((x)=>x.unchanged[key]=false);
 fails((m)=>m.decision='GO');
 fails((m)=>m.parentSha='0'.repeat(40));
});
test('R103 source validator has no network, SQL execution or shell writes',()=>{
 const source=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-103-live-rpc-source-parity.mjs'),'utf8');
 assert.doesNotMatch(source,/\b(?:fetch|spawn|execSync|writeFileSync|execute_sql|apply_migration)\s*\(/);
});
test('R103 release ledger records source-only NO_GO 189-stage successor',()=>{
 const l=json('staging/next-release-ledger.json');
 assert.equal(l.branches.length,189);
 assert.equal(l.upcomingRelease.outstandingBranches.length,124);
 assert.equal(l.branches.at(-2).linkedPullRequest,204);
 assert.equal(l.branches.at(-1).linkedPullRequest,205);
 assert.equal(l.branches.at(-1).releaseReady,false);
 assert.equal(l.releaseRpcSourceParity.decision,'NO_GO');
 assert.equal(l.releaseRpcSourceParity.liveFunctionFingerprints,20);
 assert.equal(l.releaseRpcSourceParity.exactRepoSourceMatches,6);
 assert.equal(l.releaseRpcSourceParity.signedAcceptanceCompleted,false);
 assert.equal(l.releaseRpcSourceParity.qaRegisteredMigrations,0);
 assert.equal(l.releaseRpcSourceParity.productionReleaseAuthorized,false);
});
