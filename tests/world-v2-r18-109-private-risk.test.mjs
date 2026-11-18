import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyR109Sql,R109_CATEGORIES}
 from '../scripts/release/triage-world-v2-r18-109-private-risk.mjs';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const scan=sql=>classifyR109Sql(sql);

test('R109 distinguishes generic service_role mentions from potential credential values',()=>{
 const role=scan('-- service_role role is used in server side grants');
 assert.equal(role.serviceRoleIdentifierWithoutCredential,true);
 assert.equal(role.candidateCredentialValue,false);
 const token='sb_secret_'+('A'.repeat(30));
 const secret=scan('-- synthetic only '+token+' and service_role');
 assert.equal(secret.candidateCredentialValue,true);
 assert.equal(secret.serviceRoleIdentifierWithoutCredential,false);
 assert.equal(JSON.stringify(secret).includes(token),false);
 assert.equal(Object.keys(secret).length,R109_CATEGORIES.length);
 assert.equal(Object.values(secret).every(v=>typeof v==='boolean'),true);
});
test('R109 classifies synthetic public EXECUTE, owner Auth writes and JWT metadata',()=>{
 const f=scan([
  'CREATE FUNCTION public.f() RETURNS void SECURITY DEFINER AS $$',
  "BEGIN EXECUTE format('select 1'); END; $$;",
  'GRANT EXECUTE ON FUNCTION public.f() TO PUBLIC;',
  'GRANT EXECUTE ON FUNCTION public.f() TO authenticated;',
  'REVOKE EXECUTE ON FUNCTION public.f() FROM PUBLIC;',
  'INSERT INTO auth.users (id) VALUES (1);',
  'SELECT auth.jwt(), raw_user_meta_data FROM x;'
 ].join('\n'));
 for(const name of [
  'securityDefinerWithoutSearchPathText','securityDefinerWithoutDirectAuthUidText',
  'securityDefinerWithDynamicExecuteText','publicExecuteGrant','authenticatedExecuteGrant',
  'publicExecuteRevoke','authIdentityWrite','userEditableMetadata',
  'editableMetadataWithJwtReference','dynamicExecute'
 ])assert.equal(f[name],true,name);
});
test('R109 detects explicit search path and direct auth uid text markers',()=>{
 const f=scan("CREATE FUNCTION f() RETURNS int SECURITY DEFINER SET search_path = '' AS $$ SELECT auth.uid(); $$;");
 assert.equal(f.securityDefinerWithoutSearchPathText,false);
 assert.equal(f.securityDefinerWithoutDirectAuthUidText,false);
 assert.equal(f.publicExecuteGrant,false);
});
test('R109 detects storage write and portability markers from synthetic SQL',()=>{
 const f=scan('DELETE FROM storage.objects WHERE id = 1; ALTER PUBLICATION supabase_realtime ADD TABLE t; CREATE EXTENSION IF NOT EXISTS pgcrypto;');
 assert.equal(f.storageObjectWrite,true);
 assert.equal(f.realtimePublicationChange,true);
 assert.equal(f.extensionOrRoleChange,true);
});
test('R109 never logs SQL or allows network / write / release operations',()=>{
 assert.throws(()=>scan(''),/R109 PRIVATE RISK NO-GO/);
 assert.throws(()=>scan('x'.repeat(12*1024*1024+1)),/R109 PRIVATE RISK NO-GO/);
 const path=join(ROOT,'scripts/release/triage-world-v2-r18-109-private-risk.mjs');
 const source=readFileSync(path,'utf8');
 assert.match(source,/reviewR108PrivateHistory/);
 assert.match(source,/isDeepStrictEqual/);
 assert.match(source,/sqlSecurityReviewApproved:false/);
 assert.match(source,/productionReleaseAuthorized:false/);
 assert.doesNotMatch(source,/\b(?:fetch|spawnSync|execSync|writeFileSync|apply_migration)\s*\(/);
});
