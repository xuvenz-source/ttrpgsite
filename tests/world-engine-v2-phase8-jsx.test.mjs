import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';

test('Phase 8 stable JSX layer stack compiles with React automatic runtime',async()=>{
 const path=new URL('../src/engine/v2/WorldCanvasStack.jsx',import.meta.url);
 const source=await readFile(path,'utf8');
 const result=await transformWithEsbuild(source,'WorldCanvasStack.jsx',{
  jsx:'automatic',target:'es2022'
 });
 assert.ok(result.code.includes('createWorldRenderer'));
 assert.ok(result.code.includes('world-v2-terrain'));
 assert.ok(result.code.includes('world-v2-fog'));
 assert.ok(result.code.includes('world-v2-sprites'));
 assert.equal(source.includes('requestAnimationFrame'),false,
  'the React host must not add an independent animation loop');
 assert.equal(source.includes('supabase.channel'),false);
 assert.equal(source.includes('useState'),false,
  'the host must not recreate tokens by React setState during movement');
});
