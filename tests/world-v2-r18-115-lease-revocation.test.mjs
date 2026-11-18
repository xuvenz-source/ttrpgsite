import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const historical=read('supabase/migrations/20261107095350_campaign_sheet_inventory_collaboration.sql');
const claimFix=read('supabase/migrations/20261108013000_inventory_lease_expiry_qualification.sql');
const candidate=read('staging/world-v2-b10-r18-115-revocation-guard/unapplied-campaign-membership-required.sql');
function exact(sql,name){
 const matches=[...sql.matchAll(new RegExp('\\bcreate\\s+or\\s+replace\\s+function\\s+public\\.'+
   name+'\\s*\\(','gi'))];
 assert.equal(matches.length,1,'exact function occurs once: '+name);
 const tail=sql.slice(matches[0].index);
 const quoted=/\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;/i.exec(tail);
 assert.ok(quoted,'dollar quoted body exists: '+name);
 return {ddl:tail.slice(0,quoted.index+quoted[0].length),body:quoted[2]};
}
const EXPECT=[
 ['can_edit_campaign_sheet','5a8fed2bdc8427c884f89440c0eebe03',790,historical],
 ['claim_campaign_sheet_item','d7932b1e0c2141833537301d75d262e4',1379,claimFix],
 ['release_campaign_sheet_item','f7bc314718884312ce3e1ca48331429f',271,historical],
 ['mutate_campaign_sheet_item','d2e4affcf04808423830f443ce93e530',2752,historical]
];
test('R115 source-backed baseline functions equal read-only live pg_proc MD5/bytes',()=>{
 for(const [name,hash,bytes,source] of EXPECT){
  const v=exact(source,name);
  assert.equal(Buffer.byteLength(v.body,'utf8'),bytes,name);
  assert.equal(createHash('md5').update(v.body,'utf8').digest('hex'),hash,name);
  assert.match(v.ddl,/SECURITY DEFINER/i);
  assert.match(v.ddl,/search_path=''/i);
 }
});
test('R115 claim RPC is taken from later applied lease-expiry patch, not stale migration',()=>{
 const older=exact(historical,'claim_campaign_sheet_item').body;
 const corrected=exact(claimFix,'claim_campaign_sheet_item').body;
 assert.notEqual(older,corrected);
 assert.equal(Buffer.byteLength(older,'utf8'),1340);
 assert.equal(Buffer.byteLength(corrected,'utf8'),1379);
 assert.match(corrected,/campaign_sheet_item_leases as lease/);
});
test('R115 membership candidate adds only one precondition while preserving helper source',()=>{
 const before=exact(historical,'can_edit_campaign_sheet').ddl;
 const after=exact(candidate,'can_edit_campaign_sheet').ddl;
 const old='if actor is null or p_campaign is null or p_source_id is null then return false;end if;';
 const replacement=[
  'if actor is null or p_campaign is null or p_source_id is null',
  '  or not exists(',
  '   select 1 from public.campaign_members m',
  '   where m.campaign_id=p_campaign and m.user_id=actor)',
  ' then return false;end if;'
 ].join('\n');
 assert.equal(before.split(old).length,2,'one old predicate');
 assert.equal(before.replace(old,replacement),after,'no other DDL change allowed');
 assert.match(candidate,/DO NOT APPLY TO ORIGINAL OR QA/);
 assert.match(candidate,/REVOKE ALL ON FUNCTION public.can_edit_campaign_sheet/);
 assert.doesNotMatch(candidate,/\bGRANT EXECUTE ON FUNCTION public\.can_edit_campaign_sheet/);
});
test('R115 interleaved lease, takeover, expiry and permission revocation scenarios are staged',()=>{
 const baseline=read('tests/world-v2-r18-115-postgres/verify-lease-and-revocation-baseline.sql');
 const fixed=read('tests/world-v2-r18-115-postgres/verify-revocation-candidate.sql');
 assert.equal((baseline.match(/-- R115 [A-Z][A-Z0-9_]+\nBEGIN;/g)||[]).length,23);
 for(const needle of ['P2_CANNOT_CLAIM_P1_ITEM',
  'DM_CANNOT_STEAL_P1_LEASE_WITHOUT_TAKEOVER',
  'DM_EXPLICIT_TAKEOVER_701',
  'P1_MUTATION_REJECTED_AFTER_TAKEOVER',
  'P1_TAKES_EXPIRED_702',
  'P1_EXPIRED_MUTATION_DENIED',
  'BASELINE_REVOKED_P1_CAN_STILL_CLAIM',
  'BASELINE_REVOKED_P1_CAN_STILL_PATCH',
  'BASELINE_REVOKED_P1_CAN_STILL_GET'])
  assert.match(baseline,new RegExp(needle));
 for(const s of ['revoked user claim allowed','revoked user inventory read allowed',
   'revoked user mutation allowed','revoked user sheet PATCH allowed',
   'revoked lease cleanup should remain permitted','restored player membership'])
  assert.ok(fixed.includes(s),s);
});
test('R115 only runs in disposable scratch PG17 and requires original-source reproduction before candidate',()=>{
 const runner=read('tests/world-v2-r18-115-postgres/run.sh');
 assert.match(runner,/world_v2_r18_114/);
 assert.match(runner,/R115_ISOLATED/);
 assert.match(runner,/R114_ISOLATED/);
 assert.match(runner,/127\.0\.0\.1/);
 assert.match(runner,/for envvar in DATABASE_URL DIRECT_URL/);
 const before=runner.indexOf('verify-lease-and-revocation-baseline.sql');
 const cand=runner.indexOf('unapplied-campaign-membership-required.sql');
 const after=runner.indexOf('verify-revocation-candidate.sql');
 assert.ok(before>0 && cand>before && after>cand);
 assert.match(runner,/R115 NO_GO/);
 const extractor=read('tests/world-v2-r18-115-postgres/extract-lease-source.py');
 assert.match(extractor,/hashlib.md5/);
 assert.match(extractor,/world-v2-r18-115-/);
 assert.doesNotMatch(extractor,/\b(?:requests|urllib|subprocess|psycopg2)\b/);
 assert.doesNotMatch(runner,/\bsupabase\s+(?:db|migration|link)\b/i);
});
