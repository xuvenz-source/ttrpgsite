import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('memory candidate is staged without executing SQL migrations or runtime patches',()=>{
 const sql=read('staging/verification/nano-memory-preflight.sql');
 const script=read('scripts/supabase-nano-memory-trial.sh');
 const doc=read('docs/supabase-nano-memory-trial-2026-11-10.md');
 assert.match(sql,/pg_shmem_allocations/);
 assert.match(sql,/pg_stat_activity/);
 assert.match(sql,/pg_stat_database/);
 assert.doesNotMatch(sql,/\b(alter|update|delete|insert|truncate|drop|vacuum)\s+(system|role|database|table|policy|from|into)\b/i);
 assert.match(script,/--config shared_buffers=128MB/);
 assert.match(script,/TTRPG_NANO_RESTART_APPROVED/);
 assert.match(script,/TTRPG_NANO_OVERRIDE_BACKUP/);
 assert.match(script,/postgres-config get/);
 assert.match(script,/postgres-config delete/);
 assert.doesNotMatch(script,/--replace-existing-overrides|--no-restart/);
 assert.match(doc,/NOT APPLIED/);
 assert.match(doc,/deferred/);
});
test('memory configuration helper remains inert by default and rejects unapproved writes',()=>{
 const file=new URL('../scripts/supabase-nano-memory-trial.sh',import.meta.url).pathname;
 for(const args of [[],['help'],['--help']]){
  const done=spawnSync('bash',[file,...args],{encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(done.status,0);
  assert.match(done.stdout,/NOT part of automatic/);
 }
 for(const mode of ['apply','rollback']){
  const done=spawnSync('bash',[file,mode],{encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(done.status,3);
  assert.match(done.stderr,/Blocked: explicit/);
 }
});
