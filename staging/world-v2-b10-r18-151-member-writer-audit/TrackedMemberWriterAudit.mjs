/** R151: source-only audit of tracked script/Edge direct membership writers.
 * This never asserts that external admin/service-role paths do not exist.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const R151_LIVE_ENABLED=false;
const fail=m=>{throw Error('R151 writer boundary: '+m)};
export function auditR151({root=process.cwd(),snapshotOverride,manifestOverride}={}){
 const read=p=>readFileSync(join(root,p),'utf8');
 const dir='staging/world-v2-b10-r18-151-member-writer-audit/';
 const s=snapshotOverride??JSON.parse(read(dir+'tracked-repo-writer-snapshot.json'));
 const m=manifestOverride??JSON.parse(read(dir+'manifest.json'));
 const r150=JSON.parse(read('staging/world-v2-b10-r18-150-service-insert-privilege/manifest.json'));
 if(m.workPackage!=='B10-R18-151'||m.parentPr!==258||
 m.parentSha!=='f64183ad583e1712fb96c249b3e790995df77754'||
 m.decision!=='NO_GO'||m.sourceOnly!==true||
 m.proposedR150GrantChangeApproved!==false||m.realAdminWriterInventoryComplete!==false||
 m.full83PrivateHistoryReviewDone!==false||m.full67DefinerAuditDone!==false||
 m.realSignedQaDone!==false||m.humanR127ReleaseApproved!==false||
 m.productionReleaseAuthorized!==false||m.noOriginalOrQaSqlChanges!==true||
 m.noRuntimeChanges!==true||m.noMigrationChanges!==true||m.noBrowserGrants!==true||
 m.noMerge!==true||m.noDeploy!==true||m.noPaidResources!==true)
 fail('invalid parent or hidden release gate');
 if(r150.decision!=='NO_GO'||r150.requiresIndependentAdminWorkflowAudit!==true)
 fail('R150 conditional grant boundary suppressed');
 if(s.gitTreeTruncated!==false||s.gitTreeEntries!==1368||
 s.scannedScriptsAndEdgeTextFiles!==56||s.categoryBreakdown?.scripts!==51||
 s.categoryBreakdown?.supabaseEdge!==5||
 s.scriptEdgeDirectSupabaseMemberMutationMatches!==0||
 s.externalIntegrationsCovered!==false||s.privateHistorical83BodiesSemanticReviewed!==false||
 s.trustedServiceRoleDashboardManualWritesCovered!==false||
 s.sourceSnapshotIsNotAttestationOfDeployedEdgeFunctions!==true||
 s.productionSecurityRiskCleared!==false)
 fail('scan scope or limitations altered');
 if(JSON.stringify(m.unresolvedIssues)!=='[220,223,229,231]'||
 m.manualOperatorInputNeeded?.length!==3)
 fail('required manual operator security gate hidden');
 const src=s.reverifiedRuntimeReadOnlyFiles;
 if(src?.length!==2||src[0].campaignMembersReferences!==3||
 src[1].campaignMembersReferences!==1||
 src.some(x=>x.directMembershipMutations!==0))
 fail('runtime writer observations changed');
 return Object.freeze({workPackage:'B10-R18-151',decision:'NO_GO',
 scannedScriptAndEdgeFiles:56,manualOperatorReviewRequired:true,
 trackedLiteralDirectMembershipWritersFound:0,
 externalWritersDisproved:false,releaseAuthorized:false});
}
