import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manifest=()=>JSON.parse(get('staging/world-v2-b10-r18-117-tool-edit-invite-gates/manifest.json'));

function extract(sql,name){
 const matcher=new RegExp('\\bcreate\\s+or\\s+replace\\s+function\\s+public\\.'+name+'\\s*\\(','gi');
 const matches=[...sql.matchAll(matcher)];
 assert.equal(matches.length,1,name+' must have a unique definition');
 const tail=sql.slice(matches[0].index);
 const quoted=/\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;/i.exec(tail);
 assert.ok(quoted,name+' must be dollar-quoted');
 return quoted[2];
}
test('R117 source fingerprints match recorded read-only original catalog metadata',()=>{
 const m=manifest();
 const sql=get('supabase/migrations/20261107095343_campaign_tool_item_collaboration.sql');
 assert.equal(m.workPackage,'B10-R18-117');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.source.length,3);
 for(const f of m.source){
  const b=extract(sql,f.name);
  assert.equal(Buffer.byteLength(b,'utf8'),f.bytes,f.name);
  assert.equal(createHash('md5').update(b).digest('hex'),f.bodyMd5,f.name);
  assert.equal(f.liveMetadataFingerprintMatched,true);
  assert.equal(f.directLiveSqlBodyParityAttested,false);
 }
});
test('R117 records invitation ambiguity without granting signed-user release authority',()=>{
 const m=manifest();
 assert.equal(m.inviteLiveMetadata.length,2);
 assert.deepEqual(m.inviteLiveMetadata.map(x=>x.name),['create_campaign','join_campaign']);
 assert.equal(m.inviteLiveMetadata[1].bodyMd5,'9fd65eca8e3160acd7a674931aad51c5');
 assert.equal(m.inviteLiveMetadata[1].onConflictText,true);
 assert.ok(m.inviteLiveMetadata.every(x=>!x.sourceBodyInspected&&!x.realSignedTested));
 assert.ok(m.invitationRiskQuestions.some(x=>x.includes('unchanged invitation code')));
 assert.ok(Object.values(m.releaseGates).every(x=>x===false));
 assert.ok(Object.values(m.unchanged).every(x=>x===true));
});
test('R117 disposable tests explicitly cover tool state, revocation and denied direct table reads',()=>{
 const m=manifest(),sql=get('tests/world-v2-r18-117-postgres/verify-tool-edits.sql');
 assert.equal((sql.match(/-- R117_CASE \d{2} [A-Z0-9_]+/g)||[]).length,33);
 assert.equal(m.syntheticTests.toolEditReleaseScenarios,33);
 for(const str of ['REVOKED_P1_CANNOT_MUTATE_HELD_705','REVOKED_P1_CAN_RELEASE_OWN_705',
  'REVOKED_DM_CANNOT_MUTATE_HELD_701','REVOKED_DM_CAN_RELEASE_OWN_701',
  'P1_REJECT_FORGED_INVENTORY_ID','P2_CANNOT_RELEASE_P1_LEASE',
  'RESTORED_P1_CAN_MUTATE_AGAIN','CROSS_CAMPAIGN_DM_DENY_EDIT'])
   assert.ok(sql.includes(str),str);
 assert.ok(sql.includes('jsonb_array_length(bag)<>2'));
 const runner=get('tests/world-v2-r18-117-postgres/run.sh');
 for(const p of ['GITHUB_ACTIONS','R117_ISOLATED','127.0.0.1',
  'world_v2_r18_114','DATABASE_URL DIRECT_URL','bash tests/world-v2-r18-116-postgres/run.sh','R117 NO_GO'])
  assert.ok(runner.includes(p),p);
 assert.equal((runner.match(/deny "/g)||[]).length,5);
 assert.equal(m.syntheticTests.realInvitationsUsed,false);
 assert.equal(m.syntheticTests.private83HistoricalFilesRead,false);
});
test('R117 extractor refuses unreviewed Git drift and no hosted SQL command can run',()=>{
 const code=get('tests/world-v2-r18-117-postgres/extract-tool-source.py');
 assert.match(code,/hashlib\.md5/);
 assert.match(code,/if len\(raw\)!=size or hashlib\.md5\(raw\)\.hexdigest\(\)!=md5:fail\(\)/);
 assert.match(code,/world-v2-r18-117-/);
 assert.match(code,/public\.is_campaign_member\(target\.campaign_id\)/);
 assert.doesNotMatch(code,/\b(?:requests|urllib|subprocess|psycopg2|supabase\s+db)\b/);
 const runner=get('tests/world-v2-r18-117-postgres/run.sh');
 assert.doesNotMatch(runner,/\bsupabase\s+(?:db push|db reset|migration repair|link)\b/);
});
