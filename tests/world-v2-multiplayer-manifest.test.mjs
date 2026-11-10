import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const manifest=JSON.parse(readFileSync(new URL(
 './fixtures/world-v2-multiplayer-manifest.json',import.meta.url),'utf8'));
const guide=readFileSync(new URL(
 '../docs/testing/world-v2-authenticated-multiplayer-fixture.md',import.meta.url),'utf8');

test('A04 defines 24 uniquely identified authenticated scenarios and separate roles',()=>{
 assert.equal(manifest.schemaVersion,1);
 assert.equal(manifest.step,'A04');
 assert.equal(manifest.mode,'MANUAL_AUTHENTICATED_MULTIPLAYER');
 assert.equal(manifest.executionStatus,'NOT_RUN');
 assert.deepEqual(Object.keys(manifest.roles).sort(),['DM','P1','P2']);
 const scenarios=manifest.scenarios;
 assert.equal(scenarios.length,24);
 assert.equal(new Set(scenarios.map(c=>c.id)).size,24);
 const expected={
  AUTH:2,INPUT:5,COLL:4,FOG:5,REC:4,META:1,TOOL:1,PERF:2
 };
 for(const [category,count] of Object.entries(expected))
  assert.equal(scenarios.filter(c=>c.category===category).length,count,category);
 for(const c of scenarios){
  assert.match(c.id,/^(AUTH|INPUT|COLL|FOG|REC|META|TOOL|PERF)-\d\d$/);
  assert.ok(c.id.startsWith(c.category+'-'));
  assert.ok(c.actors.length&&c.actors.every(a=>Object.hasOwn(manifest.roles,a)));
  assert.ok(c.actors.includes('DM')||c.actors.includes('P1'));
  assert.ok(c.requiredFixture.length&&c.requiredFixture.every(t=>
   manifest.requiredFixtureTags.includes(t)));
  assert.ok(typeof c.action==='string'&&c.action.length>15);
  assert.ok(c.mustObserve.length&&c.mustObserve.every(a=>
   typeof a==='string'&&a.length>10));
  assert.ok(c.evidence.length&&c.evidence.every(t=>
   manifest.evidenceTags.includes(t)));
  assert.match(guide,new RegExp('\\| '+c.id.replace('-','\\-')+' \\|'),
   'human test table must include '+c.id);
 }
});
test('A04 prevents mock tests being mistaken for successful live browser acceptance',()=>{
 assert.deepEqual(manifest.caseStatusVocabulary,['PASS','FAIL','BLOCKED','NOT_RUN']);
 assert.match(guide,/SPECIFIED \/ NOT EXECUTED/);
 assert.match(guide,/NOT EXECUTED|NOT RUN/);
 assert.match(guide,/distinct authenticated accounts/);
 assert.match(guide,/Preview must never change saved production token positions/);
 assert.match(guide,/no.*production|no.*SQL/i);
 assert.ok(manifest.preflightGapsAtAudit.includes('fog currently disabled'));
 assert.ok(manifest.preflightGapsAtAudit.includes('collision currently disabled'));
 assert.ok(manifest.confidentialFieldsProhibited.includes('authorization tokens'));
});
test('A04 includes permission failure, vision-only one-way wall and full flash telemetry',()=>{
 const byId=new Map(manifest.scenarios.map(c=>[c.id,c]));
 assert.ok(byId.get('FOG-03').mustObserve.some(s=>s.includes('Movement remains blocked')));
 assert.ok(byId.get('AUTH-02').mustObserve.some(s=>s.includes('NPC identity')));
 assert.ok(byId.get('INPUT-05').mustObserve.some(s=>s.includes('Zero canonical')));
 assert.ok(byId.get('REC-03').requiredFixture.includes('consented-revocation'));
 assert.ok(byId.get('REC-04').mustObserve.some(s=>s.includes('No forged')));
 for(const key of ['FOG-01','INPUT-04','PERF-02'])
  assert.ok(byId.get(key).evidence.includes('blackout-count'),key);
});
