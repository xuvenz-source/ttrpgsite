import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const side=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
test('map routing has persistent per-campaign realtime notifications',()=>{
 assert.ok(main.includes("db.channel('vtt-routing-'+activeId"));
 assert.ok(main.includes("event:'routing-changed'"));
 assert.ok(main.includes("if(status==='SUBSCRIBED'&&!isDM)"));
 assert.ok(main.includes("},[db,activeId,user,isDM]"));
});
test('players refetch RLS-backed current map, never accept broadcast identifiers',()=>{
 assert.ok(main.includes("async function refreshPlayerMapRouting()"));
 assert.ok(main.includes(".eq('user_id',user).maybeSingle()"));
 assert.ok(main.includes("setSelectedMap(old=>old===visible?old:visible)"));
 assert.ok(!main.includes("notifyMapRouting({mapId:"));
});
test('DM has individual, party default and move-all controls',()=>{
 assert.ok(main.includes("notifyMapRouting({targetId:memberId})"));
 assert.ok(main.includes("notifyMapRouting({kind:'party'})"));
 assert.ok(main.includes("move_entire_party_to_map"));
 assert.ok(side.includes("Move entire party here"));
});