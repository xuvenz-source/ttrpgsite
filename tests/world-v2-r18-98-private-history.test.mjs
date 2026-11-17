import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,
 rmSync,unlinkSync,symlinkSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 inspectR98PrivateHistory,validateR98Environment
} from '../scripts/release/validate-world-v2-r18-98-private-history.mjs';
import {
 R98_COMMANDS,runR98Command,captureR98History
} from '../scripts/release/run-world-v2-r18-98-private-history-fetch.mjs';
import {validateR98Source}
 from '../scripts/release/validate-world-v2-r18-98-source.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const json=p=>JSON.parse(readFileSync(join(ROOT,p),'utf8'));
const noGo=/R98 (?:PRIVATE HISTORY|PRIVATE FETCH|SOURCE) NO-GO/;
const ref='lwhwgqaunxbmvyndswze';
const qa='bgydsamxypjslergfpla';
const hash=x=>createHash('md5').update(x).digest('hex');

function fixture({withFiles=true}={}){
 const workspace=mkdtempSync(join(tmpdir(),'r98-private-'));
 const sb=join(workspace,'supabase'),dir=join(sb,'migrations');
 mkdirSync(dir,{recursive:true});
 mkdirSync(join(sb,'.temp'));
 writeFileSync(join(sb,'.temp','project-ref'),ref+'\n');
 writeFileSync(join(sb,'config.toml'),
  '[db.migrations]\nenabled = true\n[db.seed]\nenabled = false\n');
 const rows=[];
 for(let i=0;i<83;i++){
  const version=i===82?'20261109171247':
   '20261105'+String(i+1).padStart(6,'0');
  const name='synthetic_history_'+String(i).padStart(2,'0');
  const sql='-- synthetic, not real historical SQL\nselect '+i+';\n';
  rows.push({version,name,statement_count:1,fetched_sql_md5:hash(sql)});
  if(withFiles)writeFileSync(join(dir,version+'_'+name+'.sql'),sql);
 }
 return {workspace,dir,sb,rows,dispose:()=>rmSync(workspace,{recursive:true,force:true})};
}
const inspect=(f,options={})=>inspectR98PrivateHistory({
 workspace:f.workspace,repoRoot:ROOT,rows:f.rows,env:{},...options
});
test('R98 source-only receipt preserves original 83 hashes and no installation',()=>{
 const m=json('staging/world-v2-b10-r18-98-private-history/manifest.json');
 const x=validateR98Source(m);
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.originalSourceMd5RowsMatched,83);
 assert.equal(x.privateFetchRunnerStaged,true);
 assert.equal(x.historicalSqlBodiesRecoveredByChatGPT,false);
 assert.equal(x.qaBootstrapSqlApplied,false);
 assert.equal(x.productionReleaseAuthorized,false);
 assert.equal(m.source.rawSqlBodiesCommittedToGit,false);
 assert.equal(m.gates.operatorAuthenticatedCliFetchCompleted,false);
});
test('R98 rejects falsely completed remote fetch, SQL and release authority',()=>{
 const base=json('staging/world-v2-b10-r18-98-private-history/manifest.json');
 const bad=fn=>{const m=structuredClone(base);fn(m);
  assert.throws(()=>validateR98Source(m),/R98 SOURCE NO-GO/);};
 bad(m=>m.decision='GO');
 bad(m=>m.parentSha='0'.repeat(40));
 bad(m=>m.source.projectRef=qa);
 bad(m=>m.source.readOnlySqlBodyDigestsMatched=82);
 bad(m=>m.source.rawSqlBodiesCommittedToGit=true);
 bad(m=>m.qa.registeredMigrations=83);
 bad(m=>m.qa.migrationApplied=true);
 bad(m=>m.artifacts.importedCliVersion='latest');
 bad(m=>m.artifacts.allowedRemoteCommand='db push --linked');
 bad(m=>m.artifacts.historicalSqlBodyFilesInRepository=true);
 for(const name of Object.keys(base.gates))bad(m=>m.gates[name]=true);
 for(const name of Object.keys(base.unchanged))bad(m=>m.unchanged[name]=false);
});
test('R98 synthetic 83-file private source mirror matches exact bytes, always NO_GO',()=>{
 const f=fixture();
 try{
  const a=inspect(f);
  assert.equal(a.decision,'NO_GO');
  assert.equal(a.phase,'fetched');
  assert.equal(a.historicalFilesVerified,83);
  assert.equal(a.exactHistoricalBytesVerified,true);
  assert.match(a.aggregateSha256,/^[a-f0-9]{64}$/);
  assert.equal(a.reviewMarkerFiles,0);
  assert.equal(a.qaInstallApproved,false);
  assert.equal(a.releaseAuthorized,false);
 }finally{f.dispose();}
});
test('R98 empty pre-fetch is distinct from post-fetch and never fabricates recovered files',()=>{
 const f=fixture({withFiles:false});
 try{
  const before=inspect(f,{phase:'before'});
  assert.equal(before.recoveredHistoricalFiles,0);
  assert.equal(before.expectedHistoricalFiles,83);
  assert.throws(()=>inspect(f),/R98 PRIVATE HISTORY NO-GO/);
  writeFileSync(join(f.dir,'20261111023204_world_v2_b10_integrated_motion.sql'),'select 1;');
  assert.throws(()=>inspect(f,{phase:'before'}),/R98 PRIVATE HISTORY NO-GO/);
 }finally{f.dispose();}
});
test('R98 rejects tampered SQL, missing file, extra pending R05 and bad history metadata',()=>{
 const f=fixture();
 try{
  const file=f.rows[0].version+'_'+f.rows[0].name+'.sql';
  const p=join(f.dir,file);
  writeFileSync(p,'-- tampered\nselect 5;');
  assert.throws(()=>inspect(f),/R98 PRIVATE HISTORY NO-GO/);
  writeFileSync(p,'-- synthetic, not real historical SQL\nselect 0;\n');
  unlinkSync(p);
  assert.throws(()=>inspect(f),/R98 PRIVATE HISTORY NO-GO/);
  writeFileSync(p,'-- synthetic, not real historical SQL\nselect 0;\n');
  writeFileSync(join(f.dir,'20261111023204_world_v2_b10_integrated_motion.sql'),'select 1;');
  assert.throws(()=>inspect(f),/R98 PRIVATE HISTORY NO-GO/);
  unlinkSync(join(f.dir,'20261111023204_world_v2_b10_integrated_motion.sql'));
  assert.throws(()=>inspect(f,{rows:[...f.rows.slice(0,82),f.rows[0]]}),/R98 PRIVATE HISTORY NO-GO/);
  assert.throws(()=>inspect(f,{phase:'unknown'}),/R98 PRIVATE HISTORY NO-GO/);
 }finally{f.dispose();}
});
test('R98 rejects wrong source ref, seeds, symlinked SQL and symlinked workspace roots',()=>{
 const f=fixture();
 try{
  writeFileSync(join(f.sb,'.temp','project-ref'),qa);
  assert.throws(()=>inspect(f),/R98 PRIVATE HISTORY NO-GO/);
  writeFileSync(join(f.sb,'.temp','project-ref'),ref);
  writeFileSync(join(f.sb,'seed.sql'),'select 1;');
  assert.throws(()=>inspect(f),/R98 PRIVATE HISTORY NO-GO/);
  unlinkSync(join(f.sb,'seed.sql'));
  const file=f.rows[0].version+'_'+f.rows[0].name+'.sql',p=join(f.dir,file);
  unlinkSync(p);
  symlinkSync(join(f.dir,f.rows[1].version+'_'+f.rows[1].name+'.sql'),p);
  assert.throws(()=>inspect(f),/R98 PRIVATE HISTORY NO-GO/);
  unlinkSync(p);
  writeFileSync(p,'-- synthetic, not real historical SQL\nselect 0;\n');
  const link=f.workspace+'-shortcut';
  symlinkSync(f.workspace,link,'dir');
  try{assert.throws(()=>inspect(f,{workspace:link}),/R98 PRIVATE HISTORY NO-GO/);}
  finally{unlinkSync(link);}
  writeFileSync(join(f.sb,'config.toml'),
   '[db.migrations]\nenabled = true\n[db.seed]\nenabled = true\n');
  assert.throws(()=>inspect(f),/R98 PRIVATE HISTORY NO-GO/);
 }finally{f.dispose();}
});
test('R98 rejects production/QA override URLs, auto-yes and CI leakage',()=>{
 for(const env of [
  {DATABASE_URL:'postgres://private'}, {PGHOST:'127.0.0.1'},
  {SUPABASE_PROJECT_ID:qa},{PROJECT_ID:qa},{SUPABASE_YES:'true'},
  {GITHUB_ACTIONS:'true'},{CI:'true'},{VERCEL:'1'}
 ])assert.throws(()=>validateR98Environment(env),/R98 PRIVATE HISTORY NO-GO/);
 assert.doesNotThrow(()=>validateR98Environment({SUPABASE_PROJECT_ID:ref}));
});
test('R98 command allowlist contains only pinned help, version and source fetch',()=>{
 assert.deepEqual(R98_COMMANDS,[
  ['--version'],['migration','fetch','--help'],['migration','fetch','--linked']
 ]);
 assert.throws(()=>runR98Command({
  binary:'x',args:['db','push','--linked','--dry-run'],
  cwd:'/private',env:{},runner:()=>({status:0,stdout:'',stderr:''})
 }),/R98 PRIVATE FETCH NO-GO/);
 assert.throws(()=>runR98Command({
  binary:'x',args:['migration','repair','--linked'],
  cwd:'/private',env:{},runner:()=>({status:0,stdout:'',stderr:''})
 }),/R98 PRIVATE FETCH NO-GO/);
 const output=runR98Command({
  binary:'mock',args:R98_COMMANDS[2],cwd:'/private',env:{},
  runner:()=>({status:0,stdout:'SUPPRESSED SQL',stderr:'SUPPRESSED KEY'})
 });
 assert.deepEqual(output,{ok:true,outputDiscarded:true});
});
test('R98 synthetic operator runner performs only 3 whitelisted commands, never SQL push',()=>{
 const commands=[];
 const runner=(_binary,args,_options)=>{
  commands.push(args.join(' '));
  if(args.join(' ')==='--version')return {status:0,stdout:'2.81.3\n',stderr:''};
  if(args.join(' ')==='migration fetch --help')return {
   status:0,stdout:'Usage:\n  supabase migration fetch [flags]\n --linked  From linked project\n',stderr:''
  };
  return {status:0,stdout:'PRIVATE HISTORY BODY',stderr:''};
 };
 const inspector=({phase})=>phase==='before'?
  {decision:'NO_GO',originalRefVerified:true,recoveredHistoricalFiles:0}:
  {decision:'NO_GO',originalRefVerified:true,historicalFilesVerified:83,
   exactHistoricalBytesVerified:true,releaseAuthorized:false,
   reviewMarkerFiles:1,aggregateSha256:'f'.repeat(64)};
 const result=captureR98History({
  workspace:'/private',binary:'mock',env:{},runner,inspector
 });
 assert.deepEqual(commands,['--version','migration fetch --help','migration fetch --linked']);
 assert.equal(result.decision,'NO_GO');
 assert.equal(result.historicalSqlFilesLocallyVerified,83);
 assert.equal(result.qaSchemaModified,false);
 assert.equal(result.productionSchemaModified,false);
 assert.equal(result.installApproved,false);
 assert.equal(result.productionReleaseAuthorized,false);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE HISTORY BODY/);
 assert.throws(()=>captureR98History({workspace:'/private',binary:'mock',env:{},
  inspector,runner:(_bin,args)=>args[0]==='--version'?
   {status:0,stdout:'3.0.0\n',stderr:''}:runner(_bin,args)}),
  /R98 PRIVATE FETCH NO-GO/);
});
test('R98 source-only CI remains offline and 184th ledger branch still NO_GO',()=>{
 const runner=readFileSync(join(ROOT,
  'scripts/release/run-world-v2-r18-98-private-history-fetch.mjs'),'utf8');
 const verifier=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-98-source.mjs'),'utf8');
 assert.doesNotMatch(verifier,/\b(?:fetch|spawn|apply_migration|writeFileSync)\s*\(/);
 assert.match(runner,/migration','fetch','--linked/);
 const l=json('staging/next-release-ledger.json');
 assert.equal(l.branches.length,186);
 assert.equal(l.branches.at(-4).linkedPullRequest,199);
 assert.equal(l.branches.at(-3).linkedPullRequest,200);
 assert.equal(l.branches.at(-3).releaseReady,false);
 assert.equal(l.releasePrivateHistoryRecovery.decision,'NO_GO');
 assert.equal(l.releasePrivateHistoryRecovery.originalHistoryMatched,83);
 assert.equal(l.releasePrivateHistoryRecovery.originalSqlBodiesRecovered,false);
 assert.equal(l.releasePrivateHistoryRecovery.qaRegisteredMigrations,0);
 assert.equal(l.releasePrivateHistoryRecovery.productionReleaseAuthorized,false);
 assert.equal(l.upcomingRelease.outstandingBranches.length,121);
});
