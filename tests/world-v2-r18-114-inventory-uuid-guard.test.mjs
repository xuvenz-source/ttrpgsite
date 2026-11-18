import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const original=get('supabase/migrations/20261107095350_campaign_sheet_inventory_collaboration.sql');
const patch=get('staging/world-v2-b10-r18-114-inventory-uuid-guard/unapplied-inventory-uuid-five-segment-guard.sql');
const broken="'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'";
const corrected="'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'".replace(
 '}-[0-9a-fA-F]{12}', '}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}');
function extract(sql){
 const p=/\bcreate\s+or\s+replace\s+function\s+public\.get_campaign_sheet_inventory\s*\(/ig;
 const matches=[...sql.matchAll(p)];
 assert.equal(matches.length,1,'one and only one getter definition');
 const text=sql.slice(matches[0].index);
 const body=/\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;/i.exec(text);
 assert.ok(body,'dollar quoted function body required');
 return {ddl:text.slice(0,body.index+body[0].length),body:body[2]};
}
test('R114 original getter is SHA-bound and demonstrates missing UUID hyphen group',()=>{
 const v=extract(original);
 assert.equal(Buffer.byteLength(v.body,'utf8'),1950);
 assert.equal(createHash('sha256').update(v.body).digest('hex'),
  '4b168977eaa254f665fa1f26ed81d7296053bb988b991e60574c1610de0a879e');
 assert.equal(v.ddl.split(broken).length,2);
 assert.equal(v.ddl.includes(corrected),false);
 assert.equal(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
  '00000000-0000-4000-8000-000000000701'),false);
});
test('R114 candidate only changes 8-4-4-12 validation to 8-4-4-4-12',()=>{
 const before=extract(original).ddl,after=extract(patch).ddl;
 assert.equal(before.replace(broken,()=>corrected),after);
 assert.equal(after.split(corrected).length,2);
 assert.equal(after.includes(broken),false);
 assert.match(patch,/NOT A MIGRATION|REPAIR CANDIDATE/i);
 assert.match(patch,/REVOKE ALL ON FUNCTION public\.get_campaign_sheet_inventory/);
 assert.match(patch,/GRANT EXECUTE ON FUNCTION public\.get_campaign_sheet_inventory/);
 assert.equal(createHash('sha256').update(before).digest('hex')===
  createHash('sha256').update(after).digest('hex'),false);
});
test('R114 isolated workflow must prove baseline churn and subsequent candidate stability',()=>{
 const runner=get('tests/world-v2-r18-114-postgres/run.sh');
 const raw=runner.indexOf('verify-inventory-uuid-baseline.sql');
 const candidate=runner.indexOf('unapplied-inventory-uuid-five-segment-guard.sql');
 const verified=runner.indexOf('verify-inventory-uuid-candidate.sql');
 assert.ok(raw>0 && candidate>raw && verified>candidate);
 assert.match(get('tests/world-v2-r18-114-postgres/verify-inventory-uuid-baseline.sql'),
  /second_id=first_id/);
 assert.match(get('tests/world-v2-r18-114-postgres/verify-inventory-uuid-candidate.sql'),
  /first_id IS DISTINCT FROM second_id/);
 assert.match(runner,/R114 NO_GO/);
 assert.doesNotMatch(runner,/\bsupabase\s+(?:db|link|migration)/i);
});
