import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const get=path=>readFileSync(new URL(path,root),'utf8');
const manifest=()=>JSON.parse(get('staging/world-v2-b10-r18-116-npc-tool-revocation/manifest.json'));

test('R116 pins exact tool claim and NPC reader catalog identity; preserves NO_GO',()=>{
 const m=manifest();
 assert.equal(m.workPackage,'B10-R18-116');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.originalRegisteredMigrations,83);
 assert.equal(m.qaRegisteredMigrations,0);
 assert.equal(m.sourceAnchors.length,2);
 assert.equal(m.sourceAnchors[0].bodyBytes,1693);
 assert.equal(m.sourceAnchors[0].bodyMd5,'570c89cc5b88bc739c56825eeb227449');
 assert.equal(m.sourceAnchors[0].directLiveBodyParityAttested,false);
 assert.equal(m.sourceAnchors[1].bodyBytes,263);
 assert.equal(m.sourceAnchors[1].bodySha256,'5e5c0657353a54f4812ee5b547e4575bf666f2e8c72a3fe1b6918cfff8293de5');
 assert.equal(m.sourceAnchors[1].directLiveBodyParityAttested,true);
 assert.ok(Object.values(m.releaseGates).every(x=>x===false));
 assert.equal(m.sourceOnly,true);
 assert.equal(m.qaSqlModified,false);
 assert.equal(m.originalSqlModified,false);
 assert.equal(m.noPaidInfrastructure,true);
});
test('R116 exact Git extractor checks both source fingerprint forms and never connects to providers',()=>{
 const x=get('tests/world-v2-r18-116-postgres/extract-source.py');
 assert.match(x,/hashlib\.sha256/);
 assert.match(x,/hashlib\.md5/);
 assert.match(x,/body_tool/);
 assert.match(x,/checkedByDirectLiveBodyEquality/);
 assert.match(x,/world-v2-r18-116-/);
 assert.match(x,/public\.is_campaign_member\(target\.campaign_id\)/);
 assert.match(x,/public\.is_campaign_dm\(m\.campaign_id\)/);
 assert.doesNotMatch(x,/\b(?:requests|urllib|subprocess|psycopg2|supabase\s+db)\b/);
});
test('R116 real role and source-bound fixture includes 28 revocation scenarios',()=>{
 const m=manifest();
 const sql=get('tests/world-v2-r18-116-postgres/verify-tool-npc-revocation.sql');
 assert.equal((sql.match(/-- R116_CASE \d{2} [A-Z0-9_]+/g)||[]).length,28);
 assert.equal(m.testFixture.scenarioCount,28);
 for(const required of [
  'DM_A_ONLY_OWN_NPC','DM_B_DENIED_FOREIGN_NPC',
  'REMOVED_DM_NPC_READ_REVOKED','REMOVED_DM_CANNOT_REFRESH_TOOL',
  'REVOKED_OWNER_DENIED_OWN_TOOL','REVOKED_MEMBER_DENIED_SHARED_TOOL',
  'REVOKED_SHARED_TOOL_OWNER_DENIED','RESTORED_SHARED_TOOL_OWNER_CAN_CREATE_ITEM'
 ])assert.ok(sql.includes(required),required);
 assert.match(sql,/CROSS_CAMPAIGN_SENTINEL|R116 SOURCE-EXACT TOOL\/NPC/);
 assert.match(get('tests/world-v2-r18-116-postgres/run.sh'),/anon-npc-reader/);
 assert.match(get('tests/world-v2-r18-116-postgres/run.sh'),/anon-tool-claim/);
 assert.match(get('tests/world-v2-r18-116-postgres/run.sh'),/auth-tool-lease-update/);
 assert.equal(m.testFixture.signedHostedSessionsTested,false);
 assert.equal(m.testFixture.syntheticIsCampaignMember,true);
 assert.equal(m.testFixture.trueParallelTransactionStress,false);
});
test('R116 runner must be disposable PG17 and run previous R115 fixture first',()=>{
 const run=get('tests/world-v2-r18-116-postgres/run.sh');
 assert.match(run,/GITHUB_ACTIONS/);
 assert.match(run,/R116_ISOLATED/);
 assert.match(run,/R115_ISOLATED/);
 assert.match(run,/R114_ISOLATED/);
 assert.match(run,/127\.0\.0\.1/);
 assert.match(run,/DATABASE_URL DIRECT_URL SUPABASE_DB_URL/);
 assert.match(run,/bash tests\/world-v2-r18-115-postgres\/run\.sh/);
 assert.match(run,/R116 NO_GO/);
 assert.doesNotMatch(run,/\bsupabase\s+(?:link|db push|db reset|migration repair)\b/i);
});
