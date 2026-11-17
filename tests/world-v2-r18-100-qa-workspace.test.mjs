import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,
 rmSync,unlinkSync,symlinkSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {inspectR100QaWorkspace,checkR100Environment}
 from '../scripts/release/validate-world-v2-r18-100-qa-workspace.mjs';
import {runR100Cli,previewR100QaOnly}
 from '../scripts/release/run-world-v2-r18-100-qa-dry-run.mjs';
import {validateR100Source}
 from '../scripts/release/validate-world-v2-r18-100-source.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const original='lwhwgqaunxbmvyndswze';
const qa='bgydsamxypjslergfpla';
const hash=(algorithm,contents)=>createHash(algorithm).update(contents).digest('hex');
const read=p=>JSON.parse(readFileSync(join(ROOT,p),'utf8'));
function synthetic(){
 const sourceWorkspace=mkdtempSync(join(tmpdir(),'r100-source-'));
 const qaWorkspace=mkdtempSync(join(tmpdir(),'r100-qa-'));
 for(const [root,ref] of [[sourceWorkspace,original],[qaWorkspace,qa]]){
  const sb=join(root,'supabase');
  mkdirSync(join(sb,'migrations'),{recursive:true});
  mkdirSync(join(sb,'.temp'));
  writeFileSync(join(sb,'.temp','project-ref'),ref+'\n');
  writeFileSync(join(sb,'config.toml'),
   '[db.migrations]\nenabled = true\n[db.seed]\nenabled = false\n');
 }
 const rows=[];
 for(let i=0;i<83;i++){
  const version=i===82?'20261109171247':
   '20261105'+String(i+1).padStart(6,'0');
  const name='r100_synthetic_'+String(i).padStart(3,'0');
  const sql='-- synthetic QA-only fixture\nselect '+i+';\n';
  const filename=version+'_'+name+'.sql';
  rows.push({version,name,statement_count:1,fetched_sql_md5:hash('md5',sql)});
  for(const root of [sourceWorkspace,qaWorkspace])
   writeFileSync(join(root,'supabase','migrations',filename),sql);
 }
 const verifier=()=>({
  decision:'NO_GO',historicalFilesCrossChecked:83,
  privateBodyFingerprintMatch:true,operatorCaptureMatchedPrivateBytes:true,
  operatorSessionAuthenticatedIndependently:false,
  qaSqlApplied:false,productionReleaseAuthorized:false
 });
 const inspect=(overrides={})=>inspectR100QaWorkspace({
  sourceWorkspace,qaWorkspace,capture:{synthetic:true},
  rows,repoRoot:ROOT,env:{},verifyCapture:verifier,...overrides
 });
 return {sourceWorkspace,qaWorkspace,rows,inspect,dispose:()=>{
  rmSync(sourceWorkspace,{recursive:true,force:true});
  rmSync(qaWorkspace,{recursive:true,force:true});
 }};
}
test('R100 source-only receipt never claims actual operator fetch, QA dry-run or installation',()=>{
 const m=read('staging/world-v2-b10-r18-100-qa-only-preflight/manifest.json');
 const x=validateR100Source(m);
 assert.equal(x.workPackage,'B10-R18-100');
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.sourceHistoryCount,83);
 assert.equal(x.qaHistoryCount,0);
 assert.equal(x.privateHistoricalRecoveryPerformed,false);
 assert.equal(x.qaDryRunPerformed,false);
 assert.equal(x.qaSqlApplied,false);
 assert.equal(x.productionReleaseAuthorized,false);
});
test('R100 rejects inaccurate source, target, paid-resource or approval metadata',()=>{
 const raw=read('staging/world-v2-b10-r18-100-qa-only-preflight/manifest.json');
 const invalid=alter=>{const m=structuredClone(raw);alter(m);
  assert.throws(()=>validateR100Source(m),/R100 SOURCE NO-GO/);};
 invalid(m=>m.parentSha='0'.repeat(40));
 invalid(m=>m.decision='GO');
 invalid(m=>m.original.projectRef=m.qa.projectRef);
 invalid(m=>m.original.sourceBodiesRecoveredByOperator=true);
 invalid(m=>m.qa.registeredMigrations=83);
 invalid(m=>m.qa.publicApplicationTables=1);
 invalid(m=>m.artifacts.allowedDryRunCommand='db push --linked');
 invalid(m=>m.artifacts.pendingSqlFilesExcluded=7);
 for(const key of Object.keys(raw.gates))invalid(m=>m.gates[key]=true);
 for(const key of Object.keys(raw.unchanged))invalid(m=>m.unchanged[key]=false);
 invalid(m=>m.artifacts.unknown='secret');
});
test('R100 verifies all 83 QA-only mirror SQL bytes against original source and historical MD5',()=>{
 const f=synthetic();try{
  const result=f.inspect();
  assert.equal(result.decision,'NO_GO');
  assert.equal(result.qaProjectRef,qa);
  assert.equal(result.qaFilesMatchingPrivateOriginal,83);
  assert.equal(result.qaFilesSourceExact,true);
  assert.equal(result.qaLinkedRefVerified,true);
  assert.match(result.qaHistoryMirrorFingerprintSha256,/^[0-9a-f]{64}$/);
  assert.equal(result.qaOnlyDryRunPerformed,false);
  assert.equal(result.historicalSqlSecurityReviewed,false);
  assert.equal(result.qaSchemaApplied,false);
  assert.equal(result.productionReleaseAuthorized,false);
 }finally{f.dispose();}
});
test('R100 rejects missing/extra/mutated pending SQL and original SHA mismatch',()=>{
 const f=synthetic();try{
  const row=f.rows[0],name=row.version+'_'+row.name+'.sql';
  const qf=join(f.qaWorkspace,'supabase','migrations',name);
  writeFileSync(qf,'select 12345;\n');
  assert.throws(()=>f.inspect(),/R100 QA WORKSPACE NO-GO/);
  writeFileSync(qf,'-- synthetic QA-only fixture\nselect 0;\n');
  const sf=join(f.sourceWorkspace,'supabase','migrations',name);
  writeFileSync(sf,'select 99999;\n');
  assert.throws(()=>f.inspect(),/R100 QA WORKSPACE NO-GO/);
  writeFileSync(sf,'-- synthetic QA-only fixture\nselect 0;\n');
  unlinkSync(qf);
  assert.throws(()=>f.inspect(),/R100 QA WORKSPACE NO-GO/);
  writeFileSync(qf,'-- synthetic QA-only fixture\nselect 0;\n');
  const extra=join(f.qaWorkspace,'supabase','migrations',
    '20261111023204_world_v2_b10_integrated_motion.sql');
  writeFileSync(extra,'select 1;\n');
  assert.throws(()=>f.inspect(),/R100 QA WORKSPACE NO-GO/);
 }finally{f.dispose();}
});
test('R100 hard-blocks original database references in QA SQL even if SHA is internally consistent',()=>{
 const f=synthetic();try{
  const row=f.rows[0],name=row.version+'_'+row.name+'.sql';
  const sql='-- references '+original+'\nselect 0;\n';
  f.rows[0].fetched_sql_md5=hash('md5',sql);
  for(const root of [f.sourceWorkspace,f.qaWorkspace])
   writeFileSync(join(root,'supabase','migrations',name),sql);
  assert.throws(()=>f.inspect(),/R100 QA WORKSPACE NO-GO/);
 }finally{f.dispose();}
});
test('R100 rejects wrong linked target, active seed, embedded env and symlinked workspace/file',()=>{
 const f=synthetic();try{
  const sb=join(f.qaWorkspace,'supabase');
  const project=join(sb,'.temp','project-ref');
  writeFileSync(project,original+'\n');
  assert.throws(()=>f.inspect(),/R100 QA WORKSPACE NO-GO/);
  writeFileSync(project,qa+'\n');
  writeFileSync(join(sb,'config.toml'),
    '[db.migrations]\nenabled = true\n[db.seed]\nenabled = true\n');
  assert.throws(()=>f.inspect(),/R100 QA WORKSPACE NO-GO/);
  writeFileSync(join(sb,'config.toml'),
    '[db.migrations]\nenabled = true\n[db.seed]\nenabled = false\n');
  writeFileSync(join(sb,'seed.sql'),'select 1;\n');
  assert.throws(()=>f.inspect(),/R100 QA WORKSPACE NO-GO/);
  unlinkSync(join(sb,'seed.sql'));
  writeFileSync(join(sb,'.env'),'SECRET=unsafe');
  assert.throws(()=>f.inspect(),/R100 QA WORKSPACE NO-GO/);
  unlinkSync(join(sb,'.env'));
  const row=f.rows[0],name=row.version+'_'+row.name+'.sql';
  const qf=join(sb,'migrations',name);
  unlinkSync(qf);
  symlinkSync(join(f.sourceWorkspace,'supabase','migrations',name),qf);
  assert.throws(()=>f.inspect(),/R100 QA WORKSPACE NO-GO/);
  unlinkSync(qf);
  writeFileSync(qf,'-- synthetic QA-only fixture\nselect 0;\n');
  const link=f.qaWorkspace+'-alias';
  symlinkSync(f.qaWorkspace,link,'dir');
  try{assert.throws(()=>f.inspect({qaWorkspace:link}),/R100 QA WORKSPACE NO-GO/);}
  finally{unlinkSync(link);}
 }finally{f.dispose();}
});
test('R100 rejects overlap with repository, QA source, and unverified R99 capture',()=>{
 const f=synthetic();try{
  assert.throws(()=>f.inspect({qaWorkspace:f.sourceWorkspace}),/R100 QA WORKSPACE NO-GO/);
  assert.throws(()=>f.inspect({qaWorkspace:ROOT}),/R100 QA WORKSPACE NO-GO/);
  assert.throws(()=>f.inspect({verifyCapture:()=>({
   decision:'NO_GO',historicalFilesCrossChecked:83,privateBodyFingerprintMatch:true,
   operatorCaptureMatchedPrivateBytes:true,operatorSessionAuthenticatedIndependently:true,
   qaSqlApplied:false,productionReleaseAuthorized:false
  })}),/R100 QA WORKSPACE NO-GO/);
 }finally{f.dispose();}
});
test('R100 private QA preflight disallows database overrides, CI and unattended confirmation',()=>{
 const invalid=[
  {DATABASE_URL:'postgres://danger'}, {PGHOST:'127.0.0.1'},
  {PGPORT:'5432'},{SUPABASE_PROJECT_ID:qa},{SUPABASE_PROJECT_ID:original},
  {PROJECT_ID:qa},{SUPABASE_YES:'true'},
  {CI:'true'},{GITHUB_ACTIONS:'true'},{VERCEL:'1'}
 ];
 for(const env of invalid)
  assert.throws(()=>checkR100Environment(env),/R100 QA WORKSPACE NO-GO/);
 assert.doesNotThrow(()=>checkR100Environment({}));
});
test('R100 dry-run helper only permits pinned CLI help and db push with BOTH safe flags',()=>{
 const executor=()=>({status:0,stdout:'safe',stderr:''});
 for(const args of [
  ['db','push','--linked'],['db','push','--dry-run'],
  ['db','push','--include-seed','--dry-run','--linked'],
  ['db','reset'],['migration','repair','--linked'],
  ['db','push','--dry-run','--linked','--yes']
 ])assert.throws(()=>runR100Cli({binary:'mock',cwd:'/private',
   args,env:{},runner:executor}),/R100 QA DRY RUN NO-GO/);
 const result=runR100Cli({binary:'mock',cwd:'/private',
  args:['db','push','--dry-run','--linked'],env:{},
  runner:()=>({status:0,stdout:'sql or private target',stderr:'password'})});
 assert.deepEqual(result,{completed:true,outputDiscarded:true});
});
test('R100 synthetic preview executes only CLI version, help and guarded dry run, always NO_GO',()=>{
 const calls=[];
 const runner=(_binary,args)=>{
  const cmd=args.join(' ');
  calls.push(cmd);
  if(cmd==='--version')return {status:0,stdout:'2.81.3\n',stderr:''};
  if(cmd==='db push --help')return {
   status:0,stdout:'supabase db push --dry-run --linked\n',stderr:''
  };
  return {status:0,stdout:'PRIVATE_MIGRATIONS',stderr:'PRIVATE_SOURCE'};
 };
 const checker=()=>({decision:'NO_GO',qaFilesMatchingPrivateOriginal:83,
  qaFilesSourceExact:true,qaLinkedRefVerified:true,qaProjectRef:qa,
  historicalSqlSecurityReviewed:false,
  operatorSessionIndependentlyAuthenticated:false,
  qaOnlyDryRunPerformed:false,qaSchemaApplied:false,productionReleaseAuthorized:false});
 const result=previewR100QaOnly({
  qaWorkspace:'/private-qa',sourceWorkspace:'/private-source',
  capture:{},binary:'mock',env:{},checker,runner
 });
 assert.deepEqual(calls,['--version','db push --help','db push --dry-run --linked']);
 assert.equal(result.decision,'NO_GO');
 assert.equal(result.dryRunCliReturnedSuccess,true);
 assert.equal(result.qaSchemaApplied,false);
 assert.equal(result.productionReleaseAuthorized,false);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
 assert.throws(()=>previewR100QaOnly({
  qaWorkspace:'/private-qa',sourceWorkspace:'/private-source',
  capture:{},binary:'mock',env:{},checker,
  runner:(b,args)=>args[0]==='--version'?
   {status:0,stdout:'3.0.0\n',stderr:''}:runner(b,args)
 }),/R100 QA DRY RUN NO-GO/);
});
test('R100 static source remains NO_GO and ledger retains original QA isolation',()=>{
 const source=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-100-source.mjs'),'utf8');
 const offline=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-100-qa-workspace.mjs'),'utf8');
 assert.doesNotMatch(source,/\b(?:fetch|spawn|execSync|writeFileSync)\s*\(/);
 assert.doesNotMatch(offline,/\b(?:fetch|spawn|execSync|writeFileSync)\s*\(/);
 const ledger=read('staging/next-release-ledger.json');
 assert.equal(ledger.branches.length,190);
 assert.equal(ledger.branches.at(-6).linkedPullRequest,201);
 assert.equal(ledger.branches.at(-5).linkedPullRequest,202);
 assert.equal(ledger.branches.at(-5).releaseReady,false);
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,125);
 assert.equal(ledger.releaseQaOnlyBaselinePreflight.decision,'NO_GO');
 assert.equal(ledger.releaseQaOnlyBaselinePreflight.qaRegisteredMigrations,0);
 assert.equal(ledger.releaseQaOnlyBaselinePreflight.qaDryRunExecuted,false);
 assert.equal(ledger.releaseQaOnlyBaselinePreflight.productionReleaseAuthorized,false);
});
