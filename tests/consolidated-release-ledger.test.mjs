import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const raw=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ledger=JSON.parse(raw('staging/next-release-ledger.json'));
test('the release ledger only names a staging branch when unreleased work remains',()=>{
 if(ledger.upcomingRelease.outstandingBranches.length)
  assert.match(ledger.releaseBranch,/^stage\//);
 else assert.equal(ledger.releaseBranch,null);
 assert.match(ledger.policy,/every previously staged/);
 assert.ok(ledger.branches.length>=20);
 const ready=ledger.features.filter(x=>['included','released'].includes(x.status));
 assert.ok(ready.every(x=>x.sources.every(s=>ledger.branches.some(b=>
  b.name===s&&['included','released'].includes(b.status)))));
 // A new unready feature must be explicitly tracked, never silently shipped.
 const pending=ledger.features.filter(x=>x.status==='in-progress');
 assert.ok(pending.every(x=>x.releaseReady===false&&x.sources.every(s=>
  ledger.branches.some(b=>b.name===s&&b.status==='in-progress'))));
 assert.equal(ledger.databaseDependencies[0].status,'applied-production');
 assert.equal(ledger.edgeFunctionDependencies[0].status,'deployed-production');
});
test('pending ruler, tools, pin, map and account changes are all in the bundle',()=>{
 const ids=new Set(ledger.features.map(f=>f.id));
 for(const id of ['ruler-turns','mixed-selection','tool-pickup','character-sheet-popouts',
  'environment-delete','pin-icons','breached-password-check'])assert.ok(ids.has(id),id);
 const app=(raw('src/main.jsx')+raw('src/TabletopApp.jsx')+raw('src/BattlemapBoard.jsx')+raw('src/SheetTemplateDesigner.jsx'));
 for(const name of ['shouldBendLineOnKeyPress','selectableToolIds','onToolPickUp',
  'onDeleteEnvironmentObject','onToolMovementPreview'])assert.ok(app.includes(name),name);
 assert.match(app,/createAuthorizedMotionTransport/);
 assert.match(app,/transport\.send\(packet\)/);
 assert.match(raw('src/useAuthorizedMapLights.js'),/get_authorized_map_light_masks/);
 assert.match(app,/observerMotionTopic\(mapId,user\)/);
 assert.match(raw('supabase/functions/username-register/index.ts'),/isCompromisedPassword/);
 assert.match(raw('src/MapPinLayer.jsx'),/pin/);
});
test('policy instructs next release to include all staged items with one main merge',()=>{
 const rules=raw('AGENTS.md'),guide=raw('docs/development-workflow.md');
 assert.match(rules,/Batch all outstanding staged work/);
 assert.match(rules,/one merge to `main`/);
 assert.match(guide,/audit every staged branch/);
 assert.match(guide,/all outstanding, release-ready staged components/);
 assert.match(guide,/[Rr]esolve all code\/permission\/database conflicts/);
});
