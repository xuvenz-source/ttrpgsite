import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
test('tabletop controller uses one isolated campaign presence hook',()=>{
 const app=get('TabletopApp.jsx'),hook=get('useCampaignPresence.js');
 assert.match(app,/const onlineMembers=useCampaignPresence\(/);
 assert.doesNotMatch(app,/db\.channel\('vtt-presence-/);
 assert.match(hook,/db\.channel\('vtt-presence-'\+campaignId/);
 assert.match(hook,/campaignPresenceKey\(campaignId,userId\)/);
 assert.match(hook,/void rosterRefreshRef\.current\?\.\(\)/);
 assert.match(hook,/if\(channel\)void db\.removeChannel\(channel\)/);
 assert.match(hook,/return onlineMemberIds\(members,memberPresenceHashes,onlinePresenceKeys\)/);
});
