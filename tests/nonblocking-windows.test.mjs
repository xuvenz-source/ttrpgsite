import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const lib=readFileSync(new URL('../src/PersonalTokenLibrary.jsx',import.meta.url),'utf8');
const studio=readFileSync(new URL('../src/TokenStudio.jsx',import.meta.url),'utf8');
const floating=readFileSync(new URL('../src/FloatingWindow.jsx',import.meta.url),'utf8');
test('library and studio leave tabletop interactive, no modal backdrops',()=>{
 assert.ok(lib.includes('<FloatingWindow kind="library"'));
 assert.ok(studio.includes('<FloatingWindow kind="studio"'));
 assert.ok(!lib.includes('className="modal-backdrop'));
 assert.ok(!studio.includes('className="modal-backdrop'));
 assert.ok(!lib.includes('aria-modal="true"'));
});
test('click any floating window to raise it',()=>{
 assert.ok(floating.includes('setLayer(++topWindowLayer)'));
 assert.ok(floating.includes('onPointerDownCapture={start}'));
 assert.ok(floating.includes("e.target.closest('.heading')"));
});