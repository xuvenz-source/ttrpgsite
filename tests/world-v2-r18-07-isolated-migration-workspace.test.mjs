import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync,symlinkSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {
 gitBlobSha,validateR18ReleaseWorkspace
} from '../scripts/release/validate-world-v2-r18-07-workspace.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const baseline=JSON.parse(readFileSync(join(root,
 'staging/world-v2-b10-r18-07-live-migration-baseline.json'),'utf8'));
const reviewed=readFileSync(join(root,
 'supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql'),'utf8');
const target=baseline.targetFilename;

function fixture(fn){
 const workspace=mkdtempSync(join(tmpdir(),'world-v2-r18-07-'));
 const folder=join(workspace,'supabase/migrations');
 mkdirSync(folder,{recursive:true});
 for(const x of baseline.applied){
  writeFileSync(join(folder,x.version+'_'+x.name+'.sql'),
   '-- FETCHED historical version '+x.version+'\nSELECT 1;\n');
 }
 writeFileSync(join(folder,target),reviewed);
 const rows=baseline.applied.map(x=>({...x}));
 try{return fn({workspace,folder,rows})}
 finally{rmSync(workspace,{recursive:true,force:true})}
}

test('R18-07 only one reviewed R05 pending after all 83 remote historical versions',()=>{
 fixture(({workspace,folder,rows})=>{
  const result=validateR18ReleaseWorkspace({workspace,
   freshHistory:{migrations:rows}});
  assert.equal(result.decision,'DRY_RUN_ONLY');
  assert.equal(result.safeToApply,false);
  assert.equal(result.snapshotMigrationCount,83);
  assert.equal(result.exactHistory,true);
  assert.deepEqual(result.expectedPendingMigrations,[target]);
  assert.equal(result.targetGitBlobSha,baseline.targetGitBlobSha);
  assert.equal(readdirSync(folder).length,84);
  assert.equal(gitBlobSha(reviewed),baseline.targetGitBlobSha);
 });
});

test('R18-07 cannot silently omit remotely applied history',()=>{
 fixture(({workspace,folder,rows})=>{
  const first=baseline.applied[0];
  rmSync(join(folder,first.version+'_'+first.name+'.sql'));
  assert.throws(()=>validateR18ReleaseWorkspace({workspace,freshHistory:rows}),
   /exactly 83 fetched remote migrations plus R05/);
 });
});

test('R18-07 extra local migration is a hard stop, not a bulk push',()=>{
 fixture(({workspace,folder,rows})=>{
  writeFileSync(join(folder,'20261111023500_unreviewed.sql'),'SELECT 1;\n');
  assert.throws(()=>validateR18ReleaseWorkspace({workspace,freshHistory:rows}),
   /exactly 83 fetched remote migrations plus R05/);
 });
});

test('R18-07 altered SQL cannot be accidentally applied as reviewed migration',()=>{
 fixture(({workspace,folder,rows})=>{
  writeFileSync(join(folder,target),reviewed+'\n-- unexpected drift\n');
  assert.throws(()=>validateR18ReleaseWorkspace({workspace,freshHistory:rows}),
   /does not match reviewed Git blob/);
 });
});

test('R18-07 changed live remote migration version refuses the workspace',()=>{
 fixture(({workspace,rows})=>{
  rows[0].version='20261111000000';
  assert.throws(()=>validateR18ReleaseWorkspace({workspace,freshHistory:rows}),
   /Remote history drift/);
 });
});

test('R18-07 changed remote migration name refuses the workspace',()=>{
 fixture(({workspace,rows})=>{
  rows[0].name='unexpected_new_name';
  assert.throws(()=>validateR18ReleaseWorkspace({workspace,freshHistory:rows}),
   /Remote history drift/);
 });
});

test('R18-07 must be given a fresh history export, not rely on stale baseline',()=>{
 fixture(({workspace})=>{
  assert.throws(()=>validateR18ReleaseWorkspace({workspace}),
   /fresh read-only remote history/);
 });
});

test('R18-07 rejects empty/synthetic remote migration placeholders',()=>{
 fixture(({workspace,folder,rows})=>{
  const first=baseline.applied[0];
  writeFileSync(join(folder,first.version+'_'+first.name+'.sql'),
   '-- applied remotely\n');
  assert.throws(()=>validateR18ReleaseWorkspace({workspace,freshHistory:rows}),
   /contains a placeholder/);
 });
});

test('R18-07 rejects non-SQL files and symbolic links in release migration folder',()=>{
 fixture(({workspace,folder,rows})=>{
  writeFileSync(join(folder,'readme.txt'),'nope');
  assert.throws(()=>validateR18ReleaseWorkspace({workspace,freshHistory:rows}),
   /Unexpected non-SQL/);
  rmSync(join(folder,'readme.txt'));
  symlinkSync(join(folder,target),join(folder,'20261111023400_link.sql'));
  assert.throws(()=>validateR18ReleaseWorkspace({workspace,freshHistory:rows}),
   /Unexpected non-SQL/);
 });
});

test('R18-07 repo root cannot be mistaken for isolated release workspace',()=>{
 assert.throws(()=>validateR18ReleaseWorkspace({
  workspace:root,freshHistory:baseline.applied
 }),/outside repository checkout/);
});

test('R18-07 historical name collision cannot override reviewed target',()=>{
 fixture(({workspace,rows})=>{
  rows[0].version=baseline.expectedTargetVersion;
  assert.throws(()=>validateR18ReleaseWorkspace({workspace,freshHistory:rows}),
   /Remote history drift|R05 target already exists/);
 });
});

test('R18-07 runnable script never executes SQL, repairs history or authenticates to remote',()=>{
 const src=readFileSync(join(root,
  'scripts/release/validate-world-v2-r18-07-workspace.mjs'),'utf8');
 assert.doesNotMatch(src,/\b(?:child_process|execSync|spawnSync|fetch\(|axios\.|applyMigration\()/);
 assert.match(src,/safeToApply:false/);
 assert.match(src,/DRY_RUN_ONLY/);
 const migrationList=baseline.applied.map(x=>x.version);
 assert.equal(new Set(migrationList).size,83);
 assert.equal(baseline.counts.localMigrationFiles,56);
 assert.equal(baseline.counts.localUniqueVersions,55);
 assert.equal(baseline.counts.remoteNotInLocal,63);
});
