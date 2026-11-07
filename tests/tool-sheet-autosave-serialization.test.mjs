import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sheet=readFileSync(new URL('../src/CampaignToolSheet.jsx',import.meta.url),'utf8');
test('tool metadata edits use a shared revision-aware serial writer',()=>{
 assert.match(sheet,/createDebouncedSerialWriter/);
 assert.match(sheet,/await writer\.current\.flush\(\)/);
 assert.match(sheet,/await collabRef\.current\.saveDetails/);
 assert.match(sheet,/if\(!dirty\.current\)/);
 assert.match(sheet,/if\(JSON\.stringify\(currentMeta\.current\)===JSON\.stringify\(job\.value\)\)/);
 assert.match(sheet,/Save failed — retry before closing/);
 assert.doesNotMatch(sheet,/metaSaving|setMetaSaving/);
});
