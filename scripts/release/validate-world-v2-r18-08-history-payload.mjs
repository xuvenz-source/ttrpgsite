
/* R18-08: read-only verification. Never runs a CLI, SQL or network request. */
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR18ReleaseWorkspace} from './validate-world-v2-r18-07-workspace.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const baselineFile=join(root,'staging/world-v2-b10-r18-08-remote-history-content-hashes.json');
const md5=data=>createHash('md5').update(data).digest('hex');
const fail=message=>{throw new Error(message)};

function requireConfigBoolean(source,section,value){
 const lines=source.split(/\r?\n/),sections=[];
 for(let i=0;i<lines.length;i++){
  const m=lines[i].match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
  if(m)sections.push({name:m[1],at:i});
 }
 const wanted=sections.filter(x=>x.name===section);
 if(wanted.length!==1)fail('Missing or duplicated ['+section+'] section');
 const start=wanted[0].at,end=sections.find(x=>x.at>start)?.at??lines.length;
 const matches=lines.slice(start+1,end).filter(x=>/^\s*enabled\s*=/.test(x));
 const pattern=new RegExp('^\\s*enabled\\s*=\\s*'+(value?'true':'false')+'\\s*(?:#.*)?$');
 if(matches.length!==1||!pattern.test(matches[0]))
  fail('['+section+'] enabled must explicitly be '+value);
}

export function validateR18HistoryPayload({
 workspace,freshPayload,
 hashBaseline=JSON.parse(readFileSync(baselineFile,'utf8')),
 expectedProjectRef='lwhwgqaunxbmvyndswze'
}={}){
 if(typeof workspace!=='string'||!workspace.trim())
  fail('An explicit isolated workspace is required');
 if(!Array.isArray(freshPayload)||freshPayload.length!==83)
  fail('A fresh 83-row SQL-digest query is required');
 if(!Array.isArray(hashBaseline.rows)||hashBaseline.rows.length!==83||
  hashBaseline.originalMigrationVersionCount!==83||
  hashBaseline.expectedNewestVersion!=='20261109171247'||
  hashBaseline.targetVersionAbsent!==true)
  fail('Stored SQL hash baseline is invalid');
 if(expectedProjectRef!=='lwhwgqaunxbmvyndswze')
  fail('Unexpected Supabase project reference');
 const previous=new Map(),seen=new Set();
 for(const x of hashBaseline.rows){
  if(!x||typeof x.version!=='string'||!/^\d{14}$/.test(x.version)||
   !/^[a-zA-Z0-9_-]+$/.test(x.name)||
   !Number.isSafeInteger(x.statement_count)||x.statement_count<1||
   typeof x.fetched_sql_md5!=='string'||!/^[a-f0-9]{32}$/.test(x.fetched_sql_md5)||
   previous.has(x.version))
   fail('Invalid or duplicate baseline SQL fingerprint');
  previous.set(x.version,x);
 }
 for(const x of freshPayload){
  if(!x||!previous.has(x.version)||seen.has(x.version))
   fail('Unexpected or duplicate fresh SQL fingerprint identity');
  seen.add(x.version);
  const prior=previous.get(x.version);
  if(x.name!==prior.name||x.statement_count!==prior.statement_count||
   x.fetched_sql_md5!==prior.fetched_sql_md5)
   fail('Fresh SQL fingerprint drift for version '+x.version);
 }
 if(seen.size!==83)fail('Missing fresh SQL fingerprint');
 // Preserve all R18-07 checks, including historical version/name and
 // frozen R05 Git blob. A digest alone cannot establish permissions.
 const old=validateR18ReleaseWorkspace({
  workspace,freshHistory:freshPayload.map(({version,name})=>({version,name}))
 });
 if(old.safeToApply!==false||old.expectedPendingMigrations.length!==1)
  fail('Unexpected previous release gate');
 const base=realpathSync(resolve(workspace));
 const confPath=join(base,'supabase/config.toml');
 if(!lstatSync(confPath).isFile()||realpathSync(confPath)!==confPath)
  fail('CLI config.toml must be a real file');
 const cfg=readFileSync(confPath,'utf8');
 requireConfigBoolean(cfg,'db.migrations',true);
 requireConfigBoolean(cfg,'db.seed',false);
 const refFile=join(base,'supabase/.temp/project-ref');
 if(!lstatSync(refFile).isFile()||realpathSync(refFile)!==refFile||
  readFileSync(refFile,'utf8').trim()!==expectedProjectRef)
  fail('Linked CLI project does not match expected Supabase project');
 for(const key of ['SUPABASE_PROJECT_ID','PROJECT_ID'])
  if(process.env[key]&&process.env[key]!==expectedProjectRef)
   fail('Unexpected CLI project override '+key);
 const migrations=join(base,'supabase/migrations');
 for(const x of freshPayload){
  const file=join(migrations,x.version+'_'+x.name+'.sql');
  if(md5(readFileSync(file))!==x.fetched_sql_md5)
   fail('Fetched historical SQL differs from live content '+x.version);
 }
 return Object.freeze({
  decision:'DRY_RUN_ONLY',safeToApply:false,
  validatedRemoteSqlBodies:83,
  target:old.expectedPendingMigrations[0],
  linkedProjectMatches:true,migrationsEnabled:true,seedingDisabled:true,
  actualCliDryRunPerformed:false
 });
}

function argument(name){
 const prefix='--'+name+'=';
 const found=process.argv.find(x=>x.startsWith(prefix));
 return found?found.slice(prefix.length):null;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const path=argument('fresh-sql-hashes');
  if(!path)fail('Supply --fresh-sql-hashes=path.json from a new read-only SQL digest query');
  const parsed=JSON.parse(readFileSync(resolve(path),'utf8'));
  const report=validateR18HistoryPayload({
   workspace:argument('workspace'),
   freshPayload:Array.isArray(parsed)?parsed:parsed.rows
  });
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch(error){
  process.stderr.write('NO-GO: '+error.message+'\n');
  process.exitCode=1;
 }
}
