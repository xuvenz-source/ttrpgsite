/**
 * R18-137 READ-ONLY source browser/API census. Not an AST, SQL migration
 * or authorization proof. Direct-call aliases, source-generated clients and
 * inherited/transitive access remain release blockers until human review.
 */
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';

export const R137_LIVE_ENABLED=false;
const extensions=new Set(['.js','.jsx','.mjs','.ts','.tsx']);
const patterns=Object.freeze([
 {kind:'rpc',pattern:/\b(?:db|supabase)\s*(?:\?\.)?\s*\.\s*rpc\s*\(\s*([^,\)\r\n]+)/g},
 {kind:'relation',pattern:/\b(?:db|supabase)\s*(?:\?\.)?\s*\.\s*from\s*\(\s*([^,\)\r\n]+)/g},
 {kind:'channel',pattern:/\b(?:db|supabase)\s*(?:\?\.)?\s*\.\s*channel\s*\(\s*([^,\)\r\n]+)/g},
 {kind:'apiSchema',pattern:/\b(?:db|supabase)\s*(?:\?\.)?\s*\.\s*schema\s*\(\s*([^,\)\r\n]+)/g},
 {kind:'storageBucket',pattern:/\b(?:db|supabase)\s*(?:\?\.)?\s*\.\s*storage\s*\.\s*from\s*\(\s*([^,\)\r\n]+)/g},
 {kind:'edgeFunction',pattern:/\b(?:db|supabase)\s*(?:\?\.)?\s*\.\s*functions\s*\.\s*invoke\s*\(\s*([^,\)\r\n]+)/g},
 {kind:'realtimePostgresChanges',pattern:/\.\s*on\s*\(\s*['"]postgres_changes['"]/g},
 {kind:'realtimeBroadcastListener',pattern:/\.\s*on\s*\(\s*['"]broadcast['"]/g}
]);
function sourceFiles(root,dir='src'){
 const folder=join(root,dir),out=[];
 for(const f of readdirSync(folder,{withFileTypes:true})){
  const p=join(dir,f.name);
  if(f.isSymbolicLink())throw Error('R137 source symlink refused: '+p);
  if(f.isDirectory())out.push(...sourceFiles(root,p));
  else if(f.isFile()&&extensions.has(extname(f.name)))out.push(p);
 }
 return out.sort();
}
function literal(expression){
 if(typeof expression!=='string')return null;
 const s=expression.trim();
 if(s.length<2)return null;
 const q=s[0];
 if(!["'",'"',String.fromCharCode(96)].includes(q)||s.at(-1)!==q)
  return null;
 const name=s.slice(1,-1);
 if(!name||name.includes('$'+'{')||name.includes('\\'))return null;
 return name;
}
function group(kind,target){
 if(kind.startsWith('realtime')||kind==='channel')return 'realtime-stream';
 if(kind==='storageBucket')return 'storage-art-bearer';
 if(kind==='edgeFunction')return 'edge-account';
 if(kind==='apiSchema')return 'api-transport';
 if(!target)return 'dynamic-unknown';
 if(kind==='relation'){
  if(/character|sheet|hotbar|macro|preference|inventory/.test(target))
   return 'characters-sheets-inventory';
  if(/campaign|map|npc|token|fog|environment/.test(target))
   return 'campaign-map-visibility';
  if(/chat|handout|pin|tool/.test(target))return 'chat-handouts-tools';
  return 'other-relation';
 }
 if(/world_|motion|navigation|trajectory/.test(target))
  return 'world-movement-authority';
 if(/fog|light|visibility|observer|scene/.test(target))
  return 'fog-sight-scene';
 if(/character|sheet|inventory|npc|token|monitor|encumbrance/.test(target))
  return 'characters-sheets-inventory';
 if(/campaign|combat|dice|roll|tool|macro|pin/.test(target))
  return 'campaign-combat-tools';
 return 'other-rpc';
}
const critical=Object.freeze({
 rpc:['get_world_scene_v2','get_world_observer_cursor_v2','get_world_visibility_v2',
  'begin_world_motion_v2','advance_world_motion_v2','commit_world_motion_v2'],
 relation:['campaigns','campaign_members','battle_maps','characters',
  'map_tokens','map_environments'],
 edgeFunction:['username-update']
});
export function censusBrowserRoutes({root=process.cwd(),liveCatalog}={}){
 const files=sourceFiles(root),rows=[];
 const sourceTextByPath=new Map();
 for(const path of files){
  const src=readFileSync(join(root,path),'utf8');
  sourceTextByPath.set(path,src);
  for(const {kind,pattern} of patterns){
   const rx=new RegExp(pattern.source,pattern.flags);
   for(let m;(m=rx.exec(src));){
    const expression=kind.startsWith('realtime')?null:(m[1]||'').trim();
    const target=expression===null?null:literal(expression);
    const prefix=src.slice(0,m.index);
    rows.push({
     path,line:prefix.split('\n').length,offset:m.index,kind,
     target,dynamic:expression!==null&&target===null,
     expression:expression?.slice(0,120)??null,
     group:group(kind,target),
     preview:src.slice(Math.max(0,m.index-60),Math.min(src.length,m.index+155))
      .replace(/\s+/g,' ').slice(0,205)
    });
    if(rx.lastIndex===m.index)rx.lastIndex++;
   }
  }
 }
 rows.sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line||a.offset-b.offset);
 const targets=kind=>[...new Set(rows.filter(x=>x.kind===kind&&x.target).map(x=>x.target))].sort();
 const staticTargets=Object.fromEntries(patterns.map(x=>[x.kind,targets(x.kind)]));
 // A wrapper may pass a constant to traceRpc(), while the direct db.rpc
 // invocation receives variable "name". Count those as indirect evidence,
 // never as proof that the actual RPC was authorized or reached.
 const criticalMissing=Object.entries(critical).flatMap(([kind,names])=>
  names.filter(name=>![...sourceTextByPath.values()].some(src=>
   src.includes("'"+name+"'")||src.includes('"'+name+'"')))
   .map(name=>kind+':'+name));
 const criticalNotDirect=Object.entries(critical).flatMap(([kind,names])=>
  names.filter(name=>!targets(kind).includes(name)).map(name=>kind+':'+name));
 const rpcSet=new Set(liveCatalog?.publicSqlFunctions?.map(x=>x.name)??[]);
 const relationSet=new Set(liveCatalog?.publicRelations?.map(x=>x.name)??[]);
 const categories=[...new Set(rows.map(x=>x.group))].sort();
 return Object.freeze({
  schema:1,workPackage:'B10-R18-137',release:'NO_GO',
  staticLexicalScanNotExhaustive:true,semanticAuthorizationNotReviewed:true,
  sourceFilesScanned:files.length,filesWithObservedAccess:new Set(rows.map(x=>x.path)).size,
  occurrenceCount:rows.length,dynamicCount:rows.filter(x=>x.dynamic).length,
  kindCounts:Object.fromEntries(patterns.map(x=>[x.kind,rows.filter(y=>y.kind===x.kind).length])),
  groupCounts:Object.fromEntries(categories.map(g=>[g,rows.filter(x=>x.group===g).length])),
  staticTargets,criticalMissing,criticalNotDirect,
  rpcMissingOriginalCatalog:liveCatalog?targets('rpc').filter(x=>!rpcSet.has(x)):null,
  relationMissingOriginalCatalog:liveCatalog?targets('relation').filter(x=>!relationSet.has(x)):null,
  blockers:[
   'Dynamic/alias/wrapped calls cannot be counted as reviewed API routes',
   'Source reachability and signed-user authorization were not tested',
   'Other Realtime/client/Edge/Storage and direct signed URL surfaces remain',
   'No old browser bundle can be authenticated by a JavaScript protocol flag',
   'No R128 public schema unseal or migration is approved',
   'All 67 public privileged SQL routines require individual semantic review'
  ],
  occurrences:rows
 });
}
export function censusSummary(v){
 return {
  files:v.sourceFilesScanned,filesWithAccess:v.filesWithObservedAccess,
  callSites:v.occurrenceCount,dynamic:v.dynamicCount,
  kinds:v.kindCounts,
  staticTargetCounts:Object.fromEntries(Object.entries(v.staticTargets)
   .map(([k,values])=>[k,values.length])),
  missingCritical:v.criticalMissing,
  onlyIndirectCritical:v.criticalNotDirect,
  missingLiveRpc:v.rpcMissingOriginalCatalog,
  missingLiveRelation:v.relationMissingOriginalCatalog,
  decision:'NO_GO'
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const opts=process.argv.slice(2);
 if(opts.some(o=>!o.startsWith('--json=')))throw Error('Invalid R137 argument');
 const catalogPath=join(process.cwd(),
  'staging/world-v2-b10-r18-137-v3-api-dependency-census/live-public-api-acl-snapshot.json');
 const catalog=JSON.parse(readFileSync(catalogPath,'utf8'));
 const result=censusBrowserRoutes({liveCatalog:catalog});
 if(result.criticalMissing.length)throw Error('Missing critical source usage: '+result.criticalMissing.join(','));
 const arg=opts.find(o=>o.startsWith('--json='));
 if(arg){
  const target=resolve(process.cwd(),arg.slice(7));
  const safeDir=resolve(process.cwd(),'staging')+'/';
  if(!target.startsWith(safeDir))throw Error('R137 JSON output must stay in staging/');
  writeFileSync(target,JSON.stringify(result,null,2)+'\n');
 }
 process.stdout.write(JSON.stringify(censusSummary(result),null,2)+'\n');
}
