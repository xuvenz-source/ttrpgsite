import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const raw=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ledger=JSON.parse(raw('staging/next-release-ledger.json'));
test('the next release is a consolidated staging branch, not a Vercel deployment',()=>{
 assert.match(ledger.releaseBranch,/^stage\/next-release-consolidated-/);
 assert.match(ledger.policy,/every previously staged/);
 assert.ok(ledger.branches.length>=20);
 assert.ok(ledger.features.every(x=>x.status==='included'&&x.sources.every(s=>ledger.branches.some(b=>b.name===s&&b.status==='included'))));
 assert.equal(ledger.databaseDependencies[0].status,'staged-not-applied');
 assert.equal(ledger.edgeFunctionDependencies[0].status,'staged-not-deployed');
});
test('pending ruler, tools, pin, map and account changes are all in the bundle',()=>{
 const ids=new Set(ledger.features.map(f=>f.id));
 for(const id of ['ruler-turns','mixed-selection','tool-pickup','character-sheet-popouts',
  'environment-delete','pin-icons','breached-password-check'])assert.ok(ids.has(id),id);
 const app=raw('src/main.jsx');
 for(const name of ['shouldBendLineOnKeyPress','selectableToolIds','onToolPickUp',
  'onDeleteEnvironmentObject','onToolMovementPreview'])assert.ok(app.includes(name),name);
 assert.match(app,/if\(access\.fogEnabled\)return;/);
 assert.match(app,/if\(!fog\.frame\|\|fog\.frame\.mapId!==selectedMap\|\|fog\.frame\.enabled\)return;/);
 assert.match(raw('supabase/functions/username-register/index.ts'),/isCompromisedPassword/);
 assert.match(raw('src/MapPinLayer.jsx'),/pin/);
});
test('policy instructs next release to include all staged items with one main merge',()=>{
 const rules=raw('AGENTS.md'),guide=raw('docs/development-workflow.md');
 assert.match(rules,/Batch all outstanding staged work/);
 assert.match(rules,/one merge to `main`/);
 assert.match(guide,/audit every staged branch/);
 assert.match(guide,/all outstanding, release-ready staged components/);
 assert.match(guide,/resolve all code\/permission\/database conflicts/);
});
