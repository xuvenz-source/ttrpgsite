/**
 * B10-R18-12 — Explicit operator-only, linked Supabase CLI v2.81.3
 * read-only rehearsal. NEVER applies migrations or runs db push without
 * --dry-run. This is NOT an automated deployment or SQL approval.
 *
 * Requires an independently linked disposable local directory OUTSIDE
 * Git checkout and a fresh read-only 83-row SQL-hash JSON export.
 * Credentials are supplied only by the official CLI's existing auth;
 * this script never accepts, prints, uploads, or persists passwords.
 */
import {spawnSync} from 'node:child_process';
import {
  readFileSync,copyFileSync,lstatSync,realpathSync,readdirSync,
  constants as fsConstants
} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR18HistoryPayload}
 from './validate-world-v2-r18-08-history-payload.mjs';
import {validateR18CliTranscripts}
 from './validate-world-v2-r18-09-cli-transcripts.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PROJECT='lwhwgqaunxbmvyndswze';
const VERSION='2.81.3';
const TARGET='20261111023204_world_v2_b10_integrated_motion.sql';
const SOURCE=join(ROOT,'supabase/migrations',TARGET);
const fail=message=>{throw new Error(message)};
const isWithin=(path,folder)=>path===folder||path.startsWith(folder+sep);

function realRegularFile(path){
  if(!lstatSync(path).isFile()||realpathSync(path)!==resolve(path))
    fail('Expected an existing regular file, not a symlink');
  return path;
}
function requiredSetting(config,section,expected){
  const lines=config.split(/\r?\n/);
  const headers=[];
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if(m)headers.push({name:m[1],index:i});
  }
  const candidates=headers.filter(x=>x.name===section);
  if(candidates.length!==1)fail('Duplicate or missing CLI config section: '+section);
  const begin=candidates[0].index;
  const end=headers.find(x=>x.index>begin)?.index??lines.length;
  const enabled=lines.slice(begin+1,end).filter(x=>/^\s*enabled\s*=/.test(x));
  if(enabled.length!==1||!new RegExp('^\\s*enabled\\s*=\\s*'+expected+'\\s*(?:#.*)?$')
   .test(enabled[0]))
    fail('Unsafe CLI config: ['+section+'] enabled must equal '+expected);
}
export function inspectR18IsolatedWorkspace(workspace,{
  env=process.env,root=ROOT
}={}){
  if(typeof workspace!=='string'||!workspace.trim())
    fail('A separate isolated linked workspace is required');
  const base=realpathSync(resolve(workspace));
  if(!lstatSync(base).isDirectory()||isWithin(base,resolve(root)))
    fail('Release CLI workspace must be a real directory outside Git checkout');
  for(const variable of ['SUPABASE_DB_URL','DATABASE_URL','PGHOST',
    'PGPORT','PGDATABASE','PGSERVICE','PGSERVICEFILE']){
    if(env[variable])fail('Ambiguous database URL or PostgreSQL target override: '+variable);
  }
  for(const variable of ['SUPABASE_PROJECT_ID','PROJECT_ID']){
    if(env[variable]&&env[variable]!==PROJECT)
      fail('Unexpected project reference environment override: '+variable);
  }
  const supabaseDir=join(base,'supabase');
  if(!lstatSync(supabaseDir).isDirectory()||
    realpathSync(supabaseDir)!==supabaseDir)
    fail('CLI supabase/ directory must be real, not symlinked');
  const configFile=realRegularFile(join(supabaseDir,'config.toml'));
  const config=readFileSync(configFile,'utf8');
  requiredSetting(config,'db.migrations','true');
  requiredSetting(config,'db.seed','false');
  const projectFile=realRegularFile(join(supabaseDir,'.temp/project-ref'));
  if(readFileSync(projectFile,'utf8').trim()!==PROJECT)
    fail('The linked CLI target is not the approved project');
  const migrationDir=join(supabaseDir,'migrations');
  if(!lstatSync(migrationDir).isDirectory()||
    realpathSync(migrationDir)!==migrationDir)
    fail('Migrations directory must be real and isolated');
  if(readdirSync(migrationDir).length!==0)
    fail('Isolated migrations directory must be completely empty before fetch');
  return Object.freeze({base,migrationDir,projectRef:PROJECT});
}

/** Only these hardcoded argv arrays can reach the real CLI. */
export const R18_READONLY_COMMANDS=Object.freeze([
  Object.freeze(['--version']),
  Object.freeze(['migration','fetch','--linked']),
  Object.freeze(['migration','list','--linked']),
  Object.freeze(['db','push','--dry-run','--linked'])
]);
function invokePinnedCli(args,base){
  const result=spawnSync('supabase',args,{
    cwd:base,encoding:'utf8',shell:false,
    timeout:120000,maxBuffer:200000,windowsHide:true,
    env:{...process.env,CI:'1',NO_COLOR:'1'}
  });
  if(result.error||result.status!==0)
    fail('Pinned Supabase CLI read-only command failed: '+args[0]);
  return {
    stdout:result.stdout??'',stderr:result.stderr??''
  };
}
function readFreshRows(path,root=ROOT){
  if(typeof path!=='string'||!path.trim())
    fail('A fresh read-only 83-row history digest JSON is required');
  const p=realRegularFile(resolve(path));
  if(isWithin(p,root))fail('Do not store fresh remote SQL hashes in repository');
  if(lstatSync(p).size>65000)fail('Remote history export exceeds safety limit');
  const parsed=JSON.parse(readFileSync(p,'utf8'));
  const rows=Array.isArray(parsed)?parsed:parsed?.rows;
  if(!Array.isArray(rows)||rows.length!==83)
    fail('Fresh history export must contain exactly 83 rows');
  return rows;
}

/**
 * Injection arguments exist solely so CI can exhaustively test the
 * command sequence without a real Supabase credential or network call.
 * Normal operator CLI uses the strict validators unmodified.
 */
export function rehearseR18LinkedCli({
  workspace,freshSqlHashes,env=process.env,
  invoke=invokePinnedCli,
  validateHistory=validateR18HistoryPayload,
  validateTranscript=validateR18CliTranscripts
}={}){
  const checked=inspectR18IsolatedWorkspace(workspace,{env});
  const freshPayload=readFreshRows(freshSqlHashes);
  const cli=(index)=>{
    const argv=R18_READONLY_COMMANDS[index];
    const response=invoke([...argv],checked.base);
    if(!response||typeof response.stdout!=='string'||
      typeof response.stderr!=='string')
      fail('Invalid CLI response for read-only command');
    return response.stdout+'\n'+response.stderr;
  };
  // No network command until target, config, history export and empty
  // workspace are locally validated.
  const cliVersion=cli(0).trim().split(/\r?\n/,1)[0];
  if(cliVersion!==VERSION)fail('Pinned CLI 2.81.3 is mandatory');
  cli(1); // migration fetch --linked; reads remote history, writes locally.
  // Copy only the reviewed frozen R05 file, refusing overwrite. The full
  // historical files must then pass all 83 source-content hash checks.
  copyFileSync(SOURCE,join(checked.migrationDir,TARGET),
    fsConstants.COPYFILE_EXCL);
  const history=validateHistory({
    workspace:checked.base,freshPayload,expectedProjectRef:PROJECT
  });
  if(history?.decision!=='DRY_RUN_ONLY'||
    history.safeToApply!==false||
    history.validatedRemoteSqlBodies!==83)
    fail('Independent 83-body history validation did not pass');
  const list=cli(2);
  const dry=cli(3); // The --dry-run flag is LITERAL, never caller-supplied.
  const transcript=validateTranscript({
    cliVersion:VERSION,migrationListOutput:list,dryRunOutput:dry
  });
  if(transcript?.decision!=='NO_GO'||transcript.safeToApply!==false||
    transcript.matchedRemoteRows!==83||
    transcript.expectedPendingMigrations?.length!==1||
    transcript.expectedPendingMigrations[0]!==TARGET)
    fail('CLI transcript gate failed to prove exactly one pending R05');
  return Object.freeze({
    decision:'NO_GO',safeToApply:false,sqlInstallationAuthorized:false,
    projectRef:PROJECT,cliVersion:VERSION,linkedCliCommandsRun:4,
    historicalSqlBodiesVerified:83,onlyPendingMigration:TARGET,
    cliReadOnlyRehearsalExecutedInThisProcess:true,
    authenticatedThreeBrowserAcceptanceProven:false,
    productionFrontendApproved:false,
    databaseInstallApproved:false
  });
}

function argument(name){
  const key='--'+name+'=';
  return process.argv.find(x=>x.startsWith(key))?.slice(key.length);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.filter(x=>x==='--run-readonly-linked-rehearsal').length!==1||
      process.argv.slice(2).some(x=>
        x!=='--run-readonly-linked-rehearsal'&&
        !x.startsWith('--workspace=')&&
        !x.startsWith('--fresh-sql-hashes=')))
      fail('Operator opt-in --run-readonly-linked-rehearsal is required');
    const result=rehearseR18LinkedCli({
      workspace:argument('workspace'),
      freshSqlHashes:argument('fresh-sql-hashes')
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){
    // Errors contain only our static gate names; suppress credentials and
    // raw CLI stdout/stderr, which the CLI may otherwise print in logs.
    process.stderr.write('R18-12 NO-GO: '+error.message+'\n');
    process.exitCode=1;
  }
}
