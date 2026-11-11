import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('R09 whitelisted rejection reasons never emit server messages',()=>{
 const t=createWorldV2Trace({enabled:true});
 t.event('movement.reject-reason','invalid-authority-ack');
 t.event('movement.reject-reason','some secret network error');
 assert.deepEqual(t.snapshot().events.map(x=>x.detail),['invalid-authority-ack','other']);
});
test('R09 observer-first remains default OFF, rollout and SQL NO-GO',()=>{
 const s=read('src/engine/v2/WorldV2TabletopRuntime.js');
 assert.match(s,/VITE_WORLD_V2_OBSERVER_FIRST_BOOTSTRAP==='1'/);
 assert.match(s,/observerFirstBootstrap=bootstrapOnPrivateSubscription&&!dmPreview/);
 assert.match(s,/return observerFirstBootstrap\?false:/);
 const p=JSON.parse(read('staging/engineering-progress.json'));
 const gate=JSON.parse(read('staging/world-v2-b10-release-qualification.json'));
 assert.equal(p.nextStep,'B10-R10');
 assert.equal(p.steps.B10_R09.flagEnabled,false);
 assert.equal(p.steps.B10_R09.releaseDecision,'NO_GO');
 assert.equal(gate.stagedRemediations.B10_R09.flagActivated,false);
 assert.equal(gate.decision,'NO_GO');
});
