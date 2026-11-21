/** R18-147 fail-closed reconciliation of previously staged security candidates.
 * This is NOT a hosted authorizer, SQL migration, or evidence of applied fixes.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
export const R147_LIVE_ENABLED=false;
const PREFIX='staging/world-v2-b10-r18-147-revocation-candidate-reconciliation/';
const fail=m=>{throw Error('R147 reconciliation failed: '+m)};
const contains=(s,re,m)=>{if(!re.test(s))fail(m)};
export function auditR147({root=process.cwd(),manifestOverride,sourceOverride={}}={}){
 const read=path=>sourceOverride[path]??readFileSync(join(root,path),'utf8');
 const m=manifestOverride??JSON.parse(read(PREFIX+'manifest.json'));
 if(m.workPackage!=='B10-R18-147'||m.parentPr!==254||
   m.parentSha!=='1a71cb8fd6542c5a362d3a6c6a123c4d790026b8'||
   m.decision!=='NO_GO'||m.currentOriginalFixesInstalled!==false||
   m.sourceOnly!==true||m.noHostedWrites!==true||
   m.noRuntimeSourceChanges!==true||m.noVersionedMigrations!==true||
   m.noNewGrants!==true||m.noMerge!==true||m.noDeployment!==true||
   m.noPaidResources!==true||m.r127HumanReleaseApproved!==false)
   fail('release/ancestry gate changed');
 if(JSON.stringify(m.unresolvedIssues)!=='[220,223,229,231]'||
    m.originalMigrations!==83||m.qaMigrations!==0||m.qaPublicApplicationTables!==0)
   fail('original/QA issue evidence changed');
 if(m.priorCandidates?.length!==5||
    JSON.stringify(m.priorCandidates.map(x=>x.pr))!=='[219,226,228,230,230]')
   fail('reused candidate inventory incomplete');
 const files=new Map();
 for(const c of m.priorCandidates){
   if(!c.path.startsWith('staging/')||c.path.includes('..'))fail('unsafe candidate path');
   const data=read(c.path);
   const actual=createHash('sha1').update('blob '+Buffer.byteLength(data)+'\0'+data).digest('hex');
   if(actual!==c.gitBlob)fail('candidate Git blob drift: '+c.kind);
   files.set(c.kind,data);
 }
 const owner=files.get('original-character-sheet-owner-membership-guard');
 contains(owner,/create or replace function public\.can_edit_campaign_sheet\(/i,'old RPC replacement absent');
 contains(owner,/public\.campaign_members m[\s\S]*m\.campaign_id=p_campaign and m\.user_id=actor/i,'current membership precondition missing');
 contains(owner,/REVOKE ALL ON FUNCTION public\.can_edit_campaign_sheet/i,'old helper public EXECUTE guard missing');
 const rejoin=files.get('tombstone-guard-plus-dm-removal-and-reinstatement');
 for(const s of ['stamp_campaign_member_deletion','reject_revoked_member_insertion',
  'dm_remove_campaign_player','dm_reinstate_campaign_player','leave_campaign'])
   if(!rejoin.includes(s))fail('rejoin contract missing '+s);
 contains(rejoin,/IF NOT FOUND THEN[\s\S]*RETURN OLD;/i,'parent-campaign deletion cascade not accounted for');
 contains(rejoin,/FOR UPDATE/i,'campaign serialization guard missing');
 const admin=files.get('membership-identity-update-guard-and-dm-revoked-roster');
 contains(admin,/OLD\.campaign_id IS DISTINCT FROM NEW\.campaign_id/i,'campaign key update not fenced');
 contains(admin,/OLD\.user_id IS DISTINCT FROM NEW\.user_id/i,'identity key update not fenced');
 contains(admin,/Role-only UPDATE remains an independent privileged service-role risk/i,'role-only UPDATE risk hidden');
 contains(admin,/No REVOKE is staged yet/i,'privileged TRUNCATE unresolved risk hidden');
 const sentinel=files.get('dormant-member-sentinel');
 const teardown=files.get('dormant-revocation-teardown');
 if(!sentinel.includes('R123_LIVE_ENABLED=false'))fail('dormant sentinel unexpectedly enabled');
 contains(teardown,/unsubscribe|unmount/i,'revocation teardown missing unmount semantics');
 const original=JSON.parse(read('staging/world-v2-b10-r18-146-original-revocation-lock-graph/original-trigger-and-revocation-snapshot.json'));
 if(original.originalAuthorityFindings.serviceRoleCanTruncateCampaignMembers!==true||
   original.originalAuthorityFindings.revokedCharacterOwnerStillMatchesCanEditSheetOwnerBranch!==true||
   original.originalAuthorityFindings.joinCampaignAcceptsUnchangedInviteCode!==true||
   original.originalTriggerCounts.campaign_members!==0)
   fail('original risk evidence suppressed');
 for(const [k,v] of Object.entries(m.gaps))if(v!==true)fail('open gap suppressed: '+k);
 return Object.freeze({workPackage:m.workPackage,decision:'NO_GO',reusedCandidates:m.priorCandidates.length,
  unresolvedIssues:m.unresolvedIssues,serviceRoleTruncateStillPermitted:true,
  privilegedRoleOnlyUpdateUnreviewed:true,sourceOnly:true,releaseAuthorized:false});
}
