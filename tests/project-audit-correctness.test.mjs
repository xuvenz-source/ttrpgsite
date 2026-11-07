import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('DM character pop-out flushes the autosave queue and never references missing state setters',()=>{
 const s=get('src/CharacterEditor.jsx');
 assert.match(s,/onClick=\{async\(\)=>\{[\s\S]*?await flush\(\)/);
 assert.doesNotMatch(s,/\bif\(changed\)/);
 assert.doesNotMatch(s,/\bsetError\(/);
});
test('inventory item editor awaits save acknowledgements, with visible retry on failure',()=>{
 const s=get('src/InventoryItemEditor.jsx');
 assert.match(s,/await onSave\(next,\{keepOpen:true\}\)/);
 assert.match(s,/const write=writing\.current\.catch\(\(\)=>\{\}\)\.then/);
 assert.match(s,/if\(!await persist\(\)\)return;/);
 assert.match(s,/Save failed — retry before closing/);
 assert.doesNotMatch(s,/saved\.current=JSON\.stringify\(next\);/);
});
test('collaboration item changes produce awaitable write acknowledgements',()=>{
 for(const path of ['src/useCampaignSheetInventory.js','src/useCampaignToolCollaboration.js'])
  assert.match(get(path),/return Promise\.all\(changes\.map\(item=>mutate\(/,path);
 const panel=get('src/InventoryPanel.jsx');
 assert.match(panel,/const operation=onChange\(next\)/);
 assert.match(panel,/const write=applyItems\(/);
 assert.match(panel,/return write;/);
});
