/**
 * R18-09. Validates captured Supabase CLI 2.81.3 read-only rehearsal text.
 * The validator NEVER executes a CLI command or authorizes SQL installation.
 * Its input is unauthenticated text, so success is NOT proof of a live run.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const snapshotFile=join(root,'staging/world-v2-b10-r18-07-live-migration-baseline.json');
const fail=msg=>{throw new Error(msg)};
const clean=s=>s.replace(/\x1b\[[0-9;]*m/g,'').replaceAll(String.fromCharCode(96),'').replace(/\r/g,'');
const target='20261111023204_world_v2_b10_integrated_motion.sql';

export function validateR18CliTranscripts({
  migrationListOutput,dryRunOutput,cliVersion,
  snapshot=JSON.parse(readFileSync(snapshotFile,'utf8'))
}={}){
  if(cliVersion!=='2.81.3')fail('Expected pinned CLI version 2.81.3');
  if(typeof migrationListOutput!=='string'||typeof dryRunOutput!=='string')
    fail('Two separately captured CLI outputs are required');
  if(migrationListOutput.length>200000||dryRunOutput.length>50000)
    fail('CLI capture exceeds safety limit');
  if(!Array.isArray(snapshot.applied)||snapshot.applied.length!==83||
    snapshot.expectedTargetVersion!=='20261111023204'||
    snapshot.targetFilename!==target)
    fail('Approved baseline does not match frozen R05 target');
  const expected=new Set(snapshot.applied.map(x=>x.version));
  if(expected.size!==83||expected.has(snapshot.expectedTargetVersion))
    fail('Invalid approved remote history');
  const parsed=[];
  let header=false;
  for(const rawLine of clean(migrationListOutput).split('\n')){
    const line=rawLine.trim();
    if(!line||!line.includes('|'))continue;
    // Strip only actual Markdown table edges, not a blank Local/Remote cell.
    const bits=rawLine.split('|');
    if(rawLine.trimStart().startsWith('|'))bits.shift();
    if(rawLine.trimEnd().endsWith('|'))bits.pop();
    const cells=bits.map(x=>x.trim());
    if(cells.length!==3)fail('Unexpected migration list table format');
    if(cells[0]==='Local'&&cells[1]==='Remote'){
      if(header)fail('Duplicate migration list header');
      header=true;continue;
    }
    if(cells.every(x=>/^[-+: ]+$/.test(x)))continue;
    if(!header||!cells[2])fail('Malformed migration list row');
    const [local,remote]=cells;
    if(!(local===''||/^\d{14}$/.test(local))||
       !(remote===''||/^\d{14}$/.test(remote))||
       (local===''&&remote===''))
      fail('Invalid migration version pair');
    parsed.push({local,remote});
  }
  if(!header||parsed.length!==84)
    fail('Expected 83 matched applied rows and one pending local row');
  const seen=new Set();
  let pending=0;
  for(const {local,remote} of parsed){
    if(local===snapshot.expectedTargetVersion&&remote===''){
      pending++;
      continue;
    }
    if(local!==remote||!expected.has(local)||seen.has(local))
      fail('Unapproved or mismatched migration list row');
    seen.add(local);
  }
  if(seen.size!==83||pending!==1)
    fail('Migration list does not prove exactly one R05 pending version');
  const text=clean(dryRunOutput);
  if(!/DRY RUN: migrations will \*not\* be pushed to the database\./.test(text))
    fail('Missing CLI dry-run safety marker');
  if(/Skipping migrations|Remote database is up to date|Would seed these files|Would create custom roles|Applying migration|Applied migration|Do you want to push|error:/i.test(text))
    fail('CLI dry run contains a forbidden or contradictory action');
  const lines=text.split('\n').map(x=>x.trim());
  const starts=lines.map((x,i)=>x==='Would push these migrations:'?i:-1).filter(x=>x>=0);
  if(starts.length!==1)fail('Expected exactly one pending migration block');
  const files=[];
  for(let i=starts[0]+1;i<lines.length;i++){
    const line=lines[i];
    if(!line)continue;
    const match=line.match(/^[•*]\s+(\d{14}_[A-Za-z0-9_-]+\.sql)$/);
    if(match){files.push(match[1]);continue}
    if(files.length>0&&/^Finished\s+supabase db push\./.test(line))break;
    fail('Unexpected CLI pending migration line');
  }
  if(files.length!==1||files[0]!==target)
    fail('CLI dry run must display precisely the reviewed R05 SQL filename');
  const allFiles=[...text.matchAll(/\b\d{14}_[A-Za-z0-9_-]+\.sql\b/g)].map(x=>x[0]);
  if(allFiles.length!==1||allFiles[0]!==target)
    fail('Unexpected SQL filename in combined CLI transcript');
  if(!/Finished\s+supabase db push\./.test(text))
    fail('Incomplete CLI dry-run capture');
  return Object.freeze({
    decision:'NO_GO',safeToApply:false,logOnly:true,
    expectedRemoteVersions:83,matchedRemoteRows:83,
    expectedPendingMigrations:[target],
    cliVersionClaim:cliVersion,
    actualLinkedCliExecutedByValidator:false,
    authenticatedRemoteExecutionProven:false,
    frontendCanaryVerified:false,sqlInstallationAuthorized:false
  });
}
const arg=name=>{
  const prefix='--'+name+'=';
  return process.argv.find(x=>x.startsWith(prefix))?.slice(prefix.length)??null;
};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const listFile=arg('migration-list-output');
    const pushFile=arg('dry-run-output');
    if(!listFile||!pushFile)fail('Supply both captured --migration-list-output and --dry-run-output paths');
    const result=validateR18CliTranscripts({
      migrationListOutput:readFileSync(resolve(listFile),'utf8'),
      dryRunOutput:readFileSync(resolve(pushFile),'utf8'),
      cliVersion:arg('cli-version')
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){
    process.stderr.write('NO-GO: '+error.message+'\n');
    process.exitCode=1;
  }
}
