import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const quick=readFileSync(new URL('../src/TokenQuickEdit.jsx',import.meta.url),'utf8');
const section=readFileSync(new URL('../src/QuickStatusControls.jsx',import.meta.url),'utf8');
test('Ctrl+click Quick Adjust contains editable status effects',()=>{
 assert.ok(quick.includes('<QuickStatusControls'));
 assert.ok(quick.includes('onApplyStatuses(token,statusValues)'));
 assert.ok(quick.includes('if(!changes.length&&!statusChanged)return'));
 assert.ok(quick.includes('disabled={changes.length===0&&!statusChanged}'));
});
test('status chips can add, remove, or change stack level',()=>{
 assert.ok(section.includes('allStatusDefinitions(catalog)'));
 assert.ok(section.includes('onClick={()=>change(effect.id,0)}'));
 assert.ok(section.includes('onChange={e=>change(effect.id,Math.max'));
 assert.ok(section.includes('onChange={e=>{if(e.target.value)change(e.target.value,1)}'));
});
