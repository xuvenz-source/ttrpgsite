import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const sidebar=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
const floating=readFileSync(new URL('../src/FloatingWindow.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/map-environment.css',import.meta.url),'utf8');
const urls=readFileSync(new URL('../src/SignedAssetUrls.js',import.meta.url),'utf8');

test('the same Board stays mounted across workspace tab changes',()=>{
 assert.ok(main.includes('<section className="panel tabletop-panel map-only-panel"'));
 assert.ok(main.includes("style={tab==='tabletop'||tab==='sheet'?undefined:{display:'none'}}"));
 assert.ok(main.includes("aria-hidden={tab!=='tabletop'&&tab!=='sheet'}"));
 assert.equal(main.includes("{(tab==='tabletop'||tab==='sheet')&&<section className=\"panel tabletop-panel map-only-panel\">"),false);
 assert.ok(main.includes("active={tab==='tabletop'||tab==='sheet'}"));
});
test('hiding the map cannot leave destructive keyboard shortcuts active',()=>{
 assert.ok(main.includes("if(!active||!isDM||!selectedId||e.key!=='Delete'"));
 assert.ok(main.includes("if(!active||event.key!=='Escape'||!activeMeasureTool)"));
 assert.ok(main.includes("lastCenteredMap.current===map.id"));
 assert.ok(main.includes("lastCenteredMap.current=map.id"));
});
test('map URLs remain identity-scoped and cached across tabs',()=>{
 assert.ok(main.includes("signedAssetStore.subscribe(db,'battlemap-assets'"));
 assert.ok(main.includes('},[maps,user]);'));
 assert.ok(urls.includes('if(e.url&&e.expires>now()+15000)notify(e.url)'));
 assert.ok(main.includes('setUrls(previous=>previous[m.id]===url?previous:'));
 assert.ok(urls.includes('if(event===')===false);
});
test('DM sidebar can pop out without duplicating its live editor',()=>{
 assert.ok(sidebar.includes('onPopOutMapSetting'));
 assert.ok(sidebar.includes('onDockMapSetting'));
 assert.ok(sidebar.includes('mapSettingPopped?<div'));
 assert.ok(main.includes('{isDM&&mapSettingPopped&&<FloatingWindow kind="mapsetting"'));
 assert.ok(main.includes('onClose={()=>{setMapSettingPopped(false);setRightTab(\'dm\')}'));
 assert.ok(main.includes('template={camp?.sheet_template} saveStatus={mapEnvironmentStatus} tokens={tokens}'));
 assert.ok(main.includes('setMapSettingPopped(false);setCamp(null)'));
 assert.ok(floating.includes('mapsetting:{width:365,height:560}'));
 assert.ok(css.includes('.floating-window.floating-mapsetting'));
 assert.ok(css.includes('.map-setting-pop-body'));
});
