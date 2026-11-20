/**
 * B10-R18-139 — exact browser-source route inventory, NOT authorization.
 * Fails on unreviewed changes in these high-risk indirect gameplay callers.
 * Does not create or grant a V3 route, migrate data, or touch src/.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildDynamicRouteReview} from
 '../world-v2-b10-r18-138-primary-v3-facade/DynamicRouteReview.mjs';

export const R139_LIVE_ENABLED=false;
export const contracts=Object.freeze([
 {
  id:'gesture-session',file:'src/engine/v2/AuthorityClient.js',
  scanner:'traceRpc',dynamicKey:'src/engine/v2/AuthorityClient.js:25:rpc',
  expected:['begin_world_motion_v2','advance_world_motion_v2',
   'commit_world_motion_v2','cancel_world_motion_v2','finalize_world_motion_v2'],
  absentOriginal:['finalize_world_motion_v2'],
  actorBoundary:'Signed user, map, piece ownership, session, sequence, collision',
  gaps:['No original finalize RPC: atomic terminal must NOT be enabled',
   'V3 begin/advance/commit/cancel remain EXECUTE-revoked',
   'No rapid-gesture signed P1/P2/DM test or latency proof']
 },
 {
  id:'viewer-and-dm-preview',file:'src/engine/v2/VisibilityController.js',
  scanner:'namedVisibility',dynamicKey:'src/engine/v2/VisibilityController.js:136:rpc',
  expected:['get_world_visibility_v2','preview_world_visibility_v2',
   'preview_world_visibility_at_v2'],
  absentOriginal:[],
  actorBoundary:'Server-derived user sight; DM-only preview; never client-asserted isDM',
  gaps:['Two preview modes not in R138 seven-function facade',
   'Preview viewer and token IDs require server-authorized DM scope',
   'No real original LOS or cross-user signed tests']
 },
 {
  id:'viewer-light-masks',file:'src/useAuthorizedMapLights.js',
  scanner:'lightLiterals',dynamicKey:'src/useAuthorizedMapLights.js:19:rpc',
  expected:['get_authorized_map_light_masks','get_authorized_map_light_masks_v2'],
  absentOriginal:[],
  actorBoundary:'Signed map/viewer light mask; no legacy global revision fallback',
  gaps:['No V3 lighting contract; V2 revision and LOS behavior unproven',
   'Legacy fallback must be removed in a future reviewed V3 client']
 },
 {
  id:'combat-actions',file:'src/useMapCombat.js',
  scanner:'invoke',dynamicKey:'src/useMapCombat.js:77:rpc',
  expected:['begin_map_combat','add_map_combat_tokens',
   'roll_map_combat_initiative','roll_map_npc_initiative','command_map_combat'],
  absentOriginal:[],
  actorBoundary:'Server-side campaign DM role, map and private combat entry scopes',
  gaps:['UI isDM flag is not trusted authorization',
   'DM direct map_combat_entries read remains blocked by R128',
   'No command-specific signed tests; no generic name forwarding']
 },
 {
  id:'fog-private-delta',file:'src/useAuthorizedMapFog.js',
  scanner:'directDbRpc',dynamicKey:null,
  expected:['get_authorized_map_fog_delta','get_authorized_map_fog_v2',
   'get_authorized_map_fog'],
  absentOriginal:[],
  actorBoundary:'Per-viewer fog epoch, replay protection, current recipient membership',
  gaps:['Legacy global fallback exists in src but is forbidden on V3',
   'Current V3 facade lacks fog and delta endpoints',
   'Postgres Changes old sockets and DELETE handling unverified']
 },
 {
  id:'inventory-source-mapping',file:'src/useCampaignSheetInventory.js',
  scanner:'inventoryRelations',
  dynamicKey:'src/useCampaignSheetInventory.js:34:relation',
  expected:['characters','npc_templates','map_tokens'],
  absentOriginal:[],
  actorBoundary:'Individual character or NPC item ownership and DM-only stats projection',
  gaps:['Source mapping is not row or field authorization',
   'Original authenticated map_tokens SELECT not granted',
   'No V3 source-specific bounded inventory facade']
 }
]);
Object.freeze(contracts);

function targets(scanner,source){
 let pattern;
 switch(scanner){
  case 'traceRpc':pattern=/traceRpc\(db,'([^']+)'/g;break;
  case 'namedVisibility':pattern=/name:'(get_world_visibility_v2|preview_world_visibility(?:_at)?_v2)'/g;break;
  case 'lightLiterals':pattern=/'(get_authorized_map_light_masks(?:_v2)?)'/g;break;
  case 'invoke':pattern=/invoke\('(begin_map_combat|add_map_combat_tokens|roll_map_combat_initiative|roll_map_npc_initiative|command_map_combat)'/g;break;
  case 'directDbRpc':pattern=/db\.rpc\('(get_authorized_map_fog_delta|get_authorized_map_fog_v2|get_authorized_map_fog)'/g;break;
  case 'inventoryRelations':
   // Dynamic relation is only allowed to map to the source-keyed table set;
   // no row/field authorization is inferred from this finding.
   return ['characters','npc_templates','map_tokens'].filter(n=>
    new RegExp("['\"]"+n+"['\"]").test(source));
  default:throw Error('Unknown R139 source scanner');
 }
 return [...new Set([...source.matchAll(pattern)].map(x=>x[1]))].sort();
}
function sorted(v){return [...v].sort();}
function equalSets(actual,expected,label){
 if(JSON.stringify(sorted(actual))!==JSON.stringify(sorted(expected)))
  throw Error('R139 exact route contract drift: '+label+
   '\nactual='+JSON.stringify(actual)+'\nexpected='+JSON.stringify(expected));
}
export function auditGameplayContracts({root=process.cwd()}={}){
 const review=buildDynamicRouteReview({root});
 if(review.count!==26||review.missingManualReviews!==0||
  review.fullyAuthorized!==0)
  throw Error('R139 inherited R138 source boundary drift');
 const keys=new Set(review.rows.map(r=>r.key));
 const observations=[];
 for(const c of contracts){
  if(c.dynamicKey&&!keys.has(c.dynamicKey))
   throw Error('R139 unrecognized dynamic producer: '+c.dynamicKey);
  const source=readFileSync(join(root,c.file),'utf8');
  const actual=targets(c.scanner,source);
  equalSets(actual,c.expected,c.id);
  if(!c.actorBoundary||!c.gaps.length)
   throw Error('R139 incomplete actor/denial review: '+c.id);
  observations.push(Object.freeze({
   id:c.id,source:c.file,observed:actual,actorBoundary:c.actorBoundary,
   authorizationProved:false,publicExecutable:false,
   gate:'BLOCKED_SIGNED_ACTOR_QA',gaps:c.gaps
  }));
 }
 const r132=readFileSync(join(root,
  'staging/world-v2-b10-r18-132-scene-publisher-drain/unapplied-scene-publication-drain.sql'),'utf8');
 const r138=readFileSync(join(root,
  'staging/world-v2-b10-r18-138-primary-v3-facade/unapplied-closed-world-v3-facade.sql'),'utf8');
 if(!/FOR SHARE\s*;/i.test(r132)||
  /FOR UPDATE\s*;/i.test(r132)||
  (r138.match(/forge_scene_drain\.scene_v3_publish_allowed\(\)/g)||[]).length<3)
  throw Error('R139 gate-lock assumption invalidated: review required');
 if((r138.match(/^REVOKE ALL ON FUNCTION forge_v3_api\./gm)||[]).length!==7)
  throw Error('R139 inherited seven-facade deny invariant drifted');
 if((r138.match(/^GRANT EXECUTE ON FUNCTION\s+/gm)||[]).length!==1)
  throw Error('R139 inherited privilege scope drifted');
 return Object.freeze({
  schema:1,workPackage:'B10-R18-139',decision:'NO_GO',
  originalSignedDbTestsPerformed:false,sourceOnly:true,
  r138DynamicClassified:26,r139ExactCallsiteGroups:observations.length,
  candidateBrowserGrantsAdded:0,
  postgresLockSemantics:'FOR SHARE readers compatible; UPDATE fence transition may wait',
  lockPerformanceOnFreeTier:'UNMEASURED',
  transitiveGameplayScopeComplete:false,contracts:observations
 });
}
