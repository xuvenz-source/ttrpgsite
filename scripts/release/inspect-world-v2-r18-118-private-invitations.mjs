/**
 * B10-R18-118 — OPERATOR LOCAL ONLY, original 83 private SQL file
 * fingerprint/semantic-indicator check for create_campaign and join_campaign.
 * No network, process spawning, SQL execution, private SQL export, filenames,
 * snippets, live invite values, identities or credentials in stdout.
 *
 * All results are NO_GO. Even byte-exact source equality does not constitute
 * human SQL security review or approval to replay in QA or release.
 */
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectR98PrivateHistorySource,validateR98Environment}
 from './validate-world-v2-r18-98-private-history.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGINAL='lwhwgqaunxbmvyndswze';
const QA='bgydsamxypjslergfpla';
const HISTORY='staging/world-v2-b10-r18-08-remote-history-content-hashes.json';
const MAX_SQL=12*1024*1024;
const fail=()=>{throw Error('R118 PRIVATE INVITATION SOURCE NO-GO')};
const inside=(root,path)=>path===root||path.startsWith(root+sep);
const sha256=s=>createHash('sha256').update(s,'utf8').digest('hex');
const md5=s=>createHash('md5').update(s,'utf8').digest('hex');
export const R118_TARGETS=Object.freeze([
 Object.freeze({name:'create_campaign',argument:'p_name',
  liveBytes:475,liveMd5:'9a12043761641127b6f60304eea876c5',
  liveSha256:'0ea1e01ba784dfa78e92c8e82a3ca2b2d28a19920f5286cc7423d1e891be645f'}),
 Object.freeze({name:'join_campaign',argument:'p_invite_code',
  liveBytes:742,liveMd5:'9fd65eca8e3160acd7a674931aad51c5',
  liveSha256:'5f3a7dbcadc4361f59fa814a820b84cfb2cc0d89f685ae6194efe3912d015655'})
]);
const MARKERS=Object.freeze({
 directAuthIdentity:/\bauth\s*\.\s*uid\s*\(/i,
 insertsCampaignMembership:/\binsert\s+into\s+(?:public\s*\.\s*)?campaign_members\b/i,
 onConflictDoNothing:/\bon\s+conflict\b[\s\S]{0,80}?\bdo\s+nothing\b/i,
 onConflictDoUpdate:/\bon\s+conflict\b[\s\S]{0,80}?\bdo\s+update\b/i,
 playerRoleLiteral:/['"]player['"]/i,
 dmRoleLiteral:/['"]dm['"]/i,
 inviteCodeReference:/\binvite_code\b/i,
 inviteRotationMutation:/\bupdate\s+(?:public\s*\.\s*)?campaigns\b/i,
 revokedOrBannedVocabulary:/\b(?:bann\w*|revok\w*|block\w*|suspend\w*|rejoin\w*|denied|denylist|allowlist)\b/i,
 separateRevocationTable:/\bcampaign_(?:bans|blocks|join_requests|revocations|denied_members)\b/i,
 rowLockReference:/\bfor\s+update\b/i,
 negativeExistenceCheck:/\bnot\s+exists\s*\(/i
});
export function classifyR118InvitationBody(body){
 if(typeof body!=='string'||!body||Buffer.byteLength(body,'utf8')>MAX_SQL)fail();
 return Object.freeze(Object.fromEntries(
  Object.entries(MARKERS).map(([key,regex])=>[key,regex.test(body)])
 ));
}
/**
 * Return at most the body internally, never to CLI output.
 * False-positive comment matches cannot prove live parity: a candidate must
 * also satisfy full SHA-256 and MD5 of the CURRENT original pg_proc.prosrc.
 */
export function extractR118FunctionDefinitions(sql,target){
 if(typeof sql!=='string'||Buffer.byteLength(sql,'utf8')>MAX_SQL||
  !target||!['create_campaign','join_campaign'].includes(target.name))fail();
 const re=new RegExp('\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+'+
  '(?:public\\s*\\.\\s*)?'+target.name+'\\s*\\(','gi');
 const locations=[...sql.matchAll(re)];
 if(locations.length>20)fail();
 const matches=[];
 for(const hit of locations){
  const tail=sql.slice(hit.index,Math.min(sql.length,hit.index+160000));
  const body=/\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;/i.exec(tail);
  if(!body||body.index>5000)continue;
  const header=tail.slice(0,body.index);
  if(!new RegExp('\\b'+target.argument+'\\s+text\\b','i').test(header))continue;
  matches.push(body[2]);
 }
 return matches;
}
export function summarizeR118InvitationDefinition({name,definitions,expected}={}){
 if(!['create_campaign','join_campaign'].includes(name)||
    !expected||expected.name!==name||!Array.isArray(definitions)||definitions.length>83||
    definitions.some(v=>typeof v!=='string'||Buffer.byteLength(v,'utf8')>MAX_SQL))fail();
 const latest=definitions.at(-1)??null;
 const matched=latest!==null&&Buffer.byteLength(latest,'utf8')===expected.liveBytes&&
  md5(latest)===expected.liveMd5&&sha256(latest)===expected.liveSha256;
 return Object.freeze({
  name,
  historicalDefinitionsFound:definitions.length,
  latestHistoricalDefinitionLocated:latest!==null,
  latestHistoricalDefinitionMatchesCurrentLiveSha256:matched,
  liveSha256Pinned:expected.liveSha256,
  currentLiveBodyBytes:expected.liveBytes,
  markersFromExactMatchedBodyOnly:matched?classifyR118InvitationBody(latest):null,
  sourceFingerprintIsNotSecurityApproval:true
 });
}
function checkedPrivateText(path,max=MAX_SQL){
 const p=resolve(path);
 const st=lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size<1||
  st.size>max||realpathSync(p)!==p)fail();
 return readFileSync(p,'utf8');
}
export function verifyR118PrivateDocket({workspace,rows,aggregateSha256,sqlForRow}={}){
 if(!Array.isArray(rows)||rows.length!==83||
   typeof sqlForRow!=='function'||!/^[a-f0-9]{64}$/.test(aggregateSha256??''))fail();
 const path=join(dirname(resolve(workspace)),'r111-private-review-docket.json');
 const stat=lstatSync(path);
 if((stat.mode&0o077)!==0||stat.size>256*1024)fail();
 const doc=JSON.parse(checkedPrivateText(path,256*1024));
 if(doc.schema!==1||doc.workPackage!=='B10-R18-111'||doc.decision!=='NO_GO'||
    doc.originalProjectRef!==ORIGINAL||doc.reviewItems?.length!==83||
    doc.itemsNeedingReview!==83||doc.sourceFingerprintSha256!==aggregateSha256||
    doc.allReviewerDecisionsPending!==true||doc.qaInstallApproved!==false||
    doc.productionReleaseAuthorized!==false||doc.rawSqlBodiesExported!==false)fail();
 const expected=new Map(rows.map(r=>[
  r.version+'_'+r.name+'.sql',sha256(sqlForRow(r))
 ]));
 for(const item of doc.reviewItems){
  if(!expected.has(item.filename)||expected.get(item.filename)!==item.sourceBodySha256||
     item.reviewStatus!=='PENDING'||item.securityApproved!==false||
     item.reviewerAttestation!==null||!item.reviewChecklist||
     Object.values(item.reviewChecklist).some(v=>v!=='PENDING'))fail();
  expected.delete(item.filename);
 }
 if(expected.size!==0)fail();
 return true;
}
export function inspectR118PrivateInvitations({workspace,env=process.env}={}){
 validateR98Environment(env);
 const root=realpathSync(ROOT),base=resolve(workspace);
 if(inside(root,base)||inside(base,root)||
    base.split(sep).at(-1)!=='r106-original-83-recovery')fail();
 const source=inspectR98PrivateHistorySource({workspace:base,phase:'fetched',env});
 if(source.decision!=='NO_GO'||source.historicalFilesVerified!==83||
    source.originalRefVerified!==true||source.qaInstallApproved!==false)fail();
 const frozen=JSON.parse(readFileSync(join(ROOT,HISTORY),'utf8'));
 if(frozen.originalMigrationVersionCount!==83||
    frozen.expectedNewestVersion!=='20261109171247'||frozen.rows?.length!==83||
    source.aggregateSha256!=='fe31759c142602047c1813d8ba1868f734138b8f94c773f7f1b6106b5b6bb783')fail();
 const migrations=join(base,'supabase','migrations');
 const readRow=row=>checkedPrivateText(join(migrations,row.version+'_'+row.name+'.sql'));
 const docketVerified=verifyR118PrivateDocket({
  workspace:base,rows:frozen.rows,aggregateSha256:source.aggregateSha256,sqlForRow:readRow
 });
 const bodies=new Map(R118_TARGETS.map(x=>[x.name,[]]));
 for(const row of frozen.rows){
  const sql=readRow(row);
  if(md5(sql)!==row.fetched_sql_md5)fail();
  for(const target of R118_TARGETS)
   bodies.get(target.name).push(...extractR118FunctionDefinitions(sql,target));
 }
 const functions=R118_TARGETS.map(expected=>summarizeR118InvitationDefinition({
  name:expected.name,definitions:bodies.get(expected.name),expected
 }));
 return Object.freeze({
  schema:1,workPackage:'B10-R18-118',decision:'NO_GO',
  originalProjectRef:ORIGINAL,qaProjectRef:QA,
  originalHistoricalFilesVerified:83,
  originalHistoryAggregateSha256:source.aggregateSha256,
  privateR111DocketReverified:docketVerified,
  currentLiveSha256MetadataAnchored:true,
  functions,
  sourceFingerprintIsNotHumanSemanticReview:true,
  inviteCodeAndUserDataNeverRead:true,
  originalSqlBodiesOrPathsExported:false,
  operatorSessionIndependentlyAttested:false,
  revokedUserRejoinPolicyApproved:false,
  realSignedInvitationChecksPassed:false,
  private83SqlSecurityReviewApproved:false,
  qaHistoricalSqlInstallAuthorized:false,qaSqlApplied:false,
  originalSqlApplied:false,productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==2||!args[0].startsWith('--workspace=')||
     args[1]!=='--ack-source='+ORIGINAL||!args[0].slice('--workspace='.length))fail();
  process.stdout.write(JSON.stringify(inspectR118PrivateInvitations({
   workspace:args[0].slice('--workspace='.length)
  }),null,2)+'\n');
 }catch{
  process.stderr.write('R118 PRIVATE INVITATION SOURCE NO-GO: local verification failed; never upload private SQL, docket, invitation codes or raw logs.\n');
  process.exitCode=1;
 }
}
