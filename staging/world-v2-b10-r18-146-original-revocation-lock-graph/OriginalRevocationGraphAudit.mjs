/**
 * B10-R18-146: fixed original catalog witness and exact source lock-order
 * review. SOURCE ONLY. Does not query live in CI or authorize release.
 * The snapshot was read-only evidence, NOT an authorization test.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {auditR145} from
 '../world-v2-b10-r18-145-monotonic-mutation-revisions/RevisionProtocolAudit.mjs';

export const R146_LIVE_ENABLED=false;
const deny=msg=>{throw Error('R146 original-revocation evidence drift: '+msg)};
const required=(s,n,msg)=>{if(!s.includes(n))deny(msg)};
export function auditR146({root=process.cwd(),snapshot}={}){
 const read=p=>readFileSync(join(root,p),'utf8');
 const parent=auditR145({root});
 if(parent.decision!=='NO_GO'||parent.lockOrdering!=='HANDOUT_BEFORE_PIN')
  deny('R145 default-denied lock protocol drifted');
 const snap=snapshot??JSON.parse(read(
  'staging/world-v2-b10-r18-146-original-revocation-lock-graph/original-trigger-and-revocation-snapshot.json'));
 const manifest=JSON.parse(read(
  'staging/world-v2-b10-r18-146-original-revocation-lock-graph/manifest.json'));
 if(manifest.parentPr!==253||
 manifest.parentSha!=='a922556ccd49f19251dfb2bad399d0aea8ee67d9'||
 manifest.decision!=='NO_GO'||manifest.productionReleaseAuthorized!==false||
 manifest.noHostedWrites!==true||manifest.newBrowserGrants!==0)
  deny('R146 PR ancestor and live release gate changed');
 const names=snap.criticalOriginalTriggerNames;
 const counts=snap.originalTriggerCounts;
 const expected={characters:6,campaign_handouts:3,campaign_map_pins:2,
  campaign_members:0,map_tokens:10,campaigns:2,
  campaign_player_maps:1,campaign_tool_issues:5,
  map_environments:1,campaign_handout_events:0};
 if(JSON.stringify(counts)!==JSON.stringify(expected)||
    names.characters.length!==6||
    names.campaign_handouts.length!==3||
    names.campaign_map_pins.length!==2||
    !names.characters.includes('forge_character_elevation_tick')||
    !names.characters.includes('characters_monitor_refresh')||
    !names.campaign_handouts.includes('campaign_handout_hide_pins')||
    !names.campaign_handouts.includes('campaign_handout_tick'))
  deny('original 2026-11-21 pg_catalog evidence inconsistent');
 const a=snap.originalAuthorityFindings;
 for(const key of [
  'revokedCharacterOwnerStillMatchesCanEditSheetOwnerBranch',
  'joinCampaignAcceptsUnchangedInviteCode',
  'joinCampaignReinsertsMemberOnConflictDoNothing',
  'serviceRoleCanTruncateCampaignMembers'])
  if(a[key]!==true)deny('original issue risk suppressed '+key);
 if(a.canEditCampaignSheetOwnerBranchCallsIsCampaignMember!==false||
  a.campaignMembersCustomRevocationTriggers!==0||
  a.authenticatedCanUpdateCampaignMembers!==false||
  a.authenticatedCanTruncateCampaignMembers!==false||
  a.staleJoinedRealtimeSocketRevocationProved!==false)
  deny('original membership/grant boundaries changed');
 if(JSON.stringify(snap.securityIssueIds)!=='[220,223,229,231]'||
   snap.originalMigrations!==83||snap.qaMigrations!==0||
   snap.qaPublicApplicationTables!==0||snap.releaseDecision!=='NO_GO'||
   snap.realOriginalTransactionDeadlockMeasured!==false)
  deny('historical original and QA scope misrepresented');
 const graph=snap.mutationLockGraph;
 const by=Object.fromEntries(graph.map(g=>[g.from,g]));
 if(graph.length!==6||
  by['public.collect_campaign_map_pin']?.hazard!=='PIN_TO_HANDOUT'||
  by['public.hide_campaign_handout_pins']?.hazard!=='HANDOUT_TO_PIN'||
  by['R145.collect_authorized_pin_once_v3']?.hazard!=='HANDOUT_THEN_PIN')
  deny('reverse legacy lock graph no longer pinned');
 const app=read('src/useCampaignHandouts.js');
 required(app,"db.rpc('collect_campaign_map_pin'","legacy collector caller changed");
 const r145=read('staging/world-v2-b10-r18-145-monotonic-mutation-revisions/unapplied-revisioned-mutations-v3.sql');
 const head=r145.indexOf('CREATE FUNCTION forge_v3_internal.collect_authorized_pin_once_v3(');
 const priv=r145.slice(head,r145.indexOf('REVOKE ALL ON FUNCTION',head));
 if(head<0||priv.indexOf('FROM public.campaign_handouts h')<0||
   priv.indexOf('INTO locked_pin FROM public.campaign_map_pins')<
     priv.indexOf('FROM public.campaign_handouts h'))
  deny('R145 handout-first row locking altered');
 const runner=read('tests/world-v2-r18-146-postgres/lock-order-races.mjs');
 for(const token of ['r146_dm_hides_pin','r146_new_collector_waits',
  'r146_new_collector_first','r146_dm_hides_after_collect',
  'r146_old_collector_pin_first','r146_dm_old_inverse_order',
  'deadlock detected','R146_ISOLATED','SET mode'])
  required(runner,token,'synthetic race test missing '+token);
 return Object.freeze({
  workPackage:'B10-R18-146',decision:'NO_GO',sourceOnly:true,
  originalReadOnlyTriggerTables:10,
  originalCharacterTriggers:6,originalTokenTriggers:10,
  originalHandoutTriggers:3,originalPinTriggers:2,
  campaignMemberRevocationTriggerCount:0,
  revokedOwnerOldRpcRisk:true,unchangedInviteRejoinRisk:true,
  privilegedMemberMutationRevocationRisk:true,
  realOldSocketRevocationProved:false,realStorageBearerRevoked:false,
  allOriginalMigrationCompatibilityProven:false,
  releaseAuthorized:false
 });
}
