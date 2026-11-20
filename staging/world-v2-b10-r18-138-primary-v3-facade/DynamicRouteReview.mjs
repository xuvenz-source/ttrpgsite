/**
 * R18-138 read-only evidence extraction for all R137 dynamic direct client
 * call-sites. This is a reviewer aid, NOT an automatic authorization engine.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {censusBrowserRoutes} from
 '../world-v2-b10-r18-137-v3-api-dependency-census/BrowserApiRouteCensus.mjs';

export const R138_LIVE_ENABLED=false;
const explicit=new Map([
 ["src/engine/v2/AuthorityClient.js:25:rpc",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"world-authority","evidence":"4 member-owned V2 session RPCs plus optional finalize referenced in module; finalizer absent from live original; NO generic RPC grant","boundary":"server-actor-session","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/engine/v2/RealtimeTransport.js:369:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"private-observer-v2","evidence":"worldObserverTopic(mapId,viewerId) old signed V2; replace only with R135 epoch channel, old socket cutoff unproved","boundary":"realtime-old-socket","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/engine/v2/SceneTransport.js:85:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"map-wide-scene-v2","evidence":"worldSceneTopic(mapId) shared scene, old joined sockets survive RLS change; R126/132 private replacement","boundary":"realtime-old-socket","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/engine/v2/VisibilityController.js:136:rpc",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"world-visibility","evidence":"3 named RPC routes from fetchFrame; DM preview routes must remain DM-only, no player-provided viewer override","boundary":"server-actor-sight","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/PersonalTokenLibrary.jsx:41:storageBucket",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"personal-private-storage","evidence":"LIBRARY_BUCKET constant personal-token-art; upload requires owner path and signed actor","boundary":"storage-bearer","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/PersonalTokenLibrary.jsx:63:storageBucket",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"personal-private-storage","evidence":"LIBRARY_BUCKET personal-token-art; download owner-only signed path","boundary":"storage-bearer","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/PersonalTokenLibrary.jsx:70:storageBucket",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"campaign-private-storage","evidence":"CAMPAIGN_BUCKET tabletop-artwork; upload/revoke signed campaign membership","boundary":"storage-bearer","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/PersonalTokenLibrary.jsx:126:storageBucket",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"campaign-private-storage","evidence":"CAMPAIGN_BUCKET tabletop-artwork; campaign art copy requires source ownership and current membership","boundary":"storage-bearer","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/PersonalTokenLibrary.jsx:154:storageBucket",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"personal-private-storage","evidence":"LIBRARY_BUCKET personal-token-art; verify owner before read/delete","boundary":"storage-bearer","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/SignedAssetUrls.js:8:storageBucket",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"caller-supplied-bucket","evidence":"Bucket function argument spans multiple private buckets, signed URL 3600 seconds still accessible after revoke","boundary":"storage-bearer","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/TabletopApp.jsx:1065:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"campaign-routing","evidence":"vtt-routing-<campaign> Broadcast & Postgres Changes; old joined subscribers and recipient metadata unproved","boundary":"realtime-old-socket","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/TabletopApp.jsx:1103:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"map-measurement","evidence":"movementTopic(selectedMap); broadcasts map measurement, map scoped and old channel still active","boundary":"realtime-old-socket","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/TabletopApp.jsx:1215:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"legacy-observer-motion","evidence":"observerMotionTopic(mapId,user); V2 observer topic must be replaced with R135 recipient epoch","boundary":"realtime-old-socket","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/TabletopApp.jsx:1452:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"campaign-global-realtime","evidence":"vtt-<campaign>; multiple Postgres Changes subscriptions and potentially sensitive rows","boundary":"realtime-pg-changes","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/TabletopApp.jsx:1536:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"campaign-chat-realtime","evidence":"vtt-chat-<campaign>; access and old joined chat subscriptions need independent review","boundary":"realtime-pg-changes","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/TabletopApp.jsx:1563:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"campaign-roster-realtime","evidence":"vtt-roster-<campaign>; membership revocation and map assignment visibility","boundary":"realtime-pg-changes","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/useAuthorizedMapFog.js:144:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"viewer-fog-legacy","evidence":"forge-visibility map + actor with optional -viewer suffix; Postgres Changes global fallback must retire","boundary":"realtime-pg-changes","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/useAuthorizedMapLights.js:19:rpc",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"viewer-light-masks","evidence":"Only get_authorized_map_light_masks_v2 or legacy get_authorized_map_light_masks by protocolVersion; no fallback in V3","boundary":"server-actor-sight","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/useCampaignHandouts.js:51:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"handout-notices","evidence":"forge-handouts campaign+user; recipient-specific content needs current membership and original content RLS","boundary":"realtime-pg-changes","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/useCampaignPresence.js:21:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"campaign-presence","evidence":"vtt-presence campaign; presence uses hashed key but may reveal member activity, require signed campaign membership","boundary":"realtime-presence","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/useCampaignSheetInventory.js:34:relation",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"inventory-source-table","evidence":"Exact sources mapping character->characters, npc_template->npc_templates, npc_token->map_tokens; direct player NPC stats forbidden","boundary":"sheet-private-projection","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/useCampaignSheetInventory.js:62:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"inventory-lease-updates","evidence":"forge-sheet-grid source/field/user; Postgres Changes for dynamic table plus leases need owner/DM scope","boundary":"realtime-pg-changes","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/useCampaignToolCollaboration.js:30:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"dm-tool-claims","evidence":"forge-tool-item-claims issue+user; claim holder and private tool state require role-scoped notification","boundary":"realtime-pg-changes","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/useCampaignTools.js:114:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"dm-tool-events","evidence":"forge-tools campaign+user; DM tools & recipient-specific events, old socket reauthorization","boundary":"realtime-pg-changes","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/useMapCombat.js:58:channel",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"initiative-updates","evidence":"initiative map+user; public map combat + visibility ticks and private DM combat mapping","boundary":"realtime-pg-changes","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})],
 ["src/useMapCombat.js:77:rpc",Object.freeze({"state":"SOURCE_CLASSIFIED_NO_AUTHORIZATION","route":"combat-command","evidence":"Exactly five action wrappers invoke 5 combat write RPCs by name, plus direct get_authorized_map_combat; do not expose arbitrary name","boundary":"server-combat-action","authorizationProved":false,"safeToExpose":false,"requiresSignedQa":true})]
]);
const risky=/\b(?:name|table|bucket|topic|channel|args|config|kind|type|resource)\b/i;
export function buildDynamicRouteReview({root=process.cwd(),catalog}={}){
 const live=catalog??JSON.parse(readFileSync(join(root,
  'staging/world-v2-b10-r18-137-v3-api-dependency-census/live-public-api-acl-snapshot.json'),'utf8'));
 const scanned=censusBrowserRoutes({root,liveCatalog:live});
 const originalNames=new Set(live.publicSqlFunctions.map(v=>v.name));
 const rows=scanned.occurrences.filter(row=>row.dynamic).map((row,index)=>{
  const key=row.path+':'+row.line+':'+row.kind;
  const file=readFileSync(join(root,row.path),'utf8');
  const localOriginalCandidates=[...originalNames].filter(n=>
   file.includes("'"+n+"'")||file.includes('"'+n+'"')).sort();
  const found=explicit.get(key);
  return {
   id:index+1,key,path:row.path,line:row.line,kind:row.kind,
   expression:row.expression,group:row.group,
   candidatesInSameFile:row.kind==='rpc'?localOriginalCandidates:[],
   sourceSnippet:row.preview,
   review:found??{
    state:'UNREVIEWED',candidateClass:row.kind==='rpc'?'indirect-rpc':
      row.kind==='relation'?'dynamic-table':
      row.kind==='channel'?'realtime-topic':
      row.kind==='storageBucket'?'signed-storage-bucket':'other',
    authorizationProved:false,safeToExpose:false,
    note:risky.test(row.expression||'')?
     'dynamic identifier; verify producer and actor binding first':
     'derive actual call target from caller/dataflow before migration'
   }
  };
 });
 return {
  schema:1,workPackage:'B10-R18-138',release:'NO_GO',count:rows.length,
  baselineR137Dynamic:26,
  missingManualReviews:rows.filter(row=>row.review.state==='UNREVIEWED').length,
  fullyAuthorized:0,
  sourceClassified:rows.filter(row=>row.review.state==='SOURCE_CLASSIFIED_NO_AUTHORIZATION').length,
  sourceClassificationLedgerKeys:explicit.size,
  unobservedLedgerKeys:[...explicit.keys()].filter(key=>!rows.some(row=>row.key===key)),
  nonexhaustiveSourceScanner:true,
  oldPublicSchemaMayReopen:false,
  rows
 };
}
