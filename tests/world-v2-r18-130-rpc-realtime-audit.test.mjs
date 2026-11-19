import test from 'node:test';
import assert from 'node:assert/strict';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {R130_LIVE_ENABLED,extractSubscriptionsFromSource,
 scanRealtimeSubscriptions,compareSubscriptionBaselines}
 from '../staging/world-v2-b10-r18-130-rpc-realtime-subscription-audit/SourceRealtimeSubscriptionAudit.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-130-rpc-realtime-subscription-audit/';
const rpc=JSON.parse(read(base+'public-definer-call-candidates.json'));
const clients=JSON.parse(read(base+'client-subscription-baseline.json'));
const published=JSON.parse(read('staging/world-v2-b10-r18-129-rpc-stream-fog-audit/catalog-evidence.json'));
const manifest=JSON.parse(read(base+'manifest.json'));
const handoff=read('docs/testing/world-v2-r18-130-rpc-stream-cutover-audit-2026-11-19.md');

test('R130 inherits pinned R129 draft and complete release NO_GO',()=>{
 assert.equal(R130_LIVE_ENABLED,false);
 assert.equal(manifest.workPackage,'B10-R18-130');
 assert.equal(manifest.parentPr,237);
 assert.equal(manifest.parentSha,'31779ef3b1829f227c976c78144d748acd938c64');
 assert.equal(manifest.decision,'NO_GO');
 for(const name of ['noHostedWrites','noLiveRuntimeChanges','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources'])assert.equal(manifest[name],true,name);
 assert.equal(manifest.productionReleaseAuthorized,false);
});
test('R130 full 67 RPC inventory agrees with R129 15 lacking direct guard text',()=>{
 assert.equal(rpc.totalFunctions,67);
 assert.equal(rpc.functions.length,67);
 assert.equal(new Set(rpc.functions.map(f=>f.name+'('+f.signature+')')).size,67);
 assert.equal(rpc.absenceOfDirectGuardTextCount,15);
 assert.equal(rpc.functions.filter(f=>!f.hasDirectGuardText).length,15);
 assert.ok(rpc.functions.every(f=>/^[0-9a-f]{32}$/.test(f.sourceMd5)));
 assert.ok(rpc.functions.every(f=>f.reviewState==='REQUIRES_MANUAL_TRANSITIVE_REVIEW'));
 const old=new Map(published.directGuardTextAbsent.map(x=>[x.name,x]));
 for(const f of rpc.functions.filter(f=>!f.hasDirectGuardText)){
  const prev=old.get(f.name.slice(7));assert.ok(prev,f.name);
  assert.equal(f.sourceMd5,prev.sourceMd5);
 }
});
test('R130 delegated call candidates exist but are never certified as authorization proofs',()=>{
 const get=name=>rpc.functions.find(f=>f.name==='public.'+name);
 for(const [name,callee] of [
  ['advance_world_motion_v2','forge_world_v2.advance_core_v2'],
  ['get_authorized_map_fog_v2','public.get_authorized_map_fog'],
  ['get_world_visibility_v2','forge_world_v2.visibility_frame_v2'],
  ['get_campaign_sheet_inventory','public.can_edit_campaign_sheet_inventory'],
  ['preview_map_motion','forge_visibility.dispatch_movement_preview'],
  ['patch_campaign_sheet_noninventory','public.can_edit_campaign_sheet']
 ]){
  assert.ok(get(name),name);
  assert.ok(get(name).staticQualifiedCalls.includes(callee),name+' -> '+callee);
 }
 assert.equal(get('is_map_fog_published').hasDirectGuardText,false);
 assert.equal(get('is_map_fog_published').referencesAuthUid,false);
 assert.equal(manifest.verifiedLiveSignedRpcAuthorization,false);
 assert.equal(manifest.all67PrivilegedRpcBodyAndDelegationReviewComplete,false);
});
test('R130 parser extracts explicit and dynamic postgres_changes options fail-closed',()=>{
 const sample="const a=db.channel('a')\n"+
 ".on('postgres_changes',{event:'UPDATE',schema:'public',table:'characters',filter:'id=eq.'+id},()=>{})\n"+
 ".on('postgres_changes',{event:'*',schema:'public',table:'chat_messages'},()=>{}).subscribe();";
 const out=extractSubscriptionsFromSource(sample,'src/example.js');
 assert.equal(out.length,2);
 assert.equal(out[0].table,'characters');
 assert.equal(out[0].event,'UPDATE');
 assert.equal(out[0].hasFilter,true);
 assert.equal(out[0].includesDelete,false);
 assert.equal(out[1].table,'chat_messages');
 assert.equal(out[1].includesDelete,true);
 assert.throws(()=>extractSubscriptionsFromSource(
  "db.channel('x').on('postgres_changes',{event:'*',schema:'public',table:newKind},()=>{})",
  'src/unreviewed.js'),/unreviewed dynamic/);
});
test('R130 scans complete src tree and emits non-sensitive subscription metadata',()=>{
 const found=scanRealtimeSubscriptions(root);
 console.log('R130_SUBSCRIPTION_DISCOVERY='+JSON.stringify(found.map(f=>({
  file:f.file,line:f.line,table:f.table,event:f.event,
  filter:f.hasFilter,select:f.hasSelect,dynamic:f.tableExpression==='dynamic'
 }))));
 assert.ok(found.length>=15,'unexpectedly small source subscription set');
 assert.ok(found.some(x=>x.table==='map_viewer_visibility_ticks'&&x.event==='INSERT'));
 assert.ok(found.some(x=>x.table==='map_viewer_visibility_ticks'&&x.event==='UPDATE'));
 assert.ok(found.some(x=>x.table==='campaigns'));
 assert.ok(found.some(x=>x.table==='chat_messages'));
 assert.ok(found.some(x=>x.table==='characters'));
 assert.ok(found.some(x=>x.table==='target.table'&&x.file==='src/useCampaignSheetInventory.js'));
 assert.ok(found.every(x=>x.schema==='public'));
 assert.ok(found.every(x=>x.hasFilter));
 const check=compareSubscriptionBaselines(found,clients.subscriptions,
  published.supabaseRealtimePublicationTables);
 assert.equal(check.releaseAuthorized,false);
 assert.equal(check.socketEjectionProven,false);
 if(clients.mode==='DISCOVERY_ONLY_NOT_VERIFIED')
  assert.equal(check.status,'SUBSCRIPTION_DRIFT_NO_GO');
 else{
  assert.equal(clients.mode,'SOURCE_BASELINE_REVIEW_PENDING');
  assert.equal(check.status,'SOURCE_PARITY_NO_GO',JSON.stringify(check.problems));
 }
});
test('R130 baseline drift rejects changed subscriptions and unexpected/unpublished tables',()=>{
 const expected=[{file:'src/example.js',schema:'public',table:'characters',tableExpression:'literal',
  event:'UPDATE',hasFilter:true,hasSelect:false,includesDelete:false}];
 for(const overrides of [
  {table:'unknown_private_table'},
  {event:'*',includesDelete:true},
  {hasFilter:false},
  {file:'src/other.js'}
 ]){
  const result=compareSubscriptionBaselines([{...expected[0],...overrides}],
   expected,published.supabaseRealtimePublicationTables);
  assert.equal(result.status,'SUBSCRIPTION_DRIFT_NO_GO');
  assert.equal(result.releaseAuthorized,false);
 }
 const ok=compareSubscriptionBaselines(expected,expected,published.supabaseRealtimePublicationTables);
 assert.equal(ok.status,'SOURCE_PARITY_NO_GO');
 assert.equal(ok.releaseAuthorized,false);
});
test('R130 always leaves actual Realtime, privilege and asset revocation unresolved',()=>{
 const s=manifest.streamSecurity;
 for(const key of ['livePostgresChangesRevocationVerified',
  'realtimeLegacyBroadcastSocketEjectionVerified','storageSignedUrlAccessRevoked',
  'serverSideLegacyFenceInstalled','privateRlsSignedQaPerformed',
  'subscriberDisconnectProofPerformed','clientUnsubscriptionIntegrated'])
  assert.equal(s[key],false,key);
 for(const term of ['NO_GO','67','15','17','DELETE','already-connected',
 'R18-123','R18-128','#231'])
  assert.ok(handoff.toLowerCase().includes(term.toLowerCase()),term);
});
