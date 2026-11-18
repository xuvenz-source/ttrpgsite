import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const get=p=>readFileSync(new URL(p,root),'utf8');
const manifest=()=>JSON.parse(get('staging/world-v2-b10-r18-114-isolated-sheet-movement/manifest.json'));
test('R114 source exact digest anchors are six distinct R103 functions',()=>{
 const m=manifest();
 const r103=JSON.parse(get('staging/world-v2-b10-r18-103-live-source-parity/metadata-index.json'));
 assert.equal(m.workPackage,'B10-R18-114');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.sourceHashAnchors.length,6);
 assert.equal(new Set(m.sourceHashAnchors.map(x=>x.name)).size,6);
 for(const x of m.sourceHashAnchors){
  assert.match(x.sha256,/^[0-9a-f]{64}$/);
  const prior=r103.functions.filter(f=>f.name===x.name);
  assert.equal(prior.length,1);
  assert.equal(prior[0].bodySha256,x.sha256);
  assert.equal(prior[0].bodyBytes,x.bytes);
 }
 assert.equal(m.sourceHashAnchors.filter(x=>x.priorDirectLiveComparison).length,2);
});
test('R114 fixture stays disposable and cannot approve production/QA',()=>{
 const m=manifest(), runner=get('tests/world-v2-r18-114-postgres/run.sh');
 assert.equal(m.noHostedDatabaseWrites,true);
 assert.equal(m.noProductionDeployment,true);
 assert.equal(m.releaseAuthorized,false);
 assert.ok(Object.values(m.unapprovedGates).every(x=>x===false));
 assert.equal(m.fixture.original83MigrationBodiesRead,false);
 assert.equal(m.fixture.originalDataRowsCopied,false);
 assert.match(runner,/R114_ISOLATED/);
 assert.match(runner,/world_v2_r18_114/);
 assert.match(runner,/127\.0\.0\.1/);
 assert.match(runner,/for envvar in DATABASE_URL DIRECT_URL/);
 assert.doesNotMatch(runner,/\b(?:supabase|migration repair|db push|db reset|psql -h)\s+(?:apply|link|migration|db)/);
});
test('R114 authorization probes and known negative cases are staged',()=>{
 const m=manifest(), sheet=get('tests/world-v2-r18-114-postgres/verify-sheet.sql');
 const move=get('tests/world-v2-r18-114-postgres/verify-movement.sql');
 const probes=get('tests/world-v2-r18-114-postgres/probes.sql');
 assert.deepEqual(m.plannedChecks,{
  sheetAuthorizationCases:17,sheetReaderCases:12,sheetPatchCases:9,
  movementCases:25,actualRoleAclDenials:5
 });
 assert.equal((sheet.match(/-- SHEET-ACL /g)||[]).length,17);
 assert.equal((sheet.match(/-- SHEET-GET /g)||[]).length,12);
 assert.equal((sheet.match(/-- SHEET-PATCH /g)||[]).length,9);
 assert.equal((move.match(/-- MOVE /g)||[]).length,23);
 assert.match(move,/RATE_LIMIT rapid movement accepted/);
 assert.match(move,/revoked P1 retained movement permission/);
 assert.match(sheet,/unleased sheet PATCH overwrote inventory/);
 assert.match(probes,/REVOKE ALL ON FUNCTION public.r114_movement_probe/);
 assert.match(probes,/REVOKE ALL ON FUNCTION public.r114_sheet_probe/);
});
test('R114 extractor must verify original pg_proc digests before writing scratch SQL',()=>{
 const extractor=get('tests/world-v2-r18-114-postgres/extract_source.py');
 assert.match(extractor,/staging\/world-v2-b10-r18-103-live-source-parity\/metadata-index.json/);
 assert.match(extractor,/hashlib.sha256/);
 assert.match(extractor,/bodyBytes/);
 assert.match(extractor,/\/tmp\/world-v2-r18-114-/);
 assert.match(extractor,/if len\(found\)!=1: fail\(\)/);
 assert.doesNotMatch(extractor,/psycopg2|requests\.(?:get|post)|urllib|subprocess|supabase\.co/);
});
