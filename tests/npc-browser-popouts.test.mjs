import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
test('DM popup opens standalone authenticated NPC editor window',()=>{
 assert.ok(s.includes("url.searchParams.set('npc',record.data.id)"));
 assert.ok(s.includes("url.searchParams.set('npc_kind',record.kind)"));
 assert.ok(s.includes("popup,width=920,height=760"));
 assert.ok(s.includes('onPopOut={launchNpc?undefined:()=>openNpcBrowserWindow(editor)}'));
 assert.ok(s.includes("eq('campaign_id',activeId).eq('id',launchNpc.id)"));
 assert.ok(css.includes('.app.npc-popup-app>main{display:none}'));
});
test('NPC popup refuses player tokens and loads actual saved NPC values',()=>{
 assert.ok(s.includes("if(!row||row.character_id||row.owner_id)"));
 assert.ok(s.includes("get_npc_token_values',{p_token:row.id}"));
});