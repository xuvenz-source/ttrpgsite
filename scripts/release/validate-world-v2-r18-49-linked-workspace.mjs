/**
 * B10-R18-49: READ-ONLY, offline, 83+8 Supabase CLI workspace verifier.
 * No remote calls, SQL execution, child processes, or write operations.
 * A passing report is DRY_RUN_ONLY, NEVER permission to deploy.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,realpathSync,lstatSync,existsSync} from 'node:fs';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR48NarrowPackage} from './validate-world-v2-r18-48-narrow-package.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const BASELINE='staging/world-v2-b10-r18-08-remote-history-content-hashes.json';
const R48='staging/world-v2-b10-r18-48-narrow-pending/manifest.json';
const PROJECT_REF='lwhwgqaunxbmvyndswze';
const R05='supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql';
const fail=s=>{throw Error('R49 LINKED NO-GO: '+s);};
const md5=s=>createHash('md5').update(s).digest('hex');

function regular(path){
 if(!lstatSync(path).isFile()||realpathSync(path)!==path)
  fail('symlink or nonregular file: '+path.split(sep).at(-1));
 return readFileSync(path,'utf8');
}
function realDirectory(path){
 if(!lstatSync(path).isDirectory()||realpathSync(path)!==path)
  fail('symlinked or nonregular directory');
 return path;
}
function flag(toml,section,wanted){
 const lines=toml.split(/\r?\n/);
 const sections=lines.flatMap((line,i)=>line.trim()==='['+section+']'?[i]:[]);
 if(sections.length!==1)fail('missing or duplicate ['+section+']');
 let stop=sections[0]+1;
 while(stop<lines.length&&!/^\s*\[/.test(lines[stop]))stop++;
 const values=lines.slice(sections[0]+1,stop)
   .filter(x=>/^\s*enabled\s*=/.test(x));
 if(values.length!==1||!new RegExp('^\\s*enabled\\s*=\\s*'+
   (wanted?'true':'false')+'\\s*(?:#.*)?$').test(values[0]))
  fail('unsafe '+section+'.enabled configuration');
}
function validateRecords({historical,freshSqlDigests}){
 if(!Array.isArray(historical)||historical.length!==83||
    !Array.isArray(freshSqlDigests)||freshSqlDigests.length!==83)
  fail('exactly 83 independently fingerprinted historical versions required');
 const baseline=new Map(),current=new Map();
 for(const [rows,target] of [[historical,baseline],[freshSqlDigests,current]]){
  for(const x of rows){
   if(!x||typeof x.version!=='string'||!/^\d{14}$/.test(x.version)||
      typeof x.name!=='string'||!/^[a-zA-Z0-9_-]+$/.test(x.name)||
      !Number.isSafeInteger(x.statement_count)||x.statement_count<1||
      typeof x.fetched_sql_md5!=='string'||!/^[a-f0-9]{32}$/.test(x.fetched_sql_md5)||
      target.has(x.version))
    fail('invalid or duplicate historical migration record');
   target.set(x.version,x);
  }
 }
 if([...baseline.keys()].some(k=>!current.has(k)))fail('missing historical migration version');
 for(const [version,x] of current){
  const old=baseline.get(version);
  if(!old||old.name!==x.name||old.statement_count!==x.statement_count||
     old.fetched_sql_md5!==x.fetched_sql_md5)
   fail('fresh source SQL digest/history drift at '+version);
 }
 if([...current.keys()].sort().at(-1)!=='20261109171247')
  fail('historical last migration drift');
 return current;
}
/**
 * Filesystem verifier separated for adversarial synthetic testing.
 * Its output by itself is NOT a production release attestation.
 * The public validator below independently source-pins R18-48 and the frozen
 * original 83-history record; callers cannot inject an alternate baseline.
 */
export function inspectR49IsolatedFiles({workspace,repoRoot,historical,
 freshSqlDigests,manifest,projectRef=PROJECT_REF}={}){
 if(typeof workspace!=='string'||!workspace.trim())fail('explicit isolated workspace required');
 const root=realpathSync(resolve(repoRoot)),base=realpathSync(resolve(workspace));
 realDirectory(base);
 if(base===root||base.startsWith(root+sep)||root.startsWith(base+sep))
  fail('workspace and source checkout must be disjoint');
 if(projectRef!==PROJECT_REF)fail('unexpected project identity');
 const records=validateRecords({historical,freshSqlDigests});
 const supabase=realDirectory(join(base,'supabase'));
 const dir=realDirectory(join(supabase,'migrations'));
 const temporary=realDirectory(join(supabase,'.temp'));
 if(existsSync(join(supabase,'roles.sql'))||existsSync(join(supabase,'seed.sql')))
  fail('additional roles/seed SQL forbidden');
 const toml=regular(join(supabase,'config.toml'));
 flag(toml,'db.migrations',true);
 flag(toml,'db.seed',false);
 if(regular(join(temporary,'project-ref')).trim()!==PROJECT_REF)
  fail('linked project identity differs from production baseline');
 for(const key of ['SUPABASE_PROJECT_ID','PROJECT_ID']){
  if(process.env[key]&&process.env[key]!==PROJECT_REF)
   fail('project-ref override differs from baseline');
 }
 const expected=new Set();
 for(const x of records.values()){
  const name=x.version+'_'+x.name+'.sql';
  expected.add(name);
  const sql=regular(join(dir,name));
  if(!sql.trim()||md5(sql)!==x.fetched_sql_md5)
   fail('fetched historical SQL payload mismatch '+x.version);
 }
 const sourceR05=regular(join(root,R05));
 const nameR05=R05.split('/').at(-1);
 expected.add(nameR05);
 if(regular(join(dir,nameR05))!==sourceR05)
  fail('unapplied R05 differs from frozen source');
 if(!manifest||!Array.isArray(manifest.pending)||manifest.pending.length!==7||
    manifest.baseline?.remoteMigrations!==83||
    manifest.expectedPendingTotalWithR05!==8||
    manifest.safeToApply!==false||manifest.releaseDecision!=='NO_GO')
  fail('R18-48 narrow package is not approved for dry-run verification');
 let last='20261111023204';
 for(const p of manifest.pending){
  if(!/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(p.filename)||
     p.filename.slice(0,14)<=last||expected.has(p.filename))
   fail('unknown or out-of-order pending version');
  last=p.filename.slice(0,14);
  expected.add(p.filename);
  const staged=join(root,manifest.stagedMigrationDirectory,p.filename);
  if(regular(join(dir,p.filename))!==regular(staged))
   fail('staged pending migration body differs from exact R18-48 source '+p.filename);
 }
 if(expected.size!==91)fail('version collision, missing 83+8 set');
 const entries=readdirSync(dir,{withFileTypes:true});
 if(entries.length!==91||entries.some(x=>!x.isFile()||!expected.has(x.name)))
  fail('unexpected/missing migration file: require 83 fetched + 8 narrow only');
 return Object.freeze({historicalBodiesChecked:83,pendingChecked:8,
  totalFilesChecked:91,projectIdentityChecked:true});
}
export function validateR49LinkedWorkspace({workspace,freshSqlDigests,repoRoot=ROOT}={}){
 const root=realpathSync(resolve(repoRoot));
 const r48=validateR48NarrowPackage({repoRoot:root});
 if(r48.decision!=='NO_GO'||r48.safeToApply!==false||
    r48.pendingWithR05!==8||r48.originalStepValidatorPreserved!==true)
  fail('source-pinned R18-48 NO-GO package not valid');
 const original=JSON.parse(regular(join(root,BASELINE)));
 const manifest=JSON.parse(regular(join(root,R48)));
 if(original.originalMigrationVersionCount!==83||
    original.expectedNewestVersion!=='20261109171247'||
    manifest.baseline?.sqlDigestsMatched!==83||
    manifest.baseline?.latest!=='20261109171247')
  fail('frozen original 83-history record drift');
 const report=inspectR49IsolatedFiles({workspace,repoRoot:root,
  historical:original.rows,freshSqlDigests,manifest});
 return Object.freeze({...report,decision:'DRY_RUN_ONLY',safeToApply:false,
  executedLinkedCli:false,executedSql:false,cliDryRunResultVerified:false,
  independentDmP1P2Accepted:false,lockedOutRevocationTestPassed:false,
  deploymentApproved:false,normalRepoRootPushSafe:false});
}
function value(k){
 const matches=process.argv.filter(s=>s.startsWith('--'+k+'='));
 if(matches.length!==1||!matches[0].slice(k.length+3))
  fail('exactly one --'+k+'=... argument required');
 return matches[0].slice(k.length+3);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const unexpected=process.argv.slice(2).filter(x=>
   !x.startsWith('--workspace=')&&!x.startsWith('--fresh-sql-digests='));
  if(unexpected.length)fail('unknown argument');
  const fresh=JSON.parse(regular(resolve(value('fresh-sql-digests'))));
  const report=validateR49LinkedWorkspace({workspace:value('workspace'),
   freshSqlDigests:Array.isArray(fresh)?fresh:fresh.rows});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
