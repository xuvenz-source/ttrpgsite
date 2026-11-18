/**
 * B10-R18-119: operator-only current invitation RPC in scratch PG17.
 *
 * Reads private original recovery SQL on operator's machine. The exact
 * fingerprint-matched function DDL is streamed over stdin into a disposable
 * --network none --read-only Docker container with no host mounts/ports.
 * Never connects to original or QA Supabase, never uploads SQL/invites/data.
 * Report only contains synthetic boolean outcomes and NO_GO flags.
 */
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectR118PrivateInvitations,R118_TARGETS}
 from './inspect-world-v2-r18-118-private-invitations.mjs';
import {validateR98Environment}
 from './validate-world-v2-r18-98-private-history.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGINAL='lwhwgqaunxbmvyndswze';
const QA='bgydsamxypjslergfpla';
const DB='world_v2_r18_119';
const SOCKET='unix:///var/run/docker.sock';
const V=Object.freeze({
 campaignA:'00000000-0000-4000-8000-000000000101',
 campaignB:'00000000-0000-4000-8000-000000000102',
 dmA:'00000000-0000-4000-8000-000000000301',
 dmB:'00000000-0000-4000-8000-000000000304',
 player1:'00000000-0000-4000-8000-000000000302',
 player2:'00000000-0000-4000-8000-000000000303',
 outsider:'00000000-0000-4000-8000-000000000305',
 inviteA:'A1B2C3D4E5F60708',inviteB:'B1C2D3E4F5A60708',
 newInviteA:'C1D2E3F4A5B60708',invalid:'F0E0D0C0B0A00000'
});
const fail=()=>{throw Error('R119 PRIVATE INVITATION FIXTURE NO-GO')};
let safeStage='initial_checks';
let safeFailureCode='not_classified';
const digest=(alg,value)=>createHash(alg).update(value,'utf8').digest('hex');
export function extractR119PrivateJoinDefinitions(sql){
 if(typeof sql!=='string'||Buffer.byteLength(sql,'utf8')>12*1024*1024)fail();
 const anchor=/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\s*\.\s*)?join_campaign\s*\(/gi;
 const found=[...sql.matchAll(anchor)];
 if(found.length>20)fail();
 const definitions=[];
 for(const m of found){
  const tail=sql.slice(m.index,m.index+100000);
  const body=/\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;/i.exec(tail);
  if(!body||body.index>3000)continue;
  const header=tail.slice(0,body.index);
  if(!/\bp_invite_code\s+text\b/i.test(header))continue;
  definitions.push({ddl:tail.slice(0,body.index+body[0].length),body:body[2]});
 }
 return definitions;
}
export function boundR119PrivateJoinDdl({definitions,live}={}){
 if(!Array.isArray(definitions)||definitions.length!==2||
   !live||live.name!=='join_campaign')fail();
 const latest=definitions.at(-1);
 if(!latest||typeof latest.ddl!=='string'||typeof latest.body!=='string'||
   Buffer.byteLength(latest.body,'utf8')!==live.liveBytes||
   digest('md5',latest.body)!==live.liveMd5||
   digest('sha256',latest.body)!==live.liveSha256||
   !/\bRETURNS\s+uuid\b/i.test(latest.ddl)||
   !/\bLANGUAGE\s+plpgsql\b/i.test(latest.ddl)||
   !/\bSECURITY\s+DEFINER\b/i.test(latest.ddl)||
   !/\bSET\s+search_path\s*(?:=|TO)\s*(?:''|"")(?=\s|AS\b|$)/i.test(latest.ddl))fail();
 return latest.ddl;
}
function checkEnv(env){
 validateR98Environment(env);
 for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DATABASE_URL','DIRECT_URL',
  'SUPABASE_URL','SUPABASE_DB_URL','SUPABASE_DATABASE_URL','PGPASSWORD',
  'PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS',
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'])if(env[k])fail();
}
function originalJoinDdl(workspace){
 safeStage='source_history_integrity';
 const audit=inspectR118PrivateInvitations({workspace});
 if(audit.decision!=='NO_GO'||audit.originalHistoricalFilesVerified!==83||
    audit.privateR111DocketReverified!==true||audit.functions.length!==2||
    audit.functions.some(f=>f.latestHistoricalDefinitionMatchesCurrentLiveSha256!==true))fail();
 const frozen=JSON.parse(readFileSync(join(ROOT,
  'staging/world-v2-b10-r18-08-remote-history-content-hashes.json'),'utf8'));
 const defs=[];
 for(const row of frozen.rows){
  const p=resolve(workspace,'supabase','migrations',
   row.version+'_'+row.name+'.sql');
  const st=lstatSync(p);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
    st.size<1||st.size>12*1024*1024||realpathSync(p)!==p)fail();
  const sql=readFileSync(p,'utf8');
  if(digest('md5',sql)!==row.fetched_sql_md5)fail();
  defs.push(...extractR119PrivateJoinDefinitions(sql));
 }
 safeStage='source_function_definition';
 return boundR119PrivateJoinDdl({
  definitions:defs,live:R118_TARGETS.find(x=>x.name==='join_campaign')
 });
}
function docker(args,opts={}){
 const r=spawnSync('docker',['--host',SOCKET,...args],{
  encoding:'utf8',timeout:opts.timeout??60000,maxBuffer:32768,
  input:opts.input??'',
  stdio:['pipe',opts.capture?'pipe':'ignore','ignore'],
  env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',
   DOCKER_CONFIG:join(process.env.HOME??'/tmp','.docker')}
 });
 return {ok:r.status===0&&!r.error,
  stdout:r.status===0&&opts.capture?r.stdout:''};
}
export function r119SanitizedFailureReceipt(stage,code){
 const stages=new Set(['initial_checks','safe_environment','docker_preflight',
  'source_history_integrity','source_function_definition','scratch_preflight',
  'docker_launch','postgres_ready','synthetic_schema_setup',
  'source_function_install','invitation_behavior_checks']);
 const codes=new Set(['not_classified','docker_cli_unavailable',
  'docker_local_daemon_unavailable_or_denied','docker_postgres17_image_missing',
  'docker_container_launch_rejected']);
 const safeStage=stages.has(stage)?stage:'initial_checks';
 const safeCode=codes.has(code)?code:'not_classified';
 return Object.freeze({
  schema:1,workPackage:'B10-R18-119',decision:'NO_GO',
  reportStatus:'ERROR',safeFailureStage:safeStage,safeFailureCode:safeCode,
  sourceDetailsIncluded:false,privateSqlExported:false,
  originalOrQaSqlExecuted:false,productionReleaseAuthorized:false
 });
}
function preflightLocalDocker(){
 safeStage='docker_preflight';
 if(!docker(['--version']).ok){
  safeFailureCode='docker_cli_unavailable';fail();
 }
 if(!docker(['info','--format','{{.ServerVersion}}']).ok){
  safeFailureCode='docker_local_daemon_unavailable_or_denied';fail();
 }
 // The official Docker CLI otherwise pulls missing images automatically.
 // No implicit registry access, container network, or paid infrastructure.
 if(!docker(['image','inspect','postgres:17']).ok){
  safeFailureCode='docker_postgres17_image_missing';fail();
 }
 safeFailureCode='not_classified';
}
function sqlExec(name,query,capture=false){
 return docker(['exec','-i',name,'psql','-X','-A','-t','-q',
  '-v','ON_ERROR_STOP=1','-U','postgres','-d',DB],
  {input:query+'\n',capture});
}
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function schema(){
 return [
  'BEGIN;',
  'CREATE ROLE authenticated NOLOGIN;',
  'CREATE ROLE anon NOLOGIN;',
  'CREATE SCHEMA auth;',
  'CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=',
  "'' AS $uid$ SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $uid$;",
  'REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC,anon;',
  'GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;',
  'GRANT USAGE ON SCHEMA auth,public TO authenticated;',
  'GRANT USAGE ON SCHEMA public TO anon;',
  'CREATE TABLE public.campaigns(id uuid PRIMARY KEY,owner_id uuid NOT NULL,name text NOT NULL,invite_code text NOT NULL UNIQUE);',
  "CREATE TABLE public.campaign_members(campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,user_id uuid NOT NULL,role text NOT NULL DEFAULT 'player' CHECK(role IN ('dm','player')),joined_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(campaign_id,user_id));",
  'ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;',
  'REVOKE ALL ON public.campaigns,public.campaign_members FROM PUBLIC,anon,authenticated;',
  'INSERT INTO public.campaigns(id,owner_id,name,invite_code) VALUES ('+
   [quote(V.campaignA),quote(V.dmA),quote('Synthetic A'),quote(V.inviteA)].join(',')+
   '),('+[quote(V.campaignB),quote(V.dmB),quote('Synthetic B'),quote(V.inviteB)].join(',')+');',
  'INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES ('+
   [quote(V.campaignA),quote(V.dmA),quote('dm')].join(',')+
   '),('+[quote(V.campaignB),quote(V.dmB),quote('dm')].join(',')+');',
  'COMMIT;'
 ].join('\n');
}
function actorQuery(actor,invite,role='authenticated'){
 if(!['anon','authenticated'].includes(role)||
   (actor!==''&&!Object.values(V).includes(actor))||
   !Object.values(V).includes(invite))fail();
 return ['BEGIN;','SET LOCAL ROLE '+role+';',
  "SELECT pg_catalog.set_config('request.jwt.claim.sub',"+quote(actor)+',true);',
  'SELECT public.join_campaign('+quote(invite)+');','COMMIT;'].join('\n');
}
function scalar(name,expr){
 const result=sqlExec(name,'SELECT ('+expr+')::text;',true);
 if(!result.ok)fail();
 const out=result.stdout.trim();
 if(!/^(true|false|t|f|[0-9]{1,4}|dm|player)$/.test(out))fail();
 return out==='t'?'true':out==='f'?'false':out;
}
function hasMember(name,campaign,actor){
 return scalar(name,'EXISTS(SELECT 1 FROM public.campaign_members WHERE campaign_id='+
 quote(campaign)+' AND user_id='+quote(actor)+')')==='true';
}
function memberRole(name,campaign,actor){
 return scalar(name,'(SELECT role FROM public.campaign_members WHERE campaign_id='+
  quote(campaign)+' AND user_id='+quote(actor)+')');
}
export function sanitizedR119Receipt(obs,{sourceVerified=false}={}){
 const fields=['firstJoinSucceeded','firstJoinIsPlayer',
  'duplicateJoinPreservedPlayerRole','dmDuplicatePreservedDmRole',
  'removedPlayerRejoinedWithUnchangedInvite','invalidInviteAddedMember',
  'rotatedOldInviteAddedMember','rotatedNewInviteAddedMember',
  'nullActorChangedMemberCount','anonymousJoinCallable',
  'crossCampaignMembershipLeaked'];
 if(!obs||fields.some(f=>typeof obs[f]!=='boolean'))fail();
 return Object.freeze({
  schema:1,workPackage:'B10-R18-119',decision:'NO_GO',
  sourceProjectRef:ORIGINAL,qaProjectRef:QA,
  currentOriginalJoinSha256VerifiedLocally:sourceVerified===true,
  syntheticPg17NoNetworkContainer:true,noHostBindMounts:true,
  sourceSqlOutputOrLogsExported:false,
  realSignedSupabaseAuthExercised:false,
  outcomes:Object.fromEntries(fields.map(f=>[f,obs[f]])),
  revokedPlayerInviteReuseObservedInSyntheticSourceExactTest:
   obs.removedPlayerRejoinedWithUnchangedInvite,
  roleAndMembershipRiskRequiresHumanReview:true,
  operatorSessionIndependentlyAttested:false,
  qaSourceHistorySecurityReviewed:false,
  signedQaInvitationAcceptanceApproved:false,
  qaSchemaInstallApproved:false,
  qaSqlApplied:false,originalSqlApplied:false,
  productionReleaseAuthorized:false
 });
}
export function runR119IsolatedFixtureWithDdl(originalDdl,{sourceVerified=false}={}){
 safeStage='scratch_preflight';
 if(typeof originalDdl!=='string'||originalDdl.length<1||originalDdl.length>128000)fail();
 const name='world-v2-r18-119-'+randomBytes(5).toString('hex');
 let active=false;
 try{
  safeStage='docker_launch';
  safeFailureCode='docker_container_launch_rejected';
  const started=docker(['run','--pull=never','-d','--rm','--network','none','--read-only',
   '--user','999:999','--tmpfs','/var/lib/postgresql/data:rw,uid=999,gid=999,mode=0700',
   '--tmpfs','/var/run/postgresql:rw,uid=999,gid=999,mode=0777',
   '--tmpfs','/tmp:rw,uid=999,gid=999,mode=1777',
   '--cap-drop=ALL','--security-opt=no-new-privileges',
   '--pids-limit','96','--memory','384m','--cpus','1','--name',name,
   '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB='+DB,'postgres:17'],
   {timeout:120000});
  if(!started.ok)fail();
  active=true;
  safeFailureCode='not_classified';
  safeStage='postgres_ready';
  let ready=false;
  for(let i=0;i<70;i++){
   // Official postgres image runs a temporary bootstrap server with
   // listen_addresses='' before stopping it and starting the final server.
   // pg_isready alone can return SUCCESS during that temporary phase.
   const server=sqlExec(name,'SHOW listen_addresses;',true);
   if(server.ok&&server.stdout.trim()!==''){
    ready=true;break;
   }
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,350);
  }
  if(!ready)fail();
  safeStage='synthetic_schema_setup';
  if(!sqlExec(name,schema()).ok)fail();
  safeStage='source_function_install';
  if(!sqlExec(name,originalDdl+
   '\nREVOKE ALL ON FUNCTION public.join_campaign(text) FROM PUBLIC,anon,authenticated;'+
   '\nGRANT EXECUTE ON FUNCTION public.join_campaign(text) TO authenticated;').ok)fail();
  safeStage='invitation_behavior_checks';
  const first=sqlExec(name,actorQuery(V.player1,V.inviteA)).ok;
  if(!first||!hasMember(name,V.campaignA,V.player1)||
   memberRole(name,V.campaignA,V.player1)!=='player')fail();
  const duplicate=sqlExec(name,actorQuery(V.player1,V.inviteA)).ok;
  const dupGood=duplicate&&memberRole(name,V.campaignA,V.player1)==='player';
  const dmRepeat=sqlExec(name,actorQuery(V.dmA,V.inviteA)).ok;
  const dmGood=dmRepeat&&memberRole(name,V.campaignA,V.dmA)==='dm';
  if(!sqlExec(name,'DELETE FROM public.campaign_members WHERE campaign_id='+
    quote(V.campaignA)+' AND user_id='+quote(V.player1)+';').ok||
    hasMember(name,V.campaignA,V.player1))fail();
  sqlExec(name,actorQuery(V.player1,V.inviteA));
  const rejoined=hasMember(name,V.campaignA,V.player1);
  sqlExec(name,actorQuery(V.outsider,V.invalid));
  const invalid=hasMember(name,V.campaignA,V.outsider)||
    hasMember(name,V.campaignB,V.outsider);
  if(!sqlExec(name,'UPDATE public.campaigns SET invite_code='+quote(V.newInviteA)+
   ' WHERE id='+quote(V.campaignA)+';').ok)fail();
  sqlExec(name,actorQuery(V.player2,V.inviteA));
  const oldAccepted=hasMember(name,V.campaignA,V.player2);
  sqlExec(name,actorQuery(V.player2,V.newInviteA));
  const newAccepted=hasMember(name,V.campaignA,V.player2);
  const before=scalar(name,'(SELECT COUNT(*) FROM public.campaign_members)');
  sqlExec(name,actorQuery('',V.newInviteA));
  const after=scalar(name,'(SELECT COUNT(*) FROM public.campaign_members)');
  const anon=sqlExec(name,actorQuery(V.outsider,V.newInviteA,'anon')).ok;
  const cross=hasMember(name,V.campaignB,V.player1)||
    hasMember(name,V.campaignB,V.player2)||
    hasMember(name,V.campaignB,V.outsider);
  return sanitizedR119Receipt({
   firstJoinSucceeded:first,firstJoinIsPlayer:true,
   duplicateJoinPreservedPlayerRole:dupGood,dmDuplicatePreservedDmRole:dmGood,
   removedPlayerRejoinedWithUnchangedInvite:rejoined,
   invalidInviteAddedMember:invalid,rotatedOldInviteAddedMember:oldAccepted,
   rotatedNewInviteAddedMember:newAccepted,
   nullActorChangedMemberCount:before!==after,
   anonymousJoinCallable:anon,crossCampaignMembershipLeaked:cross
  },{sourceVerified});
 }finally{
  if(active)docker(['rm','-f',name],{timeout:20000});
 }
}
function runPrivateFixture(workspace){
 safeStage='safe_environment';
 checkEnv(process.env);
 preflightLocalDocker();
 const source=originalJoinDdl(workspace);
 return runR119IsolatedFixtureWithDdl(source,{sourceVerified:true});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==3||!args[0].startsWith('--workspace=')||
    args[1]!=='--ack-source='+ORIGINAL||
    args[2]!=='--ack-disposable-postgres-only=yes'||
    !args[0].slice('--workspace='.length))fail();
  process.stdout.write(JSON.stringify(
   runPrivateFixture(args[0].slice('--workspace='.length)),null,2)+'\n');
 }catch{
  // Fail closed with a non-empty sanitized receipt. No raw error text, SQL,
  // Docker logs, private file paths, invitation values or user records.
  process.stdout.write(JSON.stringify(r119SanitizedFailureReceipt(
   safeStage,safeFailureCode),null,2)+'\n');
  process.stderr.write('R119 PRIVATE INVITATION FIXTURE NO-GO: sanitized failure report generated. Do not share SQL or raw logs.\n');
  process.exitCode=1;
 }
}
