/** R149: proof-of-scope source snapshot. No hosted SQL, role mutation or browser grant. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const R149_LIVE_ENABLED=false;
const fail=m=>{throw Error('R149 safety evidence failed: '+m)};
export function auditR149({root=process.cwd(),snapshotOverride,manifestOverride}={}){
 const read=p=>readFileSync(join(root,p),'utf8');
 const folder='staging/world-v2-b10-r18-149-dm-bootstrap-audit/';
 const s=snapshotOverride??JSON.parse(read(folder+'original-function-inventory.json'));
 const m=manifestOverride??JSON.parse(read(folder+'manifest.json'));
 const r148=JSON.parse(read('staging/world-v2-b10-r18-148-privileged-membership-guards/manifest.json'));
 if(m.parentPr!==256||m.parentSha!=='0355eb7d2523261f3a509254a7acd401c7f181d5'||
 m.decision!=='NO_GO'||m.sourceOnly!==true||
 m.ownerMatchOnlyNotSufficient!==true||m.productionReleaseAuthorized!==false||
 m.privilegedWriterMisuseIsNotAnAuthenticatedBrowserExploit!==true||
 m.sqlChangedOnOriginal!==false||m.sqlChangedOnQA!==false||
 m.realMigrationCreated!==false||m.runtimeSourceChanged!==false||
 m.newBrowserGrants!==0||m.merged!==false||m.deployed!==false||m.paidResources!==false)
 fail('R149 release or ancestor gate changed');
 if(r148.decision!=='NO_GO'||r148.negativeControl!=='PRIVILEGED_NEW_DM_INSERT_STILL_POSSIBLE_FOR_UNREVOKED_IDENTITY')
 fail('R148 privileged new-DM unresolved evidence removed');
 if(s.scannedFunctions!==145||s.securityDefiners!==109||
 s.authenticatedExecutableSecurityDefiners!==67||s.fullTransitivePrivilegeAuditCompleted!==false||
 s.serviceRoleAdminOrOperatorPathsValidated!==false)
 fail('original source scope/incomplete inventory disguised');
 const writers=s.directMemberInsertSecurityDefiners;
 if(writers?.length!==2||writers[0].name!=='public.create_campaign'||
 writers[1].name!=='public.join_campaign'||writers[0].dmLiteral!==true||
 writers[0].referencesAuthUid!==true||writers[0].referencesOwnerId!==true||
 writers[1].playerLiteral!==true||writers[1].dmLiteral!==false)
 fail('original DM bootstrap versus player invitation drift');
 if(writers[0].sourceSha256!=='0ea1e01ba784dfa78e92c8e82a3ca2b2d28a19920f5286cc7423d1e891be645f'||
 writers[1].sourceSha256!=='5f3a7dbcadc4361f59fa814a820b84cfb2cc0d89f685ae6194efe3912d015655')
 fail('private original function fingerprints changed');
 if(s.directMemberUpdateSecurityDefinerCount!==0||
 s.directMemberDeleteSecurityDefinerCount!==0||
 s.directMemberTruncateSecurityDefinerCount!==0||
 s.campaignsOwnerIdUpdatePriv?.serviceRole!==true||
 s.campaignMembersForeignKeyDeleteActions?.authUsers!=='CASCADE'||
 s.campaignMembersForeignKeyDeleteActions?.campaigns!=='CASCADE'||
 s.authenticatedMembershipInsertGrant!==false)
 fail('original grants or cascade boundaries suppressed');
 if(JSON.stringify(m.unresolvedIssues)!=='[220,223,229,231]'||
 m.humanR127ReleaseApproved!==false||m.realSignedQA!==false)
 fail('original release gates hidden');
 return Object.freeze({workPackage:m.workPackage,decision:'NO_GO',
 directMemberInsertWriters:writers.length,authCallableDefinersUnreviewed:67,
 ownerMatchNotSafe:true,syntheticOnly:true,releaseAuthorized:false});
}
