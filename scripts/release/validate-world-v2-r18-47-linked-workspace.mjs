/**
 * R18-47 offline-only operator gate for a future SEPARATELY AUTHORIZED
 * linked Supabase CLI dry-run. Never executes CLI, connects to Supabase,
 * accesses live campaign content, changes migration history or writes SQL.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,realpathSync,lstatSync} from 'node:fs';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR47OfflinePackage} from './validate-world-v2-r18-47-offline-package.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const BASELINE=join(ROOT,'staging/world-v2-b10-r18-08-remote-history-content-hashes.json');
const MANIFEST=join(ROOT,'staging/world-v2-b10-r18-47-isolated-pending/manifest.json');
const md5=x=>createHash('md5').update(x).digest('hex');
const fail=x=>{throw Error('R47 LINKED NO-GO: '+x)};
function checkedFile(path){
 if(!lstatSync(path).isFile()||realpathSync(path)!==path)
  fail('symlink/nonregular control or SQL file');
 return readFileSync(path,'utf8');
}
function expectedFlag(src,section,value){
 const lines=src.split(/\r?\n/),ids=[];
 for(let i=0;i<lines.length;i++)
  if(new RegExp('^\\s*\\['+section.replace('.','\\.')+'\\]\\s*$').test(lines[i]))
   ids.push(i);
 if(ids.length!==1)fail('missing/duplicated '+section+' section');
 let end=ids[0]+1;while(end<lines.length&&!/^\s*\[/.test(lines[end]))end++;
 const flags=lines.slice(ids[0]+1,end).filter(s=>/^\s*enabled\s*=/.test(s));
 if(flags.length!==1||!new RegExp('^\\s*enabled\\s*=\\s*'+(value?'true':'false')+'\\s*(?:#.*)?$').test(flags[0]))
  fail('unsafe migration or seed configuration '+section);
}
export function validateR47LinkedWorkspace({workspace,freshSqlDigests,repoRoot=ROOT,
 hashBaseline,manifest}={}){
 if(typeof workspace!=='string'||!workspace.trim())
  fail('explicit isolated workspace required');
 const root=realpathSync(resolve(repoRoot)),base=realpathSync(resolve(workspace));
 if(base===root||base.startsWith(root+sep))fail('repository root/subdirectory never a release workspace');
 if(!lstatSync(base).isDirectory())fail('workspace is not a real directory');
 const report=validateR47OfflinePackage({repoRoot:root,manifest});
 if(report.safeToApply!==false||report.cliGenerated!==9)
  fail('offline approved package not source-pinned');
 const m=manifest??JSON.parse(checkedFile(join(root,'staging/world-v2-b10-r18-47-isolated-pending/manifest.json')));
 const history=hashBaseline??JSON.parse(checkedFile(join(root,'staging/world-v2-b10-r18-08-remote-history-content-hashes.json')));
 const existing=history?.rows;
 if(!Array.isArray(existing)||existing.length!==83||
   !Array.isArray(freshSqlDigests)||freshSqlDigests.length!==83)
  fail('83 exact remote SQL content fingerprints required');
 const seen=new Set(),actual=new Map();
 for(const x of freshSqlDigests){
  if(!x||!/^\d{14}$/.test(x.version)||typeof x.name!=='string'||
    !Number.isSafeInteger(x.statement_count)||x.statement_count<1||
    !/^[a-f0-9]{32}$/.test(x.fetched_sql_md5)||actual.has(x.version))
   fail('malformed or duplicated new remote history record');
  actual.set(x.version,x);
 }
 const dir=resolve(base,'supabase/migrations');
 if(realpathSync(dir)!==dir||!lstatSync(dir).isDirectory())
  fail('migration directory must be real and isolated');
 const entries=readdirSync(dir,{withFileTypes:true});
 const expected=new Set();
 for(const record of existing){
  const x=actual.get(record.version);
  if(!x||x.name!==record.name||x.statement_count!==record.statement_count||
    x.fetched_sql_md5!==record.fetched_sql_md5||seen.has(record.version))
   fail('remote migration name/version/SQL digest drift '+record.version);
  seen.add(record.version);
  const name=x.version+'_'+x.name+'.sql';
  if(!/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(name))
   fail('unsafe historical migration filename');
  expected.add(name);
  const source=checkedFile(join(dir,name));
  if(!source.trim()||md5(source)!==x.fetched_sql_md5)
   fail('fetched SQL does not match live database '+name);
 }
 if(seen.size!==83)fail('incomplete remote migration history');
 const r05=m.originalR05.file.split('/').at(-1);
 expected.add(r05);
 if(checkedFile(join(dir,r05))!==checkedFile(join(root,m.originalR05.file)))
  fail('pending R05 is not exact Git-pinned source');
 for(const item of m.packages){
  expected.add(item.filename);
  if(checkedFile(join(dir,item.filename))!==checkedFile(join(root,item.source)))
   fail('pending official CLI file differs from reviewed source '+item.filename);
 }
 if(entries.length!==93||entries.some(x=>!x.isFile()||!expected.has(x.name))||expected.size!==93)
  fail('workspace must contain exactly 83 fetched plus R05 plus nine reviewed pending files');
 const config=checkedFile(join(base,'supabase/config.toml'));
 expectedFlag(config,'db.migrations',true);
 expectedFlag(config,'db.seed',false);
 if(checkedFile(join(base,'supabase/.temp/project-ref')).trim()!==m.live.projectRef)
  fail('linked project ID differs from audited Supabase project');
 for(const key of ['SUPABASE_PROJECT_ID','PROJECT_ID'])
  if(process.env[key]&&process.env[key]!==m.live.projectRef)
   fail('unexpected project ID override');
 return Object.freeze({decision:'DRY_RUN_ONLY',safeToApply:false,
  checkedRealRemoteBodies:83,reviewedPending:10,normalRootPushSafe:false,
  actualLinkedCliDryRunPerformed:false,requiresIndependentDM_P1_P2:true,
  performanceCandidatesApproved:false});
}
function argument(k){
 const prefix='--'+k+'=';
 const found=process.argv.find(x=>x.startsWith(prefix));
 return found?.slice(prefix.length);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const input=argument('fresh-sql-digests');
  if(!input)fail('fresh read-only hash export required');
  const data=JSON.parse(readFileSync(resolve(input),'utf8'));
  const r=validateR47LinkedWorkspace({
   workspace:argument('workspace'),freshSqlDigests:Array.isArray(data)?data:data.rows});
  process.stdout.write(JSON.stringify(r,null,2)+'\n');
 }catch(e){process.stderr.write(e.message+'\n');process.exitCode=1}
}
