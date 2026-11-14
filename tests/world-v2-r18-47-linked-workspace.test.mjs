import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR47LinkedWorkspace} from '../scripts/release/validate-world-v2-r18-47-linked-workspace.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(join(root,'staging/world-v2-b10-r18-47-isolated-pending/manifest.json'),'utf8'));
const md5=s=>createHash('md5').update(s).digest('hex');
test('R18-47 synthetic remote SQL fixture only: exact 83 historical plus ten pending passes DRY_RUN_ONLY, rejects drift',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r47-synthetic-workspace-'));
 try{
  const mig=join(dir,'supabase/migrations');
  mkdirSync(mig,{recursive:true});
  mkdirSync(join(dir,'supabase/.temp'),{recursive:true});
  const rows=[];
  for(let i=0;i<83;i++){
   const version=i===82?'20261109171247':String(20261105000000+i);
   const name='synthetic_history_'+i;
   const source='SELECT '+i+';\n';
   const x={version,name,statement_count:1,fetched_sql_md5:md5(source)};
   rows.push(x);
   writeFileSync(join(mig,version+'_'+name+'.sql'),source);
  }
  const r05=manifest.originalR05.file;
  writeFileSync(join(mig,r05.split('/').at(-1)),readFileSync(join(root,r05)));
  for(const p of manifest.packages)
   writeFileSync(join(mig,p.filename),readFileSync(join(root,p.source)));
  writeFileSync(join(dir,'supabase/config.toml'),
   '[db.migrations]\nenabled = true\n\n[db.seed]\nenabled = false\n');
  writeFileSync(join(dir,'supabase/.temp/project-ref'),manifest.live.projectRef+'\n');
  const valid=()=>validateR47LinkedWorkspace({
   repoRoot:root,workspace:dir,freshSqlDigests:rows,
   hashBaseline:{rows},manifest});
  const result=valid();
  assert.deepEqual({d:result.decision,apply:result.safeToApply,remote:result.checkedRealRemoteBodies,
   pending:result.reviewedPending},
   {d:'DRY_RUN_ONLY',apply:false,remote:83,pending:10});
  assert.equal(result.actualLinkedCliDryRunPerformed,false);
  const historical=join(mig,rows[3].version+'_'+rows[3].name+'.sql');
  const original=readFileSync(historical);
  writeFileSync(historical,'SELECT 999;\n');
  assert.throws(valid,/R47 LINKED NO-GO: fetched SQL does not match live database/);
  writeFileSync(historical,original);
  const altered=rows.map(x=>({...x}));
  altered[17].fetched_sql_md5='0'.repeat(32);
  assert.throws(()=>validateR47LinkedWorkspace({
   repoRoot:root,workspace:dir,freshSqlDigests:altered,hashBaseline:{rows},manifest}),
   /R47 LINKED NO-GO: remote migration name\/version\/SQL digest drift/);
  const optional=join(mig,manifest.packages[4].filename);
  const optOriginal=readFileSync(optional);
  writeFileSync(optional,optOriginal+'-- modified');
  assert.throws(valid,/R47 LINKED NO-GO: pending official CLI file differs/);
  writeFileSync(optional,optOriginal);
  writeFileSync(join(dir,'supabase/config.toml'),
   '[db.migrations]\nenabled = false\n\n[db.seed]\nenabled = false\n');
  assert.throws(valid,/R47 LINKED NO-GO: unsafe migration or seed configuration/);
  writeFileSync(join(dir,'supabase/config.toml'),
   '[db.migrations]\nenabled = true\n\n[db.seed]\nenabled = false\n');
  writeFileSync(join(dir,'supabase/.temp/project-ref'),'another-project');
  assert.throws(valid,/R47 LINKED NO-GO: linked project ID differs/);
  writeFileSync(join(dir,'supabase/.temp/project-ref'),manifest.live.projectRef+'\n');
  assert.equal(valid().decision,'DRY_RUN_ONLY');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('R18-47 operator validator cannot perform a database push or forge approval',()=>{
 const source=readFileSync(join(root,'scripts/release/validate-world-v2-r18-47-linked-workspace.mjs'),'utf8');
 assert.match(source,/actualLinkedCliDryRunPerformed:false/);
 assert.match(source,/safeToApply:false/);
 assert.match(source,/normalRootPushSafe:false/);
 assert.match(source,/if\(entries\.length!==93/);
 assert.match(source,/validateR47OfflinePackage/);
 assert.doesNotMatch(source,/execSync|spawnSync|fetch\(|https\.request\(|createConnection\(|supabase\s+db\s+push\s+--linked/);
});
