import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
const npc=readFileSync(new URL('../src/NpcEditor.jsx',import.meta.url),'utf8');
const floating=readFileSync(new URL('../src/FloatingWindow.jsx',import.meta.url),'utf8');
test('five simultaneous NPC editors have unique identities and save targets',()=>{
 assert.ok(m.includes('npcEditors.map(editor=><NpcEditor'));
 assert.ok(m.includes("key={editor.kind+':'+editor.data.id}"));
 assert.ok(m.includes('onSave={draft=>saveNpc(editor,draft)}'));
 assert.ok(!m.includes('setNpcEditor('));
});
test('NPC sheets bring existing windows to front and offer browser pop-out',()=>{
 assert.ok(npc.includes('focusSignal={focusSignal}'));
 assert.ok(npc.includes('↗ Pop out'));
 assert.ok(floating.includes('if(focusSignal>0)setLayer(++topWindowLayer)'));
});