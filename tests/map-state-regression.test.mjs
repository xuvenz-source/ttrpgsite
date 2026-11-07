import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('App initializes map collection state before referencing maps or setMaps',()=>{
 const source=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
 assert.match(source,/\[maps\s*,\s*setMaps\]\s*=\s*useState\(\[\]\)/);
 assert.match(source,/const activeMap=maps\.find\(/);
 assert.match(source,/setMaps\(b\)/);
});
