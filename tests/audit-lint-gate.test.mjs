import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('CI gates static undefined-identifier checks in changed interactive source',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const ci=readFileSync(new URL('../.github/workflows/verify-staged.yml',import.meta.url),'utf8');
 const config=readFileSync(new URL('../eslint.config.mjs',import.meta.url),'utf8');
 assert.equal(pkg.scripts['lint:critical'],'eslint');
 assert.match(ci,/npm run lint:critical/);
 assert.match(config,/'no-undef':'error'/);
 for(const file of ['CharacterEditor.jsx','InventoryItemEditor.jsx','CampaignToolSheet.jsx'])
  assert.ok(config.includes(file));
});
