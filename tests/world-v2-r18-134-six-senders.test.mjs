import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-134-six-sender-v3-cutover/';
const snapshot=JSON.parse(read(base+'immutable-original-six.json'));
const replacement=read(base+'unapplied-six-legacy-observer-replacements.sql');
const manifest=JSON.parse(read(base+'manifest.json'));
const r133=JSON.parse(read('staging/world-v2-b10-r18-133-observer-v3-relay/legacy-observer-sender-matrix.json'));
const runner=read('tests/world-v2-r18-134-postgres/run.sh');
const testSQL=read('tests/world-v2-r18-134-postgres/verify-six-senders.sql');
const fixture=read('tests/world-v2-r18-134-postgres/setup-stubs.sql');
const handoff=read('docs/testing/world-v2-r18-134-six-sender-cutover-2026-11-20.md');

const known=new Map(r133.sourceFunctionCoverage.map(x=>[x.name,x.sourceMd5]));
function calls(body){
 const re=/realtime\.send\s*\(/gi;
 const result=[];
 for(let match; (match=re.exec(body));){
  let depth=1,index=re.lastIndex,start=index,quote=false;
  for(;index<body.length&&depth;index++){
   const c=body[index];
   if(c==="'"){if(quote&&body[index+1]==="'"){index++;continue}quote=!quote;continue}
   if(!quote){if(c==='(')depth++;else if(c===')')depth--}
  }
  assert.equal(depth,0,'unbalanced legacy send');
  const args=[];let split=start,nesting=0,inString=false;
  for(let i=start;i<index-1;i++){
   const c=body[i];
   if(c==="'"){if(inString&&body[i+1]==="'"){i++;continue}inString=!inString;continue}
   if(!inString){
    if(c==='(')nesting++;
    else if(c===')')nesting--;
    else if(c===','&&nesting===0){
     args.push(body.slice(split,i).trim());split=i+1;
    }
   }
  }
  args.push(body.slice(split,index-1).trim());
  assert.equal(args.length,4,'each send has exactly payload,event,topic,private');
  result.push({start:match.index,end:index,args});re.lastIndex=index;
 }
 return result;
}
const expectedMap={
 'forge_visibility.dispatch_movement_preview':['p_map','recipient.user_id',1],
 'forge_visibility.publish_approved_navigation_batch':['s.map_id','recipient.user_id',2],
 'forge_world_v2.bump_vision_epoch_v2':['p_map','p_viewer',1],
 'forge_world_v2.publish_approved_observers':['p_session.map_id','audience.user_id',1],
 'public.advance_map_motion_session':['s.map_id','recipient.user_id',1],
 'public.advance_map_motion_session_path':['s.map_id','recipient.user_id',2]
};
function transform(record){
 const ctx=expectedMap[record.name];
 assert.ok(ctx,record.name);
 const originalCalls=calls(record.definition);
 assert.equal(originalCalls.length,ctx[2],record.name);
 let body=record.definition;
 const system=record.name==='forge_world_v2.bump_vision_epoch_v2';
 for(const op of originalCalls.slice().reverse()){
  const [payload,event,topic,priv]=op.args;
  assert.equal(priv,'true');
  assert.equal(event,system?"'world-vision-v2'":
   record.name==='forge_world_v2.publish_approved_observers'?
   "'world-motion-v2'":"'motion'");
  assert.match(topic,/forge-observer:|forge-world-v2:/);
  const call=system?'forge_observer_v3.dispatch_trusted_vision_v3(p_campaign,'+
     ctx[0]+','+ctx[1]+','+payload+')':
   'forge_observer_v3.dispatch_authorized_observer_v3('+
     ctx[0]+','+ctx[1]+','+event+','+payload+')';
  body=body.slice(0,op.start)+call+body.slice(op.end);
 }
 if(record.name==='forge_world_v2.publish_approved_observers'){
  body=body.replace(/PERFORM (forge_observer_v3\.dispatch_authorized_observer_v3\([\s\S]*?\));\s*sent:=sent\+1;/m,
   (_whole,call)=>'IF '+call+' THEN\n   sent:=sent+1;\n  END IF;');
 }
 return body;
}
test('R134 is pinned source-only child of fully green R133 and remains NO_GO',()=>{
 assert.equal(manifest.workPackage,'B10-R18-134');
 assert.equal(manifest.parentPr,241);
 assert.equal(manifest.parentSha,'4cb9c800d90129994b678b5369ab4f213ab1b6b0');
 assert.equal(manifest.inheritedExactHeadCi.allPassed,true);
 assert.equal(manifest.decision,'NO_GO');
 assert.equal(manifest.originalMigrations,83);
 assert.equal(manifest.qaMigrations,0);
 assert.equal(manifest.qaPublicAppTables,0);
 for(const key of ['noHostedSqlWrites','noProductionSourceEdits','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources'])assert.equal(manifest[key],true,key);
 assert.equal(manifest.productionReleaseAuthorized,false);
});
test('R134 records all six exact original SQL hashes and transforms all eight sends',()=>{
 assert.equal(snapshot.source.length,6);
 assert.equal(snapshot.sourceCount,6);
 assert.equal(known.size,6);
 const names=new Set();
 let sends=0,signed=0,system=0;
 for(const item of snapshot.source){
  assert.equal(item.md5,known.get(item.name),item.name);
  assert.ok(!names.has(item.name),'duplicate original SQL');
  names.add(item.name);
  const sourceCalls=calls(item.definition);
  sends+=sourceCalls.length;
  if(item.name==='forge_world_v2.bump_vision_epoch_v2')system+=sourceCalls.length;
  else signed+=sourceCalls.length;
  const candidate=transform(item).trimEnd()+';';
  assert.ok(replacement.includes(candidate),
   'not an exact call-site-only transformation: '+item.name);
  assert.ok(!/realtime\.send\s*\(/i.test(transform(item)),item.name);
 }
 assert.equal(names.size,6);
 assert.deepEqual([sends,signed,system],[8,7,1]);
 assert.equal(manifest.legacyRealtimeSendCallSitesTransformed,sends);
 assert.equal(manifest.signedUserRelayCallSites,signed);
 assert.equal(manifest.trustedSystemVisionRelayCallSites,system);
 assert.equal((replacement.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,6);
});
test('R134 trusted SYSTEM vision helper is private and not an actor-spoof fallback',()=>{
 const helper=replacement.split('AS $trusted_vision$')[1]?.split('END $trusted_vision$')[0];
 assert.ok(helper);
 assert.match(replacement,/CREATE FUNCTION forge_observer_v3\.dispatch_trusted_vision_v3/);
 assert.match(replacement,/REVOKE ALL ON FUNCTION[\s\S]*dispatch_trusted_vision_v3\(uuid,uuid,uuid,jsonb\)[\s\S]*FROM PUBLIC,anon,authenticated/);
 assert.doesNotMatch(replacement,/GRANT EXECUTE ON FUNCTION/);
 for(const required of [
  'forge_scene_drain.scene_v3_publish_allowed()',
  'forge_world_v2.viewer_on_map(p_campaign,p_map,p_viewer)',
  'forge_scene_revoke.current_recipient_scene_topic_v3',
  "p_payload->>'mapId' IS DISTINCT FROM p_map::text",
  "p_payload->>'viewerId' IS DISTINCT FROM p_viewer::text",
  "p_payload->>'version' IS DISTINCT FROM '2'",
  "PERFORM realtime.send(p_payload,'world-vision-v2',private_topic,true)"
 ])assert.ok(helper.includes(required),required);
 assert.doesNotMatch(helper,/auth\.uid\(\)/);
 assert.doesNotMatch(helper,/forge-observer:/);
 assert.doesNotMatch(helper,/forge-world-v2:/);
});
test('R134 synthetic PG17 compiles all six bodies; no-JWT sight and ACLs are tested',()=>{
 for(const term of ['forge_visibility.navigation_gestures',
  'forge_visibility.movement_sessions','forge_world_v2.motion_sessions',
  'forge_world_v2.vision_epochs','public.map_environments',
  'forge_visibility.navigation_permission_generations'])
  assert.ok(fixture.includes(term),term);
 for(const term of ['R134 fenced trigger vision emitted','R134 unsigned system vision',
  'R134 vision payload or private recipient epoch mismatch','R134 removed viewer',
  'R134 reinstated recipient','R134 off-map P2','R134 maintenance failed',
  'R134 legacy caller actor/null safeguards'])
  assert.ok(testSQL.includes(term),term);
 for(const term of ['R134_ISOLATED','127.0.0.1','world_v2_r18_134',
  'r134_disposable_only','SUPABASE_SERVICE_ROLE_KEY','PGHOSTADDR',
  'direct-legacy-senders.log','v3-covered.log','authenticated-system-relay',
  'anon-system-relay','world-v2-r18-134-postgres/verify-six-senders.sql'])
  assert.ok(runner.includes(term),term);
 assert.doesNotMatch(runner,/supabase\s+(db|link|migration|deploy)/);
});
test('R134 cannot claim real production integration, signed QA or V3 client success',()=>{
 for(const key of ['originalLiveSenderDefinitionsChanged',
  'productionClientSubscribesToV3Observer','realWebsocketRevocationVerified',
  'r128HardMaintenanceFenceInstalled','v3RecipientSchemaInstalledInHosted',
  'preissuedStorageBearerUrlsRevoked','signedMultiUserQaComplete',
  'fullPrivilegedRpcSemanticAuditComplete','all83OriginalSqlBodiesAudited',
  'movementPathPerformanceMeasured','allExternalRealtimeSendersCovered'])
  assert.equal(manifest[key],false,key);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const term of ['NO_GO','six','eight','seven','system','LOS',
  'R18-135','83','67','signed','movement','Storage'])
  assert.ok(handoff.toLowerCase().includes(term.toLowerCase()),term);
});
