/**
 * R18-07: read-only release workspace gate.
 *
 * DO NOT EXECUTE SQL, access Supabase, create directories or change migration
 * history here. The operator supplies an isolated workspace obtained through
 * Supabase CLI "migration fetch" and a FRESH read-only history export.
 *
 * This file deliberately has no "apply"/"push"/"repair" operation.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const snapshotPath=join(root,
 'staging/world-v2-b10-r18-07-live-migration-baseline.json');
const checkedInTarget=join(root,
 'supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql');

export const gitBlobSha=source=>{
 const bytes=Buffer.from(source,'utf8');
 return createHash('sha1')
  .update(Buffer.from('blob '+bytes.length+'\0'))
  .update(bytes).digest('hex');
};

function strictHistory(rows,label){
 if(!Array.isArray(rows)||rows.length!==83)
  throw new Error(label+': exactly 83 remote history entries required');
 const versions=new Set(),names=new Set();
 for(const x of rows){
  if(!x||typeof x.version!=='string'||!/^\d{14}$/.test(x.version)||
   typeof x.name!=='string'||!/^[-a-zA-Z0-9_]+$/.test(x.name))
   throw new Error(label+': malformed migration metadata');
  if(versions.has(x.version)||names.has(x.version+'_'+x.name))
   throw new Error(label+': duplicated migration metadata');
  versions.add(x.version);names.add(x.version+'_'+x.name);
 }
 return rows.slice().sort((a,b)=>a.version.localeCompare(b.version));
}

export function validateR18ReleaseWorkspace({workspace,freshHistory,
 snapshot=JSON.parse(readFileSync(snapshotPath,'utf8'))}){
 if(typeof workspace!=='string'||!workspace.trim())
  throw new Error('An explicit isolated workspace directory is required');
 if(!freshHistory)throw new Error('A fresh read-only remote history export is required');
 const actualRows=Array.isArray(freshHistory)?freshHistory:freshHistory.migrations;
 const baseline=strictHistory(snapshot.applied,'approved baseline');
 const actual=strictHistory(actualRows,'fresh remote history');
 const expected=JSON.stringify(baseline),observed=JSON.stringify(actual);
 if(expected!==observed)
  throw new Error('Remote history drift: refusing any pending migration');
 if(snapshot.expectedTargetVersion!=='20261111023204'||
  snapshot.targetFilename!=='20261111023204_world_v2_b10_integrated_motion.sql')
  throw new Error('Unexpected migration target identity');
 if(actual.some(x=>x.version===snapshot.expectedTargetVersion))
  throw new Error('R05 target already exists in remote history');
 const sha=gitBlobSha(readFileSync(checkedInTarget,'utf8'));
 if(sha!==snapshot.targetGitBlobSha)
  throw new Error('Reviewed R05 source blob is no longer exact');

 const base=realpathSync(resolve(workspace));
 const rel=relative(root,base);
 if(!rel.startsWith('..'+sep)&&rel!=='..')
  throw new Error('Release workspace must be outside repository checkout');
 if(!lstatSync(base).isDirectory())
  throw new Error('Release workspace must be a directory');
 const folder=join(base,'supabase/migrations');
 if(!lstatSync(folder).isDirectory()||
  realpathSync(folder)!==folder)
  throw new Error('Release migration directory must be real, not symlinked');
 const entries=readdirSync(folder,{withFileTypes:true});
 if(entries.some(x=>!x.isFile()||!/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(x.name)))
  throw new Error('Unexpected non-SQL or unsafe release workspace files');
 if(entries.length!==baseline.length+1)
  throw new Error('Workspace must contain exactly 83 fetched remote migrations plus R05');
 const actualNames=new Set(entries.map(x=>x.name));
 const names=new Set(baseline.map(x=>x.version+'_'+x.name+'.sql'));
 const target=snapshot.targetFilename;
 if(!actualNames.has(target))throw new Error('Reviewed R05 migration missing');
 for(const name of names){
  if(!actualNames.has(name))throw new Error('Missing fetched remote migration '+name);
  const content=readFileSync(join(folder,name),'utf8');
  if(!content.trim()||/^\s*--\s*(?:empty|placeholder|applied remotely)/i.test(content))
   throw new Error('Fetched remote history contains a placeholder '+name);
 }
 for(const name of actualNames)
  if(name!==target&&!names.has(name))
   throw new Error('Unapproved extra pending migration '+name);
 const targetBody=readFileSync(join(folder,target),'utf8');
 if(gitBlobSha(targetBody)!==sha)
  throw new Error('Release workspace R05 SQL does not match reviewed Git blob');
 return Object.freeze({
  decision:'DRY_RUN_ONLY',safeToApply:false,
  snapshotMigrationCount:83,exactHistory:true,
  targetVersion:snapshot.expectedTargetVersion,
  targetFilename:target,expectedPendingMigrations:[target],
  targetGitBlobSha:sha,
  message:'Read-only workspace validated. A linked Supabase CLI migration list and db push --dry-run must still independently show ONLY this pending file. Never use this script to apply SQL.'
 });
}

function arg(name){
 const flag='--'+name+'=';
 const value=process.argv.find(x=>x.startsWith(flag));
 return value?value.slice(flag.length):null;
}
if(process.argv[1]&&
 resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const workspace=arg('workspace');
  const history=arg('fresh-history');
  if(!history)throw new Error('Supply --fresh-history=path.json from a new read-only Supabase list_migrations call');
  const report=validateR18ReleaseWorkspace({
   workspace,freshHistory:JSON.parse(readFileSync(resolve(history),'utf8'))
  });
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch(error){
  process.stderr.write('NO-GO: '+error.message+'\n');
  process.exitCode=1;
 }
}
