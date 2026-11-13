import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,unlinkSync,symlinkSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectR49IsolatedFiles,validateR49LinkedWorkspace} from
 '../scripts/release/validate-world-v2-r18-49-linked-workspace.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(join(root,
 'staging/world-v2-b10-r18-48-narrow-pending/manifest.json'),'utf8'));
const hash=x=>createHash('md5').update(x).digest('hex');
const fixed='lwhwgqaunxbmvyndswze';
const config='[db.migrations]\nenabled = true\n[db.seed]\nenabled = false\n';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'r49-narrow-fixture-'));
 const migrations=join(dir,'supabase/migrations');
 mkdirSync(migrations,{recursive:true});
 mkdirSync(join(dir,'supabase/.temp'),{recursive:true});
 const rows=[];
 for(let i=0;i<83;i++){
  const version=i===82?'20261109171247':String(20261105000000+i);
  const name='synthetic_history_'+i;
  const body='SELECT '+i+';\n';
  const x={version,name,statement_count:1,fetched_sql_md5:hash(body)};
  rows.push(x);
  writeFileSync(join(migrations,version+'_'+name+'.sql'),body);
 }
 const r05='20261111023204_world_v2_b10_integrated_motion.sql';
 writeFileSync(join(migrations,r05),
  readFileSync(join(root,'supabase/migrations',r05)));
 for(const p of manifest.pending)
  writeFileSync(join(migrations,p.filename),
   readFileSync(join(root,manifest.stagedMigrationDirectory,p.filename)));
 writeFileSync(join(dir,'supabase/config.toml'),config);
 writeFileSync(join(dir,'supabase/.temp/project-ref'),fixed+'\n');
 const run=(overrides={})=>inspectR49IsolatedFiles({
  workspace:dir,repoRoot:root,historical:rows,
  freshSqlDigests:rows,manifest,...overrides});
 return {dir,migrations,rows,run};
}
test('R18-49 synthetic narrow 83+8 fixture: only 91 exact files can pass local inspection',()=>{
 const f=fixture();
 try{
  assert.deepEqual(f.run(),{historicalBodiesChecked:83,pendingChecked:8,
   totalFilesChecked:91,projectIdentityChecked:true});
  assert.throws(()=>validateR49LinkedWorkspace({workspace:f.dir,
   freshSqlDigests:f.rows,repoRoot:root}),
   /R49 LINKED NO-GO: fresh source SQL digest\/history drift/);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('R18-49 refuses changed history, duplicate versions, missing records or forged hashes',()=>{
 const f=fixture();
 try{
  const p=join(f.migrations,f.rows[0].version+'_'+f.rows[0].name+'.sql');
  writeFileSync(p,'SELECT changed;\n');
  assert.throws(f.run,/fetched historical SQL payload mismatch/);
  writeFileSync(p,'SELECT 0;\n');
  const forged=f.rows.map(x=>({...x}));
  forged[9].fetched_sql_md5='0'.repeat(32);
  assert.throws(()=>f.run({freshSqlDigests:forged}),/fresh source SQL digest\/history drift/);
  const duplicated=f.rows.map(x=>({...x}));
  duplicated[9].version=duplicated[8].version;
  assert.throws(()=>f.run({freshSqlDigests:duplicated}),/invalid or duplicate/);
  assert.throws(()=>f.run({freshSqlDigests:f.rows.slice(1)}),/exactly 83/);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('R18-49 rejects R18-26/27 insertion, altered R48 SQL, and absent/extra/symlinked files',()=>{
 const f=fixture();
 try{
  const file=join(f.migrations,manifest.pending[5].filename);
  const original=readFileSync(file);
  writeFileSync(file,original+'-- drift');
  assert.throws(f.run,/staged pending migration body differs/);
  writeFileSync(file,original);
  const extra=join(f.migrations,'20261113021015_r47_step_bbox_prefilter.sql');
  writeFileSync(extra,'select 1;');
  assert.throws(f.run,/unexpected\/missing migration file/);
  unlinkSync(extra);
  const missing=join(f.migrations,manifest.pending[2].filename);
  unlinkSync(missing);
  assert.throws(f.run,/ENOENT|staged pending migration body differs/);
  symlinkSync(join(root,manifest.stagedMigrationDirectory,manifest.pending[2].filename),missing);
  assert.throws(f.run,/symlink or nonregular file/);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('R18-49 stops on wrong project, seed/role side effects, and disjoint-workspace violation',()=>{
 const f=fixture();
 try{
  const conf=join(f.dir,'supabase/config.toml');
  writeFileSync(conf,'[db.migrations]\nenabled = true\n[db.seed]\nenabled = true\n');
  assert.throws(f.run,/unsafe db.seed.enabled/);
  writeFileSync(conf,config);
  writeFileSync(join(f.dir,'supabase/roles.sql'),'CREATE ROLE unexpected;');
  assert.throws(f.run,/additional roles\/seed SQL forbidden/);
  unlinkSync(join(f.dir,'supabase/roles.sql'));
  writeFileSync(join(f.dir,'supabase/.temp/project-ref'),'other-project');
  assert.throws(f.run,/linked project identity differs/);
  assert.throws(()=>f.run({projectRef:'other-project'}),/unexpected project identity/);
  assert.throws(()=>f.run({workspace:root}),/workspace and source checkout must be disjoint/);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('R18-49 never executes SQL, links, writes migration history or reports release approval',()=>{
 const s=readFileSync(join(root,
  'scripts/release/validate-world-v2-r18-49-linked-workspace.mjs'),'utf8');
 assert.match(s,/validateR48NarrowPackage/);
 assert.match(s,/const BASELINE='staging\/world-v2-b10-r18-08/);
 assert.match(s,/const R48='staging\/world-v2-b10-r18-48/);
 assert.match(s,/expected.size!==91/);
 assert.match(s,/safeToApply:false/);
 assert.match(s,/independentDmP1P2Accepted:false/);
 assert.match(s,/cliDryRunResultVerified:false/);
 assert.doesNotMatch(s,/execSync\(|spawnSync\(|child_process|fetch\(|http\.request\(|createConnection\(/);
});
