import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyR108Sql,R108_RULE_NAMES}
 from '../scripts/release/review-world-v2-r18-108-private-history.mjs';
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
test('R108 heuristic categories are boolean-only and contain no source SQL',()=>{
 const secret='sb_secret_CONFIDENTIAL_TOKEN';
 const synthetic=`CREATE FUNCTION f() RETURNS void SECURITY DEFINER AS $$ begin INSERT INTO auth.users (id) VALUES (1); end $$; -- ${secret}`;
 const flags=classifyR108Sql(synthetic);
 assert.equal(flags.securityDefiner,true);
 assert.equal(flags.authDependencies,true);
 assert.equal(flags.dataWriteStatements,true);
 assert.equal(flags.secretMaterialMarkers,true);
 assert.equal(Object.keys(flags).length,R108_RULE_NAMES.length);
 assert.equal(Object.values(flags).every(x=>typeof x==='boolean'),true);
 assert.equal(JSON.stringify(flags).includes(secret),false);
});
test('R108 detects broad synthetic portability / privilege markers',()=>{
 const synthetic=`CREATE POLICY p ON public.t USING (true);
 GRANT EXECUTE ON FUNCTION public.f() TO authenticated;
 CREATE EXTENSION IF NOT EXISTS pgcrypto;
 ALTER PUBLICATION supabase_realtime ADD TABLE public.t;
 select raw_user_meta_data from t;`;
 const flags=classifyR108Sql(synthetic);
 for(const k of ['rlsPolicy','privilegedGrants','publicRoleGrants',
  'environmentChanges','realtimeDependencies','userControlledAuthMetadata']){
  assert.equal(flags[k],true,k);
 }
 assert.doesNotMatch(JSON.stringify(flags),/raw_user_meta_data|CREATE POLICY/);
});
test('R108 rejects missing/oversize input and prevents SQL execution or release',()=>{
 assert.throws(()=>classifyR108Sql(''),/R108 PRIVATE SQL REVIEW NO-GO/);
 assert.throws(()=>classifyR108Sql('x'.repeat(12*1024*1024+1)),
  /R108 PRIVATE SQL REVIEW NO-GO/);
 const src=readFileSync(join(ROOT,'scripts/release/review-world-v2-r18-108-private-history.mjs'),'utf8');
 assert.doesNotMatch(src,/\b(?:spawnSync|execSync|fetch|apply_migration|writeFileSync)\s*\(/);
 assert.match(src,/verifyR99OperatorCapture/);
 assert.match(src,/privateSqlSecurityReviewComplete:false/);
 assert.match(src,/releaseAuthorized:false/);
});
