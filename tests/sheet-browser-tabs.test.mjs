import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const s=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
const e=readFileSync(new URL('../src/CharacterEditor.jsx',import.meta.url),'utf8');
test('characters can launch in standalone authenticated browser tabs',()=>{
 assert.ok(m.includes("url.searchParams.set('campaign',activeId)"));
 assert.ok(m.includes("url.searchParams.set('sheet',characterId)"));
 assert.ok(m.includes("window.open(url.toString(),'_blank','noopener,noreferrer')"));
 assert.ok(m.includes("fetchCampaigns(launchSheet?.campaignId)"));
});
test('Units and both player/DM sheet editors expose new tab actions',()=>{
 assert.ok(s.includes('onOpenCharacterTab(ch.id)'));
 assert.ok(e.includes('onOpenBrowserTab'));
 assert.ok(m.includes('else if(isDM)void openPlayerCharacter(row.id,null)'));
});