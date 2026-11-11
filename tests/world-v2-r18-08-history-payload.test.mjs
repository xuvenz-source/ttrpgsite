
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,symlinkSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {validateR18HistoryPayload}
 from '../scripts/release/validate-world-v2-r18-08-history-payload.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const snapshot=JSON.parse(readFileSync(join(root,
 'staging/world-v2-b10-r18-07-live-migration-baseline.json'),'utf8'));
const baseline=JSON.parse(readFileSync(join(root,
 'staging/world-v2-b10-r18-08-remote-history-content-hashes.json'),'utf8'));
const reviewed=readFileSync(join(root,
 'supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql'),'utf8');
const md5=data=>createHash('md5').update(data).digest('hex');

function fixture(callback){
 const dir=mkdtempSync(join(tmpdir(),'r18-08-hashed-cli-'));
 const folder=join(dir,'supabase/migrations');
 mkdirSync(folder,{recursive:true});
 mkdirSync(join(dir,'supabase/.temp'),{recursive:true});
 writeFileSync(join(dir,'supabase/.temp/project-ref'),'lwhwgqaunxbmvyndswze\n');
 writeFileSync(join(dir,'supabase/config.toml'),
  'project_id = "ttrpgsite-test-release"\n[db.migrations]\nenabled = true\n[db.seed]\nenabled = false\n');
 const data=snapshot.applied.map(x=>{
  const body='-- fetched remote history '+x.version+'\nSELECT 1;\n';
  writeFileSync(join(folder,x.version+'_'+x.name+'.sql'),body);
  return {...x,statement_count:1,fetched_sql_md5:md5(Buffer.from(body))};
 });
 writeFileSync(join(folder,snapshot.targetFilename),reviewed);
 const hashBaseline={...baseline,rows:data.map(x=>({...x}))};
 const invoke=(override={})=>validateR18HistoryPayload({
  workspace:dir,freshPayload:data,hashBaseline,...override
 });
 try{return callback({dir,folder,data,hashBaseline,invoke})}
 finally{rmSync(dir,{recursive:true,force:true})}
}

test('R18-08 source-real remote digest snapshot contains no SQL and exactly 83 unique versions',()=>{
 assert.equal(baseline.originalMigrationVersionCount,83);
 assert.equal(baseline.rows.length,83);
 assert.equal(new Set(baseline.rows.map(x=>x.version)).size,83);
 assert.ok(baseline.rows.every(x=>
  x.statement_count>=1&&/^[0-9a-f]{32}$/.test(x.fetched_sql_md5)));
 assert.equal(baseline.rows.at(-1).version,'20261109171247');
 assert.equal(baseline.targetVersionAbsent,true);
 assert.equal(baseline.rows.some(x=>x.version===snapshot.expectedTargetVersion),false);
 assert.equal(baseline.rows.some(x=>Object.hasOwn(x,'statements')),false);
});

test('R18-08 accepts only an offline 83-SQL-file digest match and explicit CLI config',()=>{
 fixture(({invoke})=>{
  const report=invoke();
  assert.equal(report.decision,'DRY_RUN_ONLY');
  assert.equal(report.safeToApply,false);
  assert.equal(report.validatedRemoteSqlBodies,83);
  assert.equal(report.migrationsEnabled,true);
  assert.equal(report.seedingDisabled,true);
  assert.equal(report.linkedProjectMatches,true);
  assert.equal(report.actualCliDryRunPerformed,false);
 });
});

test('R18-08 same historical version but tampered file bytes fails',()=>{
 fixture(({folder,data,invoke})=>{
  const x=data[0];
  writeFileSync(join(folder,x.version+'_'+x.name+'.sql'),
   '-- fetched remote history '+x.version+'\nSELECT 2;\n');
  assert.throws(()=>invoke(),/Fetched historical SQL differs/);
 });
});

test('R18-08 rejects a live digest drift even when all versions match',()=>{
 fixture(({data,invoke})=>{
  const changed=data.map(x=>({...x}));
  changed[1].fetched_sql_md5='f'.repeat(32);
  assert.throws(()=>invoke({freshPayload:changed}),/Fresh SQL fingerprint drift/);
 });
});

test('R18-08 detects changed statement count even when SQL bytes match',()=>{
 fixture(({data,invoke})=>{
  const changed=data.map(x=>({...x}));
  changed[1].statement_count=2;
  assert.throws(()=>invoke({freshPayload:changed}),/Fresh SQL fingerprint drift/);
 });
});

test('R18-08 missing or duplicate fresh body manifest fails closed',()=>{
 fixture(({data,invoke})=>{
  assert.throws(()=>invoke({freshPayload:data.slice(1)}),/fresh 83-row/);
  const duplicates=data.map(x=>({...x}));duplicates[1]=duplicates[0];
  assert.throws(()=>invoke({freshPayload:duplicates}),
   /Unexpected or duplicate fresh SQL fingerprint/);
 });
});

test('R18-08 workspace must explicitly enable CLI migrations',()=>{
 fixture(({dir,invoke})=>{
  writeFileSync(join(dir,'supabase/config.toml'),
   '[db.migrations]\nenabled = false\n[db.seed]\nenabled = false\n');
  assert.throws(()=>invoke(),/\[db.migrations\] enabled must explicitly be true/);
 });
});

test('R18-08 seeds must explicitly be disabled',()=>{
 fixture(({dir,invoke})=>{
  writeFileSync(join(dir,'supabase/config.toml'),
   '[db.migrations]\nenabled = true\n[db.seed]\nenabled = true\n');
  assert.throws(()=>invoke(),/\[db.seed\] enabled must explicitly be false/);
 });
});

test('R18-08 duplicated migration config section is invalid',()=>{
 fixture(({dir,invoke})=>{
  writeFileSync(join(dir,'supabase/config.toml'),
   '[db.migrations]\nenabled = true\n[db.seed]\nenabled = false\n[db.migrations]\nenabled = true\n');
  assert.throws(()=>invoke(),/Missing or duplicated \[db.migrations\]/);
 });
});

test('R18-08 the linked target must be the existing production Supabase project',()=>{
 fixture(({dir,invoke})=>{
  writeFileSync(join(dir,'supabase/.temp/project-ref'),'aaaaaaaaaaaaaaaaaaaa\n');
  assert.throws(()=>invoke(),/Linked CLI project does not match/);
 });
});

test('R18-08 symlinked project reference and config fail closed',()=>{
 fixture(({dir,invoke})=>{
  const ref=join(dir,'supabase/.temp/project-ref');
  const config=join(dir,'supabase/config.toml');
  const realRef=join(dir,'supabase/.temp/real-ref');
  writeFileSync(realRef,'lwhwgqaunxbmvyndswze');
  rmSync(ref);symlinkSync(realRef,ref);
  assert.throws(()=>invoke(),/Linked CLI project does not match/);
  rmSync(ref);writeFileSync(ref,'lwhwgqaunxbmvyndswze');
  const realConfig=join(dir,'supabase/real-config.toml');
  writeFileSync(realConfig,readFileSync(config));
  rmSync(config);symlinkSync(realConfig,config);
  assert.throws(()=>invoke(),/config.toml must be a real file/);
 });
});

test('R18-08 an unexpected CLI project env override fails closed',()=>{
 fixture(({invoke})=>{
  const before=process.env.PROJECT_ID;
  try{
   process.env.PROJECT_ID='wrong-project';
   assert.throws(()=>invoke(),/Unexpected CLI project override/);
  }finally{
   if(before===undefined)delete process.env.PROJECT_ID;
   else process.env.PROJECT_ID=before;
  }
 });
});

test('R18-08 direct script cannot execute SQL or invoke deployment and remains NO-GO',()=>{
 const source=readFileSync(join(root,
  'scripts/release/validate-world-v2-r18-08-history-payload.mjs'),'utf8');
 assert.doesNotMatch(source,/child_process|spawnSync|execSync|applyMigration\(|fetch\(/);
 assert.match(source,/safeToApply:false/);
 assert.match(source,/actualCliDryRunPerformed:false/);
 assert.match(source,/fetched_sql_md5/);
});
