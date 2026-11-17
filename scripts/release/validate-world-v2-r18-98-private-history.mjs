/**
 * R18-98 — source-pinned, OFFLINE verification of an operator-owned private
 * recovery workspace. The 83 SQL bodies stay on the operator's machine.
 * Neither this validator nor its CLI entrypoint calls Supabase or applies SQL.
 * A PASS here is not release authority and not proof of provenance of the
 * supplied CLI binary, session or remote account.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const HISTORY='staging/world-v2-b10-r18-08-remote-history-content-hashes.json';
const PRODUCTION='lwhwgqaunxbmvyndswze';
const QA='bgydsamxypjslergfpla';
const fail=why=>{throw Error('R98 PRIVATE HISTORY NO-GO: '+why)};
const contain=(p,q)=>q===p||q.startsWith(p+sep);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const regular=(path,max=12*1024*1024)=>{
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
  st.size<1||st.size>max||realpathSync(path)!==resolve(path))
  fail('regular private file required');
 return readFileSync(path,'utf8');
};
const directory=path=>{
 const s=lstatSync(path);
 if(!s.isDirectory()||s.isSymbolicLink()||
  realpathSync(path)!==resolve(path))fail('private directory must not be symlinked');
 return path;
};
const checked=rows=>{
 if(!Array.isArray(rows)||rows.length!==83)fail('exact 83 baseline rows required');
 const seen=new Set();
 for(const x of rows){
  if(!x||Object.keys(x).sort().join(',')!=='fetched_sql_md5,name,statement_count,version'||
   !/^\d{14}$/.test(x.version)||!/^[a-zA-Z0-9_-]+$/.test(x.name)||
   !/^[a-f0-9]{32}$/.test(x.fetched_sql_md5)||
   !Number.isSafeInteger(x.statement_count)||x.statement_count<1||
   seen.has(x.version))fail('invalid source history rows');
  seen.add(x.version);
 }
 if(!equal(rows.map(x=>x.version),rows.map(x=>x.version).sort())||
  rows.at(-1).version!=='20261109171247')fail('original history order/last version changed');
 return rows;
};
const flag=(text,section,wanted)=>{
 const lines=text.split(/\r?\n/);
 const locations=lines.flatMap((v,i)=>v.trim()==='['+section+']'?[i]:[]);
 if(locations.length!==1)fail('missing/duplicate config section');
 let end=locations[0]+1;
 while(end<lines.length&&!/^\s*\[/.test(lines[end]))end++;
 const setting=lines.slice(locations[0]+1,end)
  .filter(x=>/^\s*enabled\s*=/.test(x));
 if(setting.length!==1||!new RegExp('^\\s*enabled\\s*=\\s*'+
  (wanted?'true':'false')+'\\s*(?:#.*)?$').test(setting[0]))
  fail('unsafe migration/seed config');
};
export function validateR98Environment(env=process.env){
 const forbidden=['DATABASE_URL','SUPABASE_DB_URL','PGHOST','PGHOSTADDR',
  'PGDATABASE','PGSERVICE','PGSERVICEFILE','PGPASSFILE'];
 for(const key of forbidden)if(env[key])fail('external database override '+key);
 for(const key of ['PROJECT_ID','SUPABASE_PROJECT_ID']){
  if(env[key]&&env[key]!==PRODUCTION)fail('wrong source project override');
 }
 if(env.SUPABASE_YES==='true'||env.SUPABASE_YES==='1')
  fail('unattended yes override forbidden');
 if(env.GITHUB_ACTIONS||env.CI||env.VERCEL)
  fail('private production-history operations prohibited in CI');
}
/** Separate testable pure file check. Caller-supplied rows are for tests only.
 * Use inspectR98PrivateHistorySource() for source-pinned validation.
 */
export function inspectR98PrivateHistory({workspace,repoRoot=ROOT,rows,
 phase='fetched',env=process.env}={}){
 validateR98Environment(env);
 if(!['before','fetched'].includes(phase))fail('invalid recovery phase');
 const root=directory(resolve(repoRoot));
 const base=directory(resolve(workspace));
 if(contain(root,base)||contain(base,root))fail('private workspace intersects Git checkout');
 const sb=directory(join(base,'supabase'));
 const migrations=directory(join(sb,'migrations'));
 const temp=directory(join(sb,'.temp'));
 if(existsSync(join(sb,'roles.sql'))||existsSync(join(sb,'seed.sql')))
  fail('roles/seed SQL forbidden');
 const linked=regular(join(temp,'project-ref'),256).trim();
 if(linked!==PRODUCTION||linked===QA)fail('linked source must be the original project');
 const config=regular(join(sb,'config.toml'),131072);
 flag(config,'db.migrations',true);
 flag(config,'db.seed',false);
 const historic=checked(rows);
 const names=readdirSync(migrations,{withFileTypes:true});
 if(phase==='before'){
  if(names.length!==0)fail('source fetch must start with EMPTY private migrations directory');
  return Object.freeze({decision:'NO_GO',phase:'before',
   originalRefVerified:true,expectedHistoricalFiles:83,
   recoveredHistoricalFiles:0,sqlApplied:false,releaseAuthorized:false});
 }
 if(names.length!==83||names.some(x=>!x.isFile()||
  !/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(x.name)))
  fail('private directory must contain exactly 83 normal historical SQL files');
 const byName=new Set(names.map(x=>x.name));
 let bytes=0;
 const digest=createHash('sha256');
 let reviewMarkerCount=0;
 for(const row of historic){
  const name=row.version+'_'+row.name+'.sql';
  if(!byName.has(name))fail('historical file missing');
  const file=regular(join(migrations,name));
  bytes+=Buffer.byteLength(file,'utf8');
  if(bytes>110*1024*1024)fail('private SQL size budget exceeded');
  if(!file.trim()||
   createHash('md5').update(file,'utf8').digest('hex')!==row.fetched_sql_md5)
   fail('historical SQL-body digest mismatch');
  if(/(?:lwhwgqaunxbmvyndswze|sb_secret_|sbp_[0-9a-f]+|auth\.users|auth\.identities|insert\s+into|copy\s+public\.)/i.test(file))
   reviewMarkerCount++;
  digest.update(name+'\0'+createHash('sha256').update(file,'utf8').digest('hex')+'\n');
 }
 return Object.freeze({
  decision:'NO_GO',phase:'fetched',historicalFilesVerified:83,
  exactHistoricalBytesVerified:true,originalRefVerified:true,
  aggregateSha256:digest.digest('hex'),reviewMarkerFiles:reviewMarkerCount,
  privateDataAndPortabilityReviewCompleted:false,
  qaWorkspaceVerified:false,qaInstallApproved:false,sqlApplied:false,
  releaseAuthorized:false
 });
}
export function inspectR98PrivateHistorySource(options={}){
 const doc=JSON.parse(readFileSync(join(ROOT,HISTORY),'utf8'));
 if(doc.originalMigrationVersionCount!==83||
  doc.expectedNewestVersion!=='20261109171247'||
  doc.productionBaseSha!=='90df8c960e79e8d66c322095611427da7bb09de4')
  fail('frozen historical source manifest changed');
 return inspectR98PrivateHistory({...options,repoRoot:ROOT,rows:checked(doc.rows)});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==2||!args[0].startsWith('--workspace=')||
   args[1]!=='--ack-source='+PRODUCTION)
   fail('private workspace and explicit original project acknowledgment required');
  const workspace=args[0].slice('--workspace='.length);
  if(!workspace)fail('missing workspace');
  const report=inspectR98PrivateHistorySource({workspace,phase:'fetched'});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch{
  process.stderr.write('R98 PRIVATE HISTORY NO-GO: inspect private workspace and source locally.\n');
  process.exitCode=1;
 }
}
).test(setting[0]))
  fail('unsafe migration/seed config');
};
export function validateR98Environment(env=process.env){
 const forbidden=['DATABASE_URL','SUPABASE_DB_URL','PGHOST','PGHOSTADDR',
  'PGDATABASE','PGSERVICE','PGSERVICEFILE','PGPASSFILE'];
 for(const key of forbidden)if(env[key])fail('external database override '+key);
 for(const key of ['PROJECT_ID','SUPABASE_PROJECT_ID']){
  if(env[key]&&env[key]!==PRODUCTION)fail('wrong source project override');
 }
 if(env.SUPABASE_YES==='true'||env.SUPABASE_YES==='1')
  fail('unattended yes override forbidden');
 if(env.GITHUB_ACTIONS||env.CI||env.VERCEL)
  fail('private production-history operations prohibited in CI');
}
/** Separate testable pure file check. Caller-supplied rows are for tests only.
 * Use inspectR98PrivateHistorySource() for source-pinned validation.
 */
export function inspectR98PrivateHistory({workspace,repoRoot=ROOT,rows,
 phase='fetched',env=process.env}={}){
 validateR98Environment(env);
 if(!['before','fetched'].includes(phase))fail('invalid recovery phase');
 const root=directory(realpathSync(resolve(repoRoot)));
 const base=directory(realpathSync(resolve(workspace)));
 if(contain(root,base)||contain(base,root))fail('private workspace intersects Git checkout');
 const sb=directory(join(base,'supabase'));
 const migrations=directory(join(sb,'migrations'));
 const temp=directory(join(sb,'.temp'));
 if(existsSync(join(sb,'roles.sql'))||existsSync(join(sb,'seed.sql')))
  fail('roles/seed SQL forbidden');
 const linked=regular(join(temp,'project-ref'),256).trim();
 if(linked!==PRODUCTION||linked===QA)fail('linked source must be the original project');
 const config=regular(join(sb,'config.toml'),131072);
 flag(config,'db.migrations',true);
 flag(config,'db.seed',false);
 const historic=checked(rows);
 const names=readdirSync(migrations,{withFileTypes:true});
 if(phase==='before'){
  if(names.length!==0)fail('source fetch must start with EMPTY private migrations directory');
  return Object.freeze({decision:'NO_GO',phase:'before',
   originalRefVerified:true,expectedHistoricalFiles:83,
   recoveredHistoricalFiles:0,sqlApplied:false,releaseAuthorized:false});
 }
 if(names.length!==83||names.some(x=>!x.isFile()||
  !/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(x.name)))
  fail('private directory must contain exactly 83 normal historical SQL files');
 const byName=new Set(names.map(x=>x.name));
 let bytes=0;
 const digest=createHash('sha256');
 let reviewMarkerCount=0;
 for(const row of historic){
  const name=row.version+'_'+row.name+'.sql';
  if(!byName.has(name))fail('historical file missing');
  const file=regular(join(migrations,name));
  bytes+=Buffer.byteLength(file,'utf8');
  if(bytes>110*1024*1024)fail('private SQL size budget exceeded');
  if(!file.trim()||
   createHash('md5').update(file,'utf8').digest('hex')!==row.fetched_sql_md5)
   fail('historical SQL-body digest mismatch');
  if(/(?:lwhwgqaunxbmvyndswze|sb_secret_|sbp_[0-9a-f]+|auth\.users|auth\.identities|insert\s+into|copy\s+public\.)/i.test(file))
   reviewMarkerCount++;
  digest.update(name+'\0'+createHash('sha256').update(file,'utf8').digest('hex')+'\n');
 }
 return Object.freeze({
  decision:'NO_GO',phase:'fetched',historicalFilesVerified:83,
  exactHistoricalBytesVerified:true,originalRefVerified:true,
  aggregateSha256:digest.digest('hex'),reviewMarkerFiles:reviewMarkerCount,
  privateDataAndPortabilityReviewCompleted:false,
  qaWorkspaceVerified:false,qaInstallApproved:false,sqlApplied:false,
  releaseAuthorized:false
 });
}
export function inspectR98PrivateHistorySource(options={}){
 const doc=JSON.parse(readFileSync(join(ROOT,HISTORY),'utf8'));
 if(doc.originalMigrationVersionCount!==83||
  doc.expectedNewestVersion!=='20261109171247'||
  doc.productionBaseSha!=='90df8c960e79e8d66c322095611427da7bb09de4')
  fail('frozen historical source manifest changed');
 return inspectR98PrivateHistory({...options,repoRoot:ROOT,rows:checked(doc.rows)});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==2||!args[0].startsWith('--workspace=')||
   args[1]!=='--ack-source='+PRODUCTION)
   fail('private workspace and explicit original project acknowledgment required');
  const workspace=args[0].slice('--workspace='.length);
  if(!workspace)fail('missing workspace');
  const report=inspectR98PrivateHistorySource({workspace,phase:'fetched'});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch{
  process.stderr.write('R98 PRIVATE HISTORY NO-GO: inspect private workspace and source locally.\n');
  process.exitCode=1;
 }
}
