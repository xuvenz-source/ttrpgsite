/**
 * R18-130 SOURCE-ONLY inventory of every Postgres Changes listener under src/.
 * No network, database, writes or client runtime hooks. Not an RLS simulator.
 */
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
export const R130_LIVE_ENABLED=false;
const SUBSCRIPTION=/\.on\s*\(\s*(['"\x60])postgres_changes\1\s*,\s*\{([\s\S]*?)\}\s*,/g;
const ENTRY=/\.on\s*\(\s*['"\x60]postgres_changes['"\x60]/g;
const property=(object,key)=>{
 const m=object.match(new RegExp('(?:^|[,\\s])'+key+'\\s*:\\s*([\\x27\\x22])([^\\x27\\x22]+)\\1'));
 return m?.[2]??null;
};
const tableValue=object=>{
 const v=property(object,'table');
 if(v)return {table:v,expression:'literal'};
 const m=object.match(/(?:^|[,\s])table\s*:\s*([A-Za-z_$][\w$.]*)/);
 return m?{table:m[1],expression:'dynamic'}:{table:null,expression:'missing'};
};
function files(path){
 const out=[];
 for(const entry of readdirSync(path,{withFileTypes:true})){
  const next=join(path,entry.name);
  if(entry.isDirectory())out.push(...files(next));
  else if(entry.isFile()&&/\.(?:jsx?|mjs)$/.test(entry.name))out.push(next);
 }
 return out;
}
export function extractSubscriptionsFromSource(content,file){
 if(typeof content!=='string'||typeof file!=='string')throw Error('R130 invalid source input');
 const parsed=[...content.matchAll(SUBSCRIPTION)],raw=[...content.matchAll(ENTRY)];
 if(parsed.length!==raw.length)
  throw Error('R130 unparsed postgres_changes call in '+file+': '+parsed.length+'/'+raw.length);
 return parsed.map(match=>{
  const object=match[2],table=tableValue(object);
  const line=content.slice(0,match.index).split('\n').length;
  const event=property(object,'event'),schema=property(object,'schema');
  if(!schema||!event||!table.table||!['*','INSERT','UPDATE','DELETE'].includes(event))
   throw Error('R130 unrecognized Postgres Changes options '+file+':'+line);
  if(table.expression==='dynamic'&&!(file==='src/useCampaignSheetInventory.js'&&
     table.table==='target.table'))
   throw Error('R130 unreviewed dynamic subscription '+file+':'+line);
  const hasFilter=/(?:^|[,\s])filter\s*:/.test(object);
  const hasSelect=/(?:^|[,\s])select\s*:/.test(object);
  return Object.freeze({file,line,table:table.table,
   tableExpression:table.expression,schema,event,hasFilter,hasSelect,
   includesDelete:event==='*'||event==='DELETE'});
 });
}
export function scanRealtimeSubscriptions(root){
 if(!root||typeof root!=='string')throw Error('R130 missing repository root');
 const all=[];
 for(const absolute of files(join(root,'src'))){
  const file=relative(root,absolute).split(sep).join('/');
  all.push(...extractSubscriptionsFromSource(readFileSync(absolute,'utf8'),file));
 }
 return all.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line);
}
const key=s=>[s.file,s.schema,s.table,s.tableExpression,s.event,
 s.hasFilter?'filter':'unfiltered',s.hasSelect?'projection':'full-row'].join('|');
export function compareSubscriptionBaselines(actual,expected,publishedTables){
 const problems=[];
 if(!Array.isArray(actual)||!Array.isArray(expected)||
  !Array.isArray(publishedTables))return Object.freeze({
   status:'UNVERIFIED',problems:['invalid_arguments'],releaseAuthorized:false});
 const known=new Set(publishedTables),needed=new Map();
 for(const x of expected){
  if(!x||typeof x!=='object')return Object.freeze({
   status:'UNVERIFIED',problems:['invalid_expected_record'],releaseAuthorized:false});
  const k=key(x);needed.set(k,(needed.get(k)||0)+1);
 }
 for(const x of actual){
  if(!x||typeof x!=='object'){problems.push('invalid_subscription_record');continue;}
  if(x.schema!=='public')problems.push('non_public_schema');
  if(!known.has(x.table)&&!(x.file==='src/useCampaignSheetInventory.js'&&
    x.table==='target.table'&&x.tableExpression==='dynamic'))
   problems.push('unpublished_or_unknown_table');
  const k=key(x);const remaining=needed.get(k)||0;
  if(remaining<1)problems.push('unexpected_subscription:'+k);
  else needed.set(k,remaining-1);
 }
 for(const [k,count] of needed)if(count>0)problems.push('missing_subscription:'+k+':'+count);
 return Object.freeze({
  status:problems.length?'SUBSCRIPTION_DRIFT_NO_GO':'SOURCE_PARITY_NO_GO',
  problems:Object.freeze(problems),
  counts:Object.freeze({handlers:actual.length,
   files:new Set(actual.filter(x=>x&&typeof x==='object').map(x=>x.file)).size,
   deleteCapable:actual.filter(x=>x&&x.includesDelete).length,
   dynamicTableBindings:actual.filter(x=>x&&x.tableExpression==='dynamic').length}),
  releaseAuthorized:false,postgresChangesRevocationProven:false,socketEjectionProven:false
 });
}
