import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('tool and handout Realtime burst callbacks are coalesced and canceled on teardown',()=>{
 for(const file of ['src/useCampaignTools.js','src/useCampaignHandouts.js']){
  const s=read(file);
  assert.match(s,/createCoalescedRefresh\(\(\)=>void refresh\(\),100\)/);
  assert.match(s,/changed\.request\(\)/);
  assert.match(s,/changed\.cancel\(\)/);
 }
});
test('combat refreshes on visibility ticks only when an encounter is active',()=>{
 const s=read('src/useMapCombat.js');
 assert.match(s,/combatActive\.current=!!next\?\.active/);
 assert.match(s,/if\(combatActive\.current\)changed\.request\(\)/);
 assert.match(s,/changed\.cancel\(\)/);
});
test('fog tick invalidates player visibility immediately while batching authorized fetches',()=>{
 const s=read('src/useAuthorizedMapFog.js');
 assert.match(s,/setFrame\(null\);changed\.request\(\)/);
 assert.match(s,/createCoalescedRefresh\(\(\)=>void refresh\(\),60\)/);
 assert.match(s,/setFrame\(null\);changed\.flush\(\)/);
 assert.match(s,/changed\.cancel\(\)/);
});
