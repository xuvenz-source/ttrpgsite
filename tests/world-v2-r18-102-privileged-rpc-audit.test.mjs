import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR102PrivilegedRpc}
 from '../scripts/release/validate-world-v2-r18-102-privileged-rpc-audit.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const DIR='staging/world-v2-b10-r18-102-privileged-rpc-audit/';
const json=x=>JSON.parse(readFileSync(join(ROOT,x),'utf8'));
const state=()=>[json(DIR+'manifest.json'),json(DIR+'catalog-index.json'),json(DIR+'indirect-auth-review.json')];
const fails=fn=>{const s=state();fn(...s);
 assert.throws(()=>validateR102PrivilegedRpc(...s),
  /R102 PRIVILEGED RPC NO-GO/);};
test('R102 catalog matches exactly 67 actual advisory-exposed DEFN endpoints without release authority',()=>{
 const result=validateR102PrivilegedRpc(...state());
 assert.equal(result.workPackage,'B10-R18-102');
 assert.equal(result.decision,'NO_GO');
 assert.equal(result.advisorAndCatalogFunctionsReconciled,67);
 assert.equal(result.anonExecutable,0);
 assert.equal(result.publicExecGrants,0);
 assert.equal(result.directAuthTextMissing,7);
 assert.equal(result.scopeTextMissing,7);
 assert.equal(result.candidateHelpersInspected,5);
 assert.equal(result.functionAuthorizationReviewed,false);
 assert.equal(result.qaSchemaInstalled,false);
});
test('R102 catalog protects original source and 67 immutable function metadata rows',()=>{
 const [,index]=state();
 assert.equal(index.functions.length,67);
 assert.equal(index.totals.allPublicDefinerFunctions,85);
 assert.equal(index.totals.emptyConfiguredSearchPath,67);
 assert.equal(index.functions.every(f=>f.securityDefiner===true&&
  f.configuredSearchPath===''&&f.ownerRole==='postgres'&&
  f.grants.anonExecute===false&&f.grants.publicExecuteAcl===false),true);
 assert.equal(new Set(index.functions.map(f=>f.name)).size,67);
});
test('R102 fails closed against fake permission changes, auth source claims or extra SQL',()=>{
 fails((m,i,r)=>m.decision='GO');
 fails((m,i,r)=>m.parentSha='0'.repeat(40));
 fails((m,i,r)=>m.original.catalogMatchedAdvisorFunctions=66);
 fails((m,i,r)=>m.original.anonExecutableSecurityDefiners=1);
 fails((m,i,r)=>m.qa.registeredMigrations=83);
 fails((m,i,r)=>i.functions[0].grants.anonExecute=true);
 fails((m,i,r)=>i.functions[0].grants.publicExecuteAcl=true);
 fails((m,i,r)=>i.functions[0].configuredSearchPath='public,pg_temp');
 fails((m,i,r)=>i.functions[0].sourceReviewed=true);
 fails((m,i,r)=>i.functions[0].permissionReviewApproved=true);
 fails((m,i,r)=>i.functions[0].rawSqlDefinition='SELECT secret');
 fails((m,i,r)=>i.functions[0].identityArguments='-- tampered');
 fails((m,i,r)=>r.indirectIdentityTargets[0].reviewFocus='manually approved');
});
test('R102 rejects changes to catalog flags, total counts and critical missing auth targets',()=>{
 fails((m,i,r)=>i.totals.directAuthIdentityMarker=67);
 fails((m,i,r)=>i.totals.anonymousCallable=1);
 fails((m,i,r)=>i.functions[0].markers.directAuthIdentity=false);
 fails((m,i,r)=>i.functions[0].markers.scopeText=false);
 fails((m,i,r)=>i.functions.pop());
 fails((m,i,r)=>i.functions[4].name=i.functions[3].name);
 fails((m,i,r)=>i.provenance.rawFunctionDefinitionsReturned=true);
});
test('R102 rejects forged indirect helper authorization and review approvals',()=>{
 const [,index,review]=state();
 assert.equal(review.indirectIdentityTargets.length,7);
 assert.deepEqual(review.missingScopeTextTargets,[
  'cancel_world_motion_v2','end_authorized_navigation_gesture',
  'end_map_motion_previews','end_map_motion_sessions',
  'get_world_visibility_v2','is_map_fog_published','preview_map_motion'
 ]);
 assert.equal(review.helperMetadata.find(h=>h.name==='dispatch_movement_preview')?.authExecute,false);
 assert.equal(review.helperMetadata.find(h=>h.name==='is_campaign_dm')?.directAuthText,true);
 fails((m,i,r)=>r.indirectIdentityTargets[0].helperCandidates=[]);
 fails((m,i,r)=>r.indirectIdentityTargets[3].scopeText=true);
 fails((m,i,r)=>r.helperMetadata[1].authExecute=true);
 fails((m,i,r)=>r.helperMetadata[4].directAuthText=false);
 fails((m,i,r)=>r.outcomes.crossUserPermissionTestsPerformed=true);
 fails((m,i,r)=>r.outcomes.privilegedRpcPermissionsApproved=true);
});
test('R102 manifest cannot certify unperformed source/security/signed user testing',()=>{
 const m=state()[0];
 for(const k of Object.keys(m.gates))fails((x)=>x.gates[k]=true);
 for(const k of Object.keys(m.unchanged))fails((x)=>x.unchanged[k]=false);
});
test('R102 offline validator has no network, SQL execution or mutating steps',()=>{
 const c=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-102-privileged-rpc-audit.mjs'),'utf8');
 assert.doesNotMatch(c,/\b(?:fetch|spawn|execSync|writeFileSync|apply_migration|execute_sql)\s*\(/);
 assert.match(c,/decision:'NO_GO'/);
 assert.match(c,/qaSchemaInstalled:false/);
});
test('R102 release ledger remains strict NO_GO and previous R101 source seal survives',()=>{
 const l=json('staging/next-release-ledger.json');
 assert.equal(l.branches.length,192);
 assert.equal(l.upcomingRelease.outstandingBranches.length,127);
 assert.equal(l.branches.at(-6).linkedPullRequest,203);
 assert.equal(l.branches.at(-5).linkedPullRequest,204);
 assert.equal(l.branches.at(-5).releaseReady,false);
 assert.equal(l.releasePrivilegedRpcAudit.decision,'NO_GO');
 assert.equal(l.releasePrivilegedRpcAudit.authenticatedPrivilegedRpcCount,67);
 assert.equal(l.releasePrivilegedRpcAudit.anonymousExecutablePrivilegedRpcs,0);
 assert.equal(l.releasePrivilegedRpcAudit.unreviewedDirectIdentityFunctions,7);
 assert.equal(l.releasePrivilegedRpcAudit.privilegedRpcSecurityApproved,false);
 assert.equal(l.releasePrivilegedRpcAudit.qaSchemaInstalled,false);
 assert.equal(l.releasePrivilegedRpcAudit.productionReleaseAuthorized,false);
});
