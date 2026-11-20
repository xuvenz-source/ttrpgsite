/**
 * B10-R18-144: exact-browser-source mutation migration census.
 * SOURCE ONLY. Not an adapter, no mutation executed, no client switch.
 * A missing mapping must stop the V3 release rather than silently drop data.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {auditR143} from
 '../world-v2-b10-r18-143-narrow-mutation-contracts/MutationContractAudit.mjs';

export const R144_LIVE_ENABLED=false;
const block=(why)=>{throw Error('R144 fail-closed compatibility drift: '+why)};
function check(text,needle,name){if(!text.includes(needle))block(name)}
export const R144_REQUEST_CONTRACTS=Object.freeze([
 {client:'character-auto-save',caller:'src/TabletopApp.jsx',
  existing:'patch_campaign_sheet_noninventory',
  required:['non-inventory field patch','name metadata','ordered autosaves',
   'return full character state or re-read'],
  covered:['non-inventory field patch'],
  status:'BLOCKED_NAME_AND_REHYDRATION'},
 {client:'npc-editor',caller:'src/TabletopApp.jsx',
  existing:'patch_campaign_sheet_noninventory',
  required:['npc_template branch','npc_token branch','name','art','bars_public',
   'private DM sheet values'],
  covered:[],status:'BLOCKED_NO_NPC_MUTATION_API'},
 {client:'handout-author',caller:'src/useCampaignHandouts.js',
  existing:'direct table update',
  required:['create','update','delete','folder CRUD','pin CRUD',
   'return complete note after write'],
  covered:['update text, title and revealed only'],
  status:'BLOCKED_INCOMPLETE_DM_CRUD'},
 {client:'handout-collect',caller:'src/useCampaignHandouts.js',
  existing:'collect_campaign_map_pin',
  required:['return UUID or update adapter','refresh visible list',
   'same actor/map checks','idempotent repeated collect'],
  covered:['same actor/map checks'],
  status:'BLOCKED_RETURN_TYPE_AND_IDEMPOTENCY'},
 {client:'inventory-editor',caller:'src/useCampaignSheetInventory.js',
  existing:'get_campaign_sheet_inventory and direct table SELECT',
  required:['handle mutating read normalization','owner and template and token routes',
   'cross-client inventory locking and per-item identity'],
  covered:[],status:'BLOCKED_MUTATING_READ_AND_PRIVATE_RETRIEVAL'}
]);
export function auditR144({root=process.cwd()}={}){
 const read=p=>readFileSync(join(root,p),'utf8');
 const inherited=auditR143({root});
 if(inherited.decision!=='NO_GO'||inherited.privateDefiners!==3)
   block('inherited R143 exact authorizations');
 const main=read('src/TabletopApp.jsx');
 const handouts=read('src/useCampaignHandouts.js');
 const inventory=read('src/useCampaignSheetInventory.js');
 const r142=read('staging/world-v2-b10-r18-142-projected-read-api/unapplied-private-projected-read-v3.sql');
 const r143=read('staging/world-v2-b10-r18-143-narrow-mutation-contracts/unapplied-closed-mutation-v3.sql');
 const manifest=JSON.parse(read(
  'staging/world-v2-b10-r18-144-mutation-cas-client-compat/manifest.json'));
 if((main.match(/db\.rpc\('patch_campaign_sheet_noninventory'/g)||[]).length!==1||
    (main.match(/'patch_campaign_sheet_noninventory'/g)||[]).length!==2)
   block('exact character+NPC existing sheet RPC count');
 for(const term of [
  "p_source:'character'","p_meta:{name:snapshot.name}",
  "sheetWriteQueue.current.then(","p_source:record.kind==='template'?'npc_template':'npc_token'",
  "bars_public:draft.barsPublic","portrait_path:draft.portraitPath"
 ])check(main,term,'existing autosave/NPC branch '+term);
 for(const term of [
  "const createHandout=","const updateHandout=","const deleteHandout=",
  "const createPin=","const updatePin=","const deletePin=",
  "const collectPin=","const createFolder=","const renameFolder=",
  "const deleteFolder=","db.rpc('collect_campaign_map_pin'"
 ])check(handouts,term,'handout CRUD '+term);
 for(const term of [
  "db.rpc('get_campaign_sheet_inventory',args)",
  "db.from(target.table).select(target.column)"
 ])check(inventory,term,'inventory legacy '+term);
 for(const term of [
  "item.updated_at IS DISTINCT FROM p_expected_updated_at",
  "updated:=public.patch_campaign_sheet_noninventory(",
  "p_values,'{}'::jsonb",
  "collected:=public.collect_campaign_map_pin(p_pin)"
 ])check(r143,term,'R143 candidate '+term);
 for(const term of [
  "'fieldValues'","'updatedAt'",
  "CREATE FUNCTION forge_v3_internal.get_authorized_character_sheet_v3",
  "CREATE FUNCTION forge_v3_internal.get_authorized_handout_v3"
 ])check(r142,term,'R142 read projection '+term);
 if(/revision_counter|expected_revision|mutation_revision/.test(r143))
   block('R143 revision token contract changed: re-review risk assumptions');
 if(manifest.workPackage!=='B10-R18-144'||manifest.parentPr!==251||
    manifest.parentSha!=='123a4e7ad1ce179d3b2de0690c6f8a1ee296bfbd'||
    manifest.decision!=='NO_GO'||manifest.productionReleaseAuthorized!==false||
    manifest.runtimeSourceModified!==false)
   block('handoff not exact parent/source-only');
 const result=R144_REQUEST_CONTRACTS.map(row=>Object.freeze({
  ...row,required:[...row.required],covered:[...row.covered],
  v3ClientWired:false,releaseReady:false
 }));
 return Object.freeze({
  package:'B10-R18-144',decision:'NO_GO',
  sourceOnly:true,clientIntegrationDone:false,
  reviewedClientFlows:result.length,
  originalMutationSqlRecognized:true,
  timestampCASMonotonicProven:false,
  sameTransactionStaleCASRisk:true,
  doubleCollectEventRisk:true,
  unmappedMetadataAndNpcChanges:true,
  signedStorageBearerRevoked:false,
  oldSocketsServerEjected:false,
  actualSignedDmPlayerQaComplete:false,
  productionReleaseAuthorized:false,contracts:result
 });
}
