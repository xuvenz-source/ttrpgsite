/**
 * R18-100 — operator-local, source-exact, QA-only 83-history mirror preflight.
 * No SQL execution, no filesystem writes and no network I/O.
 * Do not treat a matching private copy as proof of a signed original CLI fetch.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyR99OperatorCapture}
 from './validate-world-v2-r18-99-private-recovery.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const HISTORY='staging/world-v2-b10-r18-08-remote-history-content-hashes.json';
const QA='bgydsamxypjslergfpla';
const PROD='lwhwgqaunxbmvyndswze';
const fail=reason=>{throw Error('R100 QA WORKSPACE NO-GO: '+reason)};
const within=(base,candidate)=>candidate===base||candidate.startsWith(base+sep);
const safeDir=path=>{
 const p=resolve(path),s=lstatSync(p);
 if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(p)!==p)
  fail('private directory must be real, not a symlink');
 return p;
};
const safeFile=(path,max=12*1024*1024)=>{
 const p=resolve(path),st=lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
  st.size<1||st.size>max||realpathSync(p)!==p)
  fail('missing/unsafe private file');
 return readFileSync(p);
};
const sha=data=>createHash('sha256').update(data).digest('hex');
const md5=data=>createHash('md5').update(data).digest('hex');
const checkFlag=(content,name,boolean)=>{
 const lines=content.toString('utf8').split(/\r?\n/);
 const indexes=lines.flatMap((line,i)=>line.trim()==='['+name+']'?[i]:[]);
 if(indexes.length!==1)fail('required config section missing or duplicated');
 let end=indexes[0]+1;
 while(end<lines.length&&!/^\s*\[/.test(lines[end]))end++;
 const matches=lines.slice(indexes[0]+1,end)
  .filter(line=>/^\s*enabled\s*=/.test(line));
 const expected=new RegExp('^\\s*enabled\\s*=\\s*'+
  (boolean?'true':'false')+'\\s*(?:#.*)?$');
 if(matches.length!==1||!expected.test(matches[0]))
  fail('unsafe QA config flag');
};
export function checkR100Environment(env=process.env){
 for(const key of [
  'DATABASE_URL','SUPABASE_DB_URL','PGHOST','PGHOSTADDR',
  'PGDATABASE','PGPORT','PGSERVICE','PGSERVICEFILE','PGPASSFILE',
  'SUPABASE_PROJECT_ID','PROJECT_ID','SUPABASE_YES'
 ])if(env[key]!==undefined&&env[key]!=='')fail('forbidden target override: '+key);
 if(env.CI||env.GITHUB_ACTIONS||env.VERCEL)
  fail('operator-private QA preview cannot run in CI');
}
function frozenRows(repoRoot){
 const doc=JSON.parse(safeFile(join(repoRoot,HISTORY),1048576).toString('utf8'));
 if(doc.originalMigrationVersionCount!==83||
  doc.expectedNewestVersion!=='20261109171247'||
  doc.productionBaseSha!=='90df8c960e79e8d66c322095611427da7bb09de4'||
  !Array.isArray(doc.rows)||doc.rows.length!==83||
  new Set(doc.rows.map(x=>x.version)).size!==83)
  fail('frozen 83-history seal not valid');
 return doc.rows;
}
/** The injected verifier and rows are available only to isolated synthetic tests.
 * The CLI always invokes inspectR100QaWorkspaceSource, which pins both.
 */
export function inspectR100QaWorkspace({
 sourceWorkspace,qaWorkspace,capture,env=process.env,
 repoRoot=ROOT,rows,verifyCapture=verifyR99OperatorCapture
}={}){
 checkR100Environment(env);
 const root=safeDir(repoRoot);
 const source=safeDir(sourceWorkspace),qa=safeDir(qaWorkspace);
 if(within(root,source)||within(source,root)||
  within(root,qa)||within(qa,root)||
  within(source,qa)||within(qa,source))fail('workspace roots must be separate private paths');
 const historical=rows??frozenRows(root);
 if(!Array.isArray(historical)||historical.length!==83)
  fail('83 frozen original SQL fingerprints required');
 const history=verifyCapture({workspace:source,capture,env});
 if(history?.decision!=='NO_GO'||history.historicalFilesCrossChecked!==83||
  history.privateBodyFingerprintMatch!==true||
  history.operatorCaptureMatchedPrivateBytes!==true||
  history.operatorSessionAuthenticatedIndependently!==false||
  history.qaSqlApplied!==false||history.productionReleaseAuthorized!==false)
  fail('R99 private original source receipt did not crosscheck');
 const sb=safeDir(join(qa,'supabase'));
 const migrations=safeDir(join(sb,'migrations'));
 const temp=safeDir(join(sb,'.temp'));
 const linked=safeFile(join(temp,'project-ref'),256).toString('utf8').trim();
 if(linked!==QA||linked===PROD)fail('QA linked project reference mismatch');
 const cfg=safeFile(join(sb,'config.toml'),131072);
 checkFlag(cfg,'db.migrations',true);
 checkFlag(cfg,'db.seed',false);
 for(const p of [
  join(sb,'seed.sql'),join(sb,'roles.sql'),
  join(sb,'.env'),join(sb,'.env.local'),join(sb,'.env.production'),
  join(qa,'.env'),join(qa,'.env.local'),join(qa,'.env.production')
 ])if(existsSync(p))fail('unexpected seed, role or private env in QA mirror');
 const sourceDir=safeDir(join(source,'supabase','migrations'));
 const names=readdirSync(migrations,{withFileTypes:true});
 if(names.length!==83||names.some(x=>!x.isFile()||
  !/^\d{14}_[A-Za-z0-9_-]+\.sql$/.test(x.name)))
  fail('QA mirror must contain exactly 83 original .sql files');
 const expected=new Set(historical.map(r=>r.version+'_'+r.name+'.sql'));
 if(expected.size!==83||
  names.some(x=>!expected.has(x.name)))
  fail('QA migration filename deviated from frozen 83');
 const fingerprint=createHash('sha256');
 let bytes=0,productionRefFiles=0;
 for(const row of historical){
  if(!/^\d{14}$/.test(row.version)||!/^[A-Za-z0-9_-]+$/.test(row.name)||
   !/^[a-f0-9]{32}$/.test(row.fetched_sql_md5))
   fail('invalid historical fingerprint row');
  const name=row.version+'_'+row.name+'.sql';
  const sourceBytes=safeFile(join(sourceDir,name));
  const qaBytes=safeFile(join(migrations,name));
  bytes+=qaBytes.length;
  if(bytes>110*1024*1024||
   md5(qaBytes)!==row.fetched_sql_md5||
   sha(qaBytes)!==sha(sourceBytes))
   fail('QA SQL does not exactly mirror private original history');
  if(qaBytes.includes(Buffer.from(PROD)))productionRefFiles++;
  fingerprint.update(name+'\0'+sha(qaBytes)+'\n');
 }
 if(productionRefFiles>0)
  fail('source project identifier embedded in QA SQL; manual adaptation required');
 return Object.freeze({
  workPackage:'B10-R18-100',decision:'NO_GO',
  qaProjectRef:QA,sourceProjectRef:PROD,
  qaFilesMatchingPrivateOriginal:83,
  qaHistoryMirrorFingerprintSha256:fingerprint.digest('hex'),
  qaFilesSourceExact:true,qaLinkedRefVerified:true,
  historicalSqlSecurityReviewed:false,
  operatorSessionIndependentlyAuthenticated:false,
  qaOnlyDryRunPerformed:false,qaSchemaApplied:false,
  qaInstallApproved:false,productionReleaseAuthorized:false
 });
}
export function inspectR100QaWorkspaceSource(options={}){
 return inspectR100QaWorkspace({
  ...options,repoRoot:ROOT,rows:frozenRows(ROOT),
  verifyCapture:verifyR99OperatorCapture
 });
}
