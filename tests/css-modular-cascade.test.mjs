import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readAppStyles} from './readAppStyles.mjs';
test('CSS is split into stable, ordered feature modules with no missing or empty files',()=>{
 const manifest=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 const imports=[...manifest.matchAll(/^@import '\.\/styles\/([^']+\.css)';$/gm)];
 assert.equal(imports.length,11);
 for(const [,name] of imports){
  const contents=readFileSync(new URL('../src/styles/'+name,import.meta.url),'utf8');
  assert.ok(contents.trim().length>200,name);
 }
 const all=readAppStyles();
 for(const selector of ['.mapscroll{','.token{','.map-fog-overlay{',
  '.inventory-grid-scroll{','.units-subtabs button.selected{',
  '.map-measure-toolbar{','.macro-hotbar{'])assert.ok(all.includes(selector),selector);
});
test('global sheet, environment and combat CSS imports retain their historical order',()=>{
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const names=["import './style.css'","import './map-environment.css'","import './combat.css'"];
 assert.ok(names.every(s=>main.includes(s)));
 assert.ok(names[0]&&main.indexOf(names[0])<main.indexOf(names[1]));
 assert.ok(main.indexOf(names[1])<main.indexOf(names[2]));
});

test('modular CSS retains the exact pre-split cascade, not merely the same selectors',()=>{
 // Snapshot is the old consolidated style.css after verified duplicate cleanup.
 // No whitespace, media nesting, selector or declaration reordering is allowed
 // during the architecture split. This checksum includes intentionally added
 // pin preview, selected-pin and held-tool styles. Further edits update this
 // checksum with their own visual regression review.
 const text=readAppStyles().trimEnd();
 let hash=2166136261>>>0;
 for(let i=0;i<text.length;i++){
  hash^=text.charCodeAt(i);
  hash=Math.imul(hash,16777619);
 }
 assert.equal((hash>>>0).toString(16).padStart(8,'0'),'8111efdf');
});
