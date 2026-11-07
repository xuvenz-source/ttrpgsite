import {readAppStyles} from './readAppStyles.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {campaignPresenceKey,onlineMemberIds,chatRowsForMap} from '../src/CampaignRealtime.js';
import {CHAT_RECONCILE_MS,ROSTER_RECONCILE_MS} from '../src/PerformanceScheduling.js';

const main=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
const sidebar=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
const css=readAppStyles();

test('campaign-scoped presence keys are opaque, stable and never account IDs',async()=>{
 const camp='16268cf1-4653-4a26-990f-65e841e9e779';
 const id='44420415-9c97-4c43-bc1e-0ed906b6d0ef';
 const a=await campaignPresenceKey(camp,id);
 assert.match(a,/^[a-f0-9]{64}$/);
 assert.equal(a,await campaignPresenceKey(camp,id));
 assert.notEqual(a,id);
 assert.notEqual(a,await campaignPresenceKey('00000000-0000-4000-8000-000000000000',id));
 assert.equal(await campaignPresenceKey('',id),'');
});
test('online indicators are limited to campaign members',()=>{
 const members=[{user_id:'u1'},{user_id:'u2'}];
 const keys={u1:'safe_one',u2:'safe_two',outsider:'stranger'};
 assert.deepEqual(onlineMemberIds(members,keys,['safe_one','stranger']),['u1']);
 assert.deepEqual(onlineMemberIds(members,keys,[]),[]);
});
test('chat only renders the currently authorised map view',()=>{
 const rows=[{id:1,map_id:'map-a'}, {id:2,map_id:'map-b'},{id:3,map_id:null}];
 assert.deepEqual(chatRowsForMap(rows,'map-a').map(x=>x.id),[1]);
 assert.deepEqual(chatRowsForMap(rows,null).map(x=>x.id),[3]);
});
test('independent roster subscriptions refresh member, sheet and display name data',()=>{
 assert.ok(main.includes('async function refreshCampaignRoster()'));
 assert.ok(main.includes("db.from('campaign_members').select('user_id,role')"));
 assert.ok(main.includes("db.from('characters').select('*').eq('campaign_id',campaignId)"));
 assert.ok(main.includes('setMembers(roster);setCharacters(sheets);setAccountNames(names||[])'));
 assert.ok(main.includes("db.channel('vtt-roster-'+campaignId)"));
 assert.ok(main.includes("db.channel('vtt-presence-'+campaignId"));
 assert.ok(main.includes("channel.track({online:true})"));
 assert.ok(main.includes("Object.keys(channel.presenceState())"));
 assert.ok(main.includes("if(rightTab==='units')void refreshCampaignRoster()"));
 assert.ok(sidebar.includes('onlineMembers.includes(owner.user_id)'));
 assert.ok(sidebar.includes('unit-online-indicator'));
 assert.ok(css.includes('.unit-online-indicator{'));
});
test('chat has a stable realtime channel, reconnect refetch and periodic recovery',()=>{
 assert.ok(main.includes("db.channel('vtt-chat-'+campaignId)"));
 assert.ok(main.includes("table:'chat_messages'"));
 assert.ok(main.includes("if(status==='SUBSCRIBED')reconcile.refreshNow()"));
 assert.ok(main.includes("reconcile.setConnected(status==='SUBSCRIBED')"));
 assert.equal(CHAT_RECONCILE_MS.fallback,4000);
 assert.equal(CHAT_RECONCILE_MS.healthy,30000);
 assert.equal(ROSTER_RECONCILE_MS.fallback,8000);
 assert.equal(ROSTER_RECONCILE_MS.healthy,60000);
 assert.ok(main.includes('const request=++chatRequest.current'));
 assert.ok(main.includes('if(request===chatRequest.current)setMsgs(chatRowsForMap(rows,mapId))'));
 assert.ok(main.includes("document.addEventListener('visibilitychange',focus)"));
});
