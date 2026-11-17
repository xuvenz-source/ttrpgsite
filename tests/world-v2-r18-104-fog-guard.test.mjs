import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR104FogGuard} from '../scripts/release/validate-world-v2-r18-104-fog-guard.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PREFIX='staging/world-v2-b10-r18-104-fog-guard/';
const json=p=>JSON.parse(readFileSync(join(ROOT,p),'utf8'));
const input=()=>[json(PREFIX+'manifest.json'),json(PREFIX+'signed-acceptance-matrix.json')];
const rejected=fn=>{const x=input();fn(...x);
 assert.throws(()=>validateR104FogGuard(...x),/R104 FOG STATUS NO-GO/);};
test('R104 4 exact live Git function sources, privacy issue and actor-bound cleanup verified',()=>{
 const x=validateR104FogGuard(...input());
 assert.equal(x.workPackage,'B10-R18-104');
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.newExactLiveSourceMatches,4);
 assert.equal(x.previousExactLiveSourceMatches,6);
 assert.equal(x.fogStatusDisclosureSourceConfirmed,true);
 assert.equal(x.actorBoundSessionCleanupSourceConfirmed,true);
 assert.equal(x.actorBoundPreviewCleanupSourceConfirmed,true);
 assert.equal(x.originalOrQaSqlApplied,false);
 assert.equal(x.privacyCandidateStagedButNotApplied,true);
 assert.equal(x.signedCasesExecuted,0);
 assert.equal(x.productionReleaseAuthorized,false);
});
test('R104 candidate is isolated SQL and explicitly preserves authenticated RPC contract',()=>{
 const [m]=input();
 const sql=readFileSync(join(ROOT,m.candidate.path),'utf8');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.is_map_fog_published/);
 assert.match(sql,/security definer set search_path=''/i);
 assert.match(sql,/FROM public\.battle_maps m\s+JOIN forge_visibility\.map_rules r/i);
 assert.match(sql,/r\.map_id=m\.id AND r\.campaign_id=m\.campaign_id/i);
 assert.match(sql,/public\.can_view_campaign_map\(m\.campaign_id,m\.id\)/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.is_map_fog_published/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.is_map_fog_published/);
 assert.equal(m.candidate.appliedToAnyDatabase,false);
});
test('R104 detects fabricated source parity, arbitrary permission and original DB changes',()=>{
 rejected(m=>m.parentSha='0'.repeat(40));
 rejected(m=>m.decision='GO');
 rejected(m=>m.original.fogStatusHasDirectMembershipGuard=true);
 rejected(m=>m.original.allNewExactSourceParityFunctions=0);
 rejected(m=>m.original.privateMapRulesAuthenticatedSelectable=true);
 rejected(m=>m.original.rlsCombatPolicyCallers=0);
 rejected(m=>m.original.sqlUnchanged=false);
 rejected(m=>m.qa.registeredMigrations=83);
 rejected(m=>m.sourceFindings.fogStatusSourceLevelMetadataOracle=false);
 rejected(m=>m.sourceFindings.cleanupSessionActorIsAuthenticatedCaller=false);
 rejected(m=>m.sourceFindings.cleanupPreviewActorIsAuthenticatedCaller=false);
 rejected(m=>m.sourceFindings.runUserDisclosureReproduction=true);
});
test('R104 candidate blob and preserved RLS policy are fail-closed',()=>{
 rejected(m=>m.candidate.gitBlobSha='0'.repeat(40));
 rejected(m=>m.candidate.sameCampaignRuleJoin=false);
 rejected(m=>m.candidate.retainsAuthenticatedExecute=false);
 rejected(m=>m.candidate.forbidsAnonAndPublicExecute=false);
 rejected(m=>m.candidate.preservesMapCombatPolicy=false);
 rejected(m=>m.candidate.appliedToAnyDatabase=true);
 rejected(m=>m.candidate.postApplyVerified=true);
 rejected(m=>m.candidate.rollbackExecuted=true);
 rejected(m=>m.candidate.path='supabase/migrations/unapproved.sql');
});
test('R104 signed acceptance matrix remains 12 unrun live account cases',()=>{
 const [m,a]=input();
 assert.equal(a.caseCount,12);
 assert.equal(a.projectRef,'bgydsamxypjslergfpla');
 assert.equal(a.cases.every(x=>x.status==='NOT_RUN'&&
  !x.signedAccountTested&&!x.sqlInstalled),true);
 assert.equal(a.signedCasesExecuted,0);
 assert.equal(a.securityAccepted,false);
 assert.equal(m.gates.signedFogStatusPolicyPassed,false);
 rejected((m,a)=>a.cases[0].status='PASS');
 rejected((m,a)=>a.cases[1].signedAccountTested=true);
 rejected((m,a)=>a.cases[2].sqlInstalled=true);
 rejected((m,a)=>a.securityAccepted=true);
 rejected((m,a)=>a.caseCount=11);
 rejected((m,a)=>a.cases.pop());
});
test('R104 unrelated hosted QA, SQL installation and production release remain blocked',()=>{
 const [m]=input();
 for(const key of Object.keys(m.gates))
  rejected(m=>m.gates[key]=true);
 for(const key of Object.keys(m.unchanged))
  rejected(m=>m.unchanged[key]=false);
});
test('R104 pinned previous live source snapshot is retained and source-only',()=>{
 const prev=json('staging/world-v2-b10-r18-103-live-source-parity/metadata-index.json');
 assert.equal(prev.functions.length,20);
 for(const name of ['is_map_fog_published','end_map_motion_sessions',
  'can_view_campaign_map','end_map_motion_previews']){
  const r=prev.functions.find(x=>x.name===name);
  assert.match(r.bodySha256,/^[a-f0-9]{64}$/);
  assert.equal(r.securityDefiner,true);
  assert.equal(r.anonExecute,false);
 }
});
test('R104 validator has no DB connector, networking, shell or SQL execution paths',()=>{
 const code=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-104-fog-guard.mjs'),'utf8');
 assert.doesNotMatch(code,/\b(?:fetch|spawn|execSync|writeFileSync|execute_sql|apply_migration)\s*\(/);
 assert.match(code,/offline only, no arguments or database/);
});
test('R104 release ledger stays NO_GO, 190 staged and 125 outstanding',()=>{
 const l=json('staging/next-release-ledger.json');
 assert.equal(l.branches.length,191);
 assert.equal(l.upcomingRelease.outstandingBranches.length,126);
 assert.equal(l.branches.at(-3).linkedPullRequest,205);
 assert.equal(l.branches.at(-2).linkedPullRequest,206);
 assert.equal(l.branches.at(-2).releaseReady,false);
 assert.equal(l.releaseFogStatusPrivacyGuard.decision,'NO_GO');
 assert.equal(l.releaseFogStatusPrivacyGuard.newLiveSourceMatches,4);
 assert.equal(l.releaseFogStatusPrivacyGuard.candidatePreparedNotApplied,true);
 assert.equal(l.releaseFogStatusPrivacyGuard.qaRegisteredMigrations,0);
 assert.equal(l.releaseFogStatusPrivacyGuard.signedFogAuthorizationAccepted,false);
 assert.equal(l.releaseFogStatusPrivacyGuard.productionReleaseAuthorized,false);
});
