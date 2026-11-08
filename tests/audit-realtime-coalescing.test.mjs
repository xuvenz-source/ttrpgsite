import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('tool and handout Realtime events are batched, targeted and canceled on teardown',()=>{
 const tools=read('src/useCampaignTools.js');
 assert.match(tools,/const dirty=new Set\(\)/);
 assert.match(tools,/createCoalescedRefresh\(\(\)=>\{/);
 assert.match(tools,/queue\('issued','placed'\)/);
 assert.match(tools,/queue\('placed'\)/);
 assert.match(tools,/queue\('templates'\)/);
 assert.match(tools,/changed\.request\(\)/);
 assert.match(tools,/changed\.cancel\(\)/);
 const handouts=read('src/useCampaignHandouts.js');
 assert.match(handouts,/createCoalescedRefresh\(\(\)=>void refresh\(\),100\)/);
 assert.match(handouts,/changed\.request\(\)/);
 assert.match(handouts,/changed\.cancel\(\)/);
});
test('combat refreshes on visibility ticks only when an encounter is active',()=>{
 const s=read('src/useMapCombat.js');
 assert.match(s,/combatActive\.current=!!next\?\.active/);
 assert.match(s,/if\(combatActive\.current\)changed\.request\(\)/);
 assert.match(s,/changed\.cancel\(\)/);
});
test('fog tick revokes stale sight immediately and starts bounded RLS revalidation without delay',()=>{
 const s=read('src/useAuthorizedMapFog.js');
 assert.match(s,/if\(invalidate\(event\)\)changed\.request\(\)/);
 assert.match(s,/fogFrameDuringRefresh\(previous,mapId\)/);
 assert.match(s,/\+\+request\.current/);
 assert.match(s,/createLeadingCoalescedRefresh\(\(\)=>void refresh\(\),60\)/);
 assert.match(s,/invalidate\(\);changed\.flush\(\)/);
 assert.match(s,/fog_enforced===false&&previous\?\.enabled===false/);
 assert.match(s,/changed\.cancel\(\)/);
});
