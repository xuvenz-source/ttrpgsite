/**
 * B10-R18-143 SOURCE-ONLY: strict closed-world audit of three mutating
 * function declarations, never imported into src/. Does not authorize
 * browsers, model RLS, run SQL, or install any server changes.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {auditR141} from
 '../world-v2-b10-r18-141-projection-cutover-audit/ProjectionCutoverAudit.mjs';
export const R143_LIVE_ENABLED=false;
export const R143_PROPOSED_MUTATIONS=Object.freeze([
 'patch_authorized_character_v3',
 'edit_authorized_handout_v3',
 'collect_authorized_pin_v3'
]);
const deny=reason=>{throw Error('R143 REVIEW FAIL-CLOSED: '+reason)};
const required=(text,token,reason)=>{if(!text.includes(token))deny(reason)};
function privateSection(sql,name){
 const id='CREATE FUNCTION forge_v3_internal.'+name+'(';
 const start=sql.indexOf(id);
 if(start<0)deny('missing private helper '+name);
 const end=sql.indexOf('REVOKE ALL ON FUNCTION',start);
 if(end<start)deny('missing private revocation '+name);
 return sql.slice(start,end);
}
export function auditR143({root=process.cwd(),candidate}={}){
 const read=path=>readFileSync(join(root,path),'utf8');
 const r141=auditR141({root});
 if(r141.decision!=='NO_GO'||r141.postgresChangesListeners!==19||
  r141.originalPrivilegedRpcInventory!==67||r141.privateStorageBuckets!==3)
  deny('inherited R141 source security drift');
 const sql=candidate??read(
  'staging/world-v2-b10-r18-143-narrow-mutation-contracts/unapplied-closed-mutation-v3.sql');
 const manifest=JSON.parse(read(
  'staging/world-v2-b10-r18-143-narrow-mutation-contracts/manifest.json'));
 if(manifest.decision!=='NO_GO'||manifest.parentPr!==250||
  manifest.parentSha!=='282927baca1f11014cfc03d10524546ea203f299'||
  manifest.inheritedV3ApiFunctions!==17||
  manifest.newBrowserCallableFunctions!==0||
  manifest.newExplicitPublicGrants!==0||
  manifest.productionReleaseAuthorized!==false)
  deny('release ledger/PR lineage changed');
 if((sql.match(/^CREATE FUNCTION forge_v3_internal\./gm)||[]).length!==3||
    (sql.match(/^CREATE FUNCTION forge_v3_api\./gm)||[]).length!==3||
    (sql.match(/^REVOKE ALL ON FUNCTION\s+forge_v3_internal\./gm)||[]).length!==3||
    (sql.match(/^REVOKE ALL ON FUNCTION forge_v3_api\./gm)||[]).length!==3||
    (sql.match(/RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''/g)||[]).length!==3||
    (sql.match(/RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''/g)||[]).length!==3)
  deny('unexpected new API, definer, invoker or explicit deny count');
 if(/^\s*GRANT\s/mi.test(sql)||/CREATE OR REPLACE FUNCTION/i.test(sql)||
    /^\s*(?:CREATE|ALTER)\s+(?:TABLE|POLICY|PUBLICATION|VIEW)\b/mi.test(sql))
  deny('unauthorized grant or object change');
 for(const name of R143_PROPOSED_MUTATIONS){
  required(sql,'CREATE FUNCTION forge_v3_api.'+name+'(',name+' missing API');
  required(sql,'CREATE FUNCTION forge_v3_internal.'+name+'(',name+' missing helper');
  const sec=privateSection(sql,name);
  required(sec,'forge_scene_drain.scene_v3_publish_allowed()',name+' gate');
  required(sec,'actor uuid:=auth.uid()',name+' signed actor');
  required(sec,'FOR UPDATE',name+' atomic row lock');
  if(!sec.includes('RETURN NULL'))deny(name+' missing denial path');
 }
 const character=privateSection(sql,'patch_authorized_character_v3');
 for(const token of [
  "public.is_campaign_member(item.campaign_id)",
  "public.can_edit_campaign_sheet(item.campaign_id,'character',p_character)",
  "item.updated_at IS DISTINCT FROM p_expected_updated_at",
  "f.field->>'type' IS DISTINCT FROM 'inventory'",
  "public.patch_campaign_sheet_noninventory(",
  "item.campaign_id,'character',p_character,p_values,'{}'::jsonb",
  "'changedKeys',keys",
  "'updatedAt',updated->>'updated_at"
 ])required(character,token,'character guarded field/owner or CAS '+token);
 if(character.includes('RETURN updated;')||
    character.includes("'fieldValues',updated->'field_values'"))
  deny('original full character source leaked');
 const handout=privateSection(sql,'edit_authorized_handout_v3');
 for(const token of [
  "public.is_campaign_dm(item.campaign_id)",
  "item.updated_at IS DISTINCT FROM p_expected_updated_at",
  "UPDATE public.campaign_handouts h SET",
  "'result','edited'",
  "p_revealed IS NULL",
  "pg_catalog.octet_length(p_body)>16000"
 ])required(handout,token,'DM update bound/shape missing '+token);
 if(handout.includes("'body',changed.body")||handout.includes("RETURN changed;"))
  deny('private handout body leaked in mutation receipt');
 const collect=privateSection(sql,'collect_authorized_pin_v3');
 for(const token of [
  "item.visible IS DISTINCT FROM TRUE",
  "item.collectable IS DISTINCT FROM TRUE",
  "public.is_campaign_member(item.campaign_id)",
  "public.can_view_campaign_map(item.campaign_id,item.map_id)",
  "public.collect_campaign_map_pin(p_pin)",
  "'handoutId',collected"
 ])required(collect,token,'collect authorization/original delegation missing '+token);
 required(sql,'R143 requires exactly 20 private + 20 API functions','postflight census');
 required(sql,'R143 inherited experimental API leaked EXECUTE','inherited deny');
 required(sql,'R143 original unsafe API/schema re-opened','legacy schema deny');
 return Object.freeze({
  workPackage:'B10-R18-143',sourceOnly:true,
  originalSignedAuthorizationVerified:false,
  newApiInvokers:3,privateDefiners:3,publicBrowserGrants:0,
  originalSelectedMutationBodiesInspected:true,
  inheritedR141ListenerCount:19,
  serverSideRevocationProven:false,releaseAuthorized:false,
  decision:'NO_GO'
 });
}
