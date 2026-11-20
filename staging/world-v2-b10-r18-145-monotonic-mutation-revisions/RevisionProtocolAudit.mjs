/**
 * R18-145 SOURCE-ONLY all-writer revision + V3 duplicate collection audit.
 * Does NOT create a migration or grant browser execution privileges.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {auditR144} from
 '../world-v2-b10-r18-144-mutation-cas-client-compat/MutationCompatibilityAudit.mjs';

export const R145_LIVE_ENABLED=false;
export const R145_DECLARED_API=Object.freeze([
 'get_authorized_character_sheet_revision_v3',
 'get_authorized_handout_revision_v3',
 'patch_authorized_character_revision_v3',
 'edit_authorized_handout_revision_v3',
 'collect_authorized_pin_once_v3'
]);
const fail=m=>{throw Error('R145 revision and authorization gate drift: '+m)};
const match=(s,t,label)=>{if(!s.includes(t))fail(label)};
export function auditR145({root=process.cwd(),candidate}={}){
 const read=p=>readFileSync(join(root,p),'utf8');
 const prior=auditR144({root});
 if(prior.decision!=='NO_GO'||prior.reviewedClientFlows!==5)
  fail('inherited R144 no-go/client mapping changed');
 const sql=candidate??read('staging/world-v2-b10-r18-145-monotonic-mutation-revisions/unapplied-revisioned-mutations-v3.sql');
 const ledger=JSON.parse(read('staging/world-v2-b10-r18-145-monotonic-mutation-revisions/manifest.json'));
 if(ledger.parentPr!==252||
    ledger.parentSha!=='c4c26fb8d736e021862a754008c0361ba67fd2eb'||
    ledger.decision!=='NO_GO'||ledger.productionReleaseAuthorized!==false||
    ledger.newBrowserGrants!==0||ledger.hostedSqlApplied!==false)
  fail('release ledger/parent changed');
 if((sql.match(/^ALTER TABLE public\./gm)||[]).length!==2||
    (sql.match(/^CREATE TRIGGER forge_mutation_revision_/gm)||[]).length!==2||
    (sql.match(/^CREATE FUNCTION forge_v3_internal\./gm)||[]).length!==6||
    (sql.match(/^CREATE FUNCTION forge_v3_api\./gm)||[]).length!==5||
    (sql.match(/^REVOKE ALL ON FUNCTION\s+forge_v3_internal\./gm)||[]).length!==6||
    (sql.match(/^REVOKE ALL ON FUNCTION\s+forge_v3_api\./gm)||[]).length!==5||
    /^\s*GRANT\s/mi.test(sql)||/CREATE OR REPLACE FUNCTION/i.test(sql))
  fail('unexpected schema objects, API functions, or browser grants');
 for(const original of ['characters','campaign_handouts']){
  match(sql,'ALTER TABLE public.'+original+'\n ADD COLUMN forge_mutation_revision bigint NOT NULL DEFAULT 0',
   original+' exact revision field');
  match(sql,'BEFORE UPDATE ON public.'+original+'\n FOR EACH ROW',
   original+' must cover ALL privileged writers, not a subset of columns');
 }
 match(sql,"NEW.forge_mutation_revision:=OLD.forge_mutation_revision+1;",
  'monotonic increment missing');
 match(sql,"OLD.forge_mutation_revision>=9223372036854775806",
  'counter overflow not guarded');
 match(sql,'R145 requires the R128 public freeze','unsafe legacy schema');
 match(sql,'R145 expects 25 API invokers and 26 private helpers',
  'wrong postflight census');
 for(const name of R145_DECLARED_API){
  match(sql,'CREATE FUNCTION forge_v3_api.'+name+'(',name+' public invoker missing');
  match(sql,'CREATE FUNCTION forge_v3_internal.'+name+'(',name+' private definer missing');
  const marker='CREATE FUNCTION forge_v3_internal.'+name+'(';
  const start=sql.indexOf(marker),end=sql.indexOf('REVOKE ALL ON FUNCTION',start);
  const sec=sql.slice(start,end);
  match(sec,'forge_scene_drain.scene_v3_publish_allowed()',name+' gate');
  match(sec,'actor uuid:=auth.uid()',name+' signed actor');
  match(sec,'RETURN NULL',name+' denied case');
 }
 const patch=sql.split('CREATE FUNCTION forge_v3_internal.patch_authorized_character_revision_v3(')[1].split('REVOKE ALL ON FUNCTION')[0];
 match(patch,'FOR UPDATE','serial character lock');
 match(patch,'IS DISTINCT FROM p_expected_revision','character revision CAS');
 match(patch,'forge_v3_internal.patch_authorized_character_v3(','retained R143 owner/template checks');
 match(patch,'p_expected_revision+1','monotonic post-update assert');
 const handout=sql.split('CREATE FUNCTION forge_v3_internal.edit_authorized_handout_revision_v3(')[1].split('REVOKE ALL ON FUNCTION')[0];
 match(handout,'FOR UPDATE','serial handout lock');
 match(handout,'IS DISTINCT FROM p_expected_revision','handout CAS');
 match(handout,'forge_v3_internal.edit_authorized_handout_v3(','retained DM-only R143 authoring');
 const collector=sql.split('CREATE FUNCTION forge_v3_internal.collect_authorized_pin_once_v3(')[1].split('REVOKE ALL ON FUNCTION')[0];
 const firstLock=collector.indexOf('FROM public.campaign_handouts h');
 const secondLock=collector.indexOf('INTO locked_pin FROM public.campaign_map_pins');
 if(firstLock<0||secondLock<=firstLock)fail('collector must lock handout BEFORE pin to reduce hide-pin deadlocks');
 for(const token of [
  "note_row.revealed IS TRUE AND note_row.collected IS TRUE",
  "'result','already-collected'",
  "locked_pin.visible IS DISTINCT FROM TRUE",
  "locked_pin.collectable IS DISTINCT FROM TRUE",
  "public.can_view_campaign_map(locked_pin.campaign_id,locked_pin.map_id)",
  "forge_v3_internal.collect_authorized_pin_v3(p_pin)"
 ])match(collector,token,'collector authorization/duplicate gate '+token);
 const old=read('staging/world-v2-b10-r18-144-mutation-cas-client-compat/manifest.json');
 if(!old.includes('"strictlyMonotonic": false')||
  !old.includes('"idempotent": false'))fail('R144 risk evidence lost');
 return Object.freeze({
  package:'B10-R18-145',decision:'NO_GO',
  sourceOnly:true,hostedSqlApplied:false,productionReleaseAuthorized:false,
  newVersionedMigrations:0,newBrowserGrants:0,
  allWriterTableCounters:2,newTriggers:2,
  newPrivateHelpers:6,newApiInvokers:5,
  lockOrdering:'HANDOUT_BEFORE_PIN',
  legacyUnfencedWritersStillPossible:true,
  signedSupabaseOriginalQAVerified:false,
  actualFreeTierDDLAndPerformanceVerified:false,
  immutableSignedStorageBearerRevoked:false
 });
}
