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
 // Populated from actual R137 GitHub Actions evidence, never guessed.
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
  nonexhaustiveSourceScanner:true,
  oldPublicSchemaMayReopen:false,
  rows
 };
}
