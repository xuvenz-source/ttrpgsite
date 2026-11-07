import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
test('new character sheet, map token, and DM edits refresh token monitors',()=>{
 assert.match(m,/setNewCharacterName\(''\);setSheetTab\('main'\);setSaveState\('Saved'\);setTab\('sheet'\);\s+void refreshMonitors\(\)/);
 assert.match(m,/await refreshTokens\(\);\s+await refreshMonitors\(\);\s+setSelectedTokenId\(created\.id\)/);
 assert.match(m,/function afterPlayerSheetSaved\(updated\)[\s\S]*?void refreshMonitors\(\)/);
});
test('map opens centred with small map CSS centering',()=>{
 assert.ok(css.includes('.mapscroll>.board-scroll-content{margin-inline:auto}'));
 assert.ok(m.includes('vp.scrollLeft=Math.max(0,(vp.scrollWidth-vp.clientWidth)/2)'));
 assert.ok(m.includes('vp.scrollTop=Math.max(0,(vp.scrollHeight-vp.clientHeight)/2)'));
});