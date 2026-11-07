import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const s=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
const e=readFileSync(new URL('../src/CharacterEditor.jsx',import.meta.url),'utf8');
test('characters open a standalone authenticated popup window, not a normal tab',()=>{
 assert.ok(m.includes("url.searchParams.set('campaign',activeId)"));
 assert.ok(m.includes("url.searchParams.set('sheet',characterId)"));
 assert.ok(m.includes("'popup=yes,width=920,height=760,resizable=yes,scrollbars=yes'"))
 assert.match(m,/popup\.opener=null/);
 assert.ok(m.includes("(launchSheet?' sheet-popup-app':'')"));
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 assert.ok(css.includes('.app.sheet-popup-app>main>.workarea>.primary{display:contents!important}'));
 assert.ok(css.includes('.primary>:not(.floating-window.floating-sheet)'));
 assert.ok(m.includes("fetchCampaigns(launchSheet?.campaignId||launchNpc?.campaignId)"));
});
test('Units and both player/DM sheet editors expose popup actions',()=>{
 assert.ok(s.includes('onOpenCharacterTab(ch.id)'));
 assert.ok(s.includes('Open character sheet in separate window'));
 assert.ok(e.includes('onOpenBrowserTab'));
 assert.ok(m.includes('else if(isDM)void openPlayerCharacter(row.id,null)'));
});