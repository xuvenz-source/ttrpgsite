/** R18-153 source-only original Storage RLS metadata and QA gate. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const R153_LIVE_ENABLED=false;
const dir='staging/world-v2-b10-r18-153-original-storage-policy-release-gate/';
const fail=x=>{throw Error('R153 NO_GO: '+x)};
export function auditR153({root=process.cwd(),manifestOverride,topologyOverride,matrixOverride}={}){
 const read=p=>JSON.parse(readFileSync(join(root,dir+p),'utf8'));
 const m=manifestOverride??read('manifest.json');
 const t=topologyOverride??read('original-storage-policy-metadata.json');
 const a=matrixOverride??read('signed-acceptance-matrix.json');
 if(m.parentPr!==260||m.parentSha!=='0fecf887e85f012b7000211407dfa4fd068da929'||
   m.decision!=='NO_GO'||m.sourceOnly!==true||m.originalOrQaSqlWrites!==0||
   m.versionedMigrationsChanged!==0||m.runtimeSourceChanged!==false||
   m.exposedBrowserGrantsAdded!==0||m.merged!==false||m.deployed!==false||
   m.paidResourcesUsed!==false||m.privateHistoryNeverExported!==true||
   m.externalMembershipWritersOperatorStatement!=='NOT_KNOWINGLY_CONFIGURED_NOT_A_COMPLETE_ATTESTATION'||
   m.original83SemanticReviewApprovals!==0||m.original67DefinerReviewApproved!==false||
   m.originalPolicyBodiesIndependentlyReviewed!==false||
   m.qaHistoryDryRunApproved!==false||m.qaHistoryInstalled!==false||
   m.actualSignedActorsTested!==0||m.actualSignedCasesPassing!==0||
   m.r127HumanReleaseApproved!==false||m.productionReleaseAuthorized!==false||
   JSON.stringify(m.blockedIssues)!=='[220,223,229,231]'||
   m.manualGates?.length!==4)
   fail('ancestry, release, or human-review gate altered');
 if(t.method!=='READ_ONLY_ORIGINAL_PG_POLICIES_METADATA_BOOLEAN_ONLY'||
   t.sourceSqlExported!==false||t.policyNamesExported!==false||
   t.policyExpressionsExported!==false||t.userRowsQueried!==false||
   t.storageObjectsRlsEnabled!==true||t.securityApproved!==false||
   t.anonymousCanReadDeductionNotMade!==true||
   JSON.stringify(t.policyCounts)!==
    '{"total":8,"select":3,"insert":3,"delete":2,"permissive":8,"authenticatedTargeted":8}'||
   JSON.stringify(t.storageBuckets)!=='{"total":3,"private":3,"public":0}'||
   t.policies?.length!==8)
   fail('live catalog evidence changed');
 for(let i=0;i<8;i++){
  const p=t.policies[i];
  const ops=['DELETE','DELETE','INSERT','INSERT','INSERT','SELECT','SELECT','SELECT'];
  if(p.operation!==ops[i]||p.ordinal!==i+1||p.role!=='authenticated'||p.permissive!==true||
    p.bucketPredicate!==true||p.literalTrue!==false)
    fail('policy evidence changed');
 }
 const p=t.policies[6];
 if(p.operation!=='SELECT'||p.exists!==true||p.identity!==false||
   p.dm!==false||p.member!==false||
   t.originalSelectOrdinal7NoDirectKnownHelperOrIdentityMarker!==true||
   t.knownOriginalSelectOrdinal7ActualSemanticsReviewed!==false||
   t.sameCommandPermissivePoliciesNeedCompositionReview!==true)
   fail('unreviewed SELECT policy unexpectedly cleared');
 if(a.target!=='FUTURE_SEPARATELY_AUTHORIZED_QA_ONLY'||
  a.authorizedToExecute!==false||a.signedIdentitiesAvailable!==false||
  a.qaHistoryInstalled!==false||a.original83SqlSemanticReviewApproved!==false||
  a.original67PrivilegedFunctionsApproved!==false||
  a.independentReviewerApproved!==false||a.storagePolicyCompositionApproved!==false||
  a.preissuedSignedUrlBehaviorApproved!==false||
  a.realtimeJoinedSocketCutoffApproved!==false||
  a.r127HumanApproval!==false||a.productionReleaseAuthorized!==false||
  a.cases?.length!==18)
  fail('QA gate relaxed');
 const expectedIds=['STOR-01','STOR-02','STOR-03','STOR-04','STOR-05',
  'STOR-06','STOR-07','STOR-08','STOR-09','STOR-10',
  'REV-01','REV-02','REV-03','REV-04','REV-05','REV-06',
  'ROLE-01','CASCADE-01'];
 const unresolved=new Set(['REV-05','REV-06','ROLE-01','CASCADE-01']);
 const allow=new Set(['STOR-01','STOR-02','STOR-03','REV-04']);
 for(let i=0;i<expectedIds.length;i++){
  const c=a.cases[i],id=expectedIds[i];
  if(c.id!==id||c.status!=='NOT_RUN'||c.actual!==null||
   c.evidenceRef!==null||!c.actor||!c.action||!c.evidence||
   c.expected!==(unresolved.has(id)?'UNRESOLVED_CONTRACT':allow.has(id)?'ALLOW':'DENY'))
   fail('signed acceptance case fabricated, reordered or cleared');
 }
 return Object.freeze({workPackage:'B10-R18-153',decision:'NO_GO',
   originalPolicies:8,permissiveSelectPolicies:3,unknownSelectPolicySemantics:1,
   signedCasesDefined:18,signedCasesExecuted:0,
   independentReviewerApproved:false,releaseAuthorized:false});
}
