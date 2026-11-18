import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join,relative,extname} from 'node:path';

const ROOT=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(join(ROOT,path),'utf8');
const walk=(base,acc=[])=>{
 for(const e of readdirSync(base,{withFileTypes:true})){
  const p=join(base,e.name);
  if(e.isDirectory())walk(p,acc);
  else if(e.isFile()&&['.js','.jsx','.mjs','.ts','.tsx'].includes(extname(e.name)))acc.push(p);
 }
 return acc;
};
const all=[...walk(join(ROOT,'src')),...walk(join(ROOT,'supabase','functions'))];
const rootEntry=read('src/TabletopApp.jsx');
const prototype=read('staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql');
const concurrent=read('tests/world-v2-r18-121-postgres/run.sh');
const cascade=read('tests/world-v2-r18-121-postgres/campaign-cascade.sql');

test('R121 traverses app + Edge source and fails if direct membership writes bypass reviewed RPC',()=>{
 assert.ok(all.length>100,'expected complete JS/TS app and Edge sources');
 const memberReferences=[];
 const directMutation=[];
 for(const path of all){
  const src=readFileSync(path,'utf8');
  if(src.includes('campaign_members'))memberReferences.push(relative(ROOT,path));
  const direct=/\.from\s*\(\s*['"\x60]campaign_members['"\x60]\s*\)\s*\.\s*(?:delete|insert|update|upsert)\s*\(/g;
  if(direct.test(src))directMutation.push(relative(ROOT,path));
 }
 assert.deepEqual(directMutation,[],
  'a client direct campaign_members write must not bypass R120 revocation control review');
 assert.ok(memberReferences.includes('src/TabletopApp.jsx'));
 // Current root entry exposes create/join but no DM removal or reinstatement.
 // A later controlled UI integration PR is expected to update this assertion.
 assert.doesNotMatch(rootEntry,/dm_remove_campaign_player|dm_reinstate_campaign_player|leave_campaign/);
 assert.match(rootEntry,/db\.rpc\('create_campaign'/);
 assert.match(rootEntry,/db\.rpc\('join_campaign'/);
 console.log('R121 SOURCE INVENTORY: scanned '+all.length+
  ' app/Edge JS/TS files; '+memberReferences.length+
  ' reference campaign_members; no direct member writes found in immediate .from().write() pattern.');
});
test('R121 scratch trigger preserves FK cascade and ordinary member revocation',()=>{
 assert.match(prototype,/CREATE TRIGGER v2_campaign_member_delete_tombstone/);
 assert.match(prototype,/PERFORM 1 FROM public\.campaigns AS c\s+WHERE c\.id=OLD\.campaign_id FOR UPDATE/);
 assert.match(prototype,/IF NOT FOUND THEN[\s\S]{0,700}RETURN OLD;/);
 assert.match(prototype,/INSERT INTO forge_security\.campaign_member_revocations/);
 assert.match(prototype,/CREATE TRIGGER v2_campaign_member_insert_revocation_gate/);
 assert.match(prototype,/RAISE EXCEPTION 'DM reinstatement required'/);
 assert.match(cascade,/DELETE FROM public\.campaigns WHERE id=/);
 assert.match(cascade,/cascade left invalid revocations/);
});
test('R121 two independent SQL sessions synchronize and bound rollback and cascade checks',()=>{
 for(const pattern of [
  /wait_marker "remove-ready"/,
  /wait_marker "join-ready"/,
  /dm_remove_campaign_player/,
  /public\.join_campaign/,
  /rollback left a ghost revocation/,
  /cascade retained tombstones/,
  /SET LOCAL statement_timeout='8s'/,
  /R121 NO_GO/
 ])assert.match(concurrent,pattern);
 assert.match(concurrent,/GITHUB_ACTIONS/);
 assert.match(concurrent,/R121_ISOLATED/);
 assert.match(concurrent,/127\.0\.0\.1/);
 assert.match(concurrent,/for key in DATABASE_URL DIRECT_URL SUPABASE_URL/);
 assert.doesNotMatch(concurrent,/\bsupabase\s+(?:db push|migration apply|db reset)\b/i);
});
