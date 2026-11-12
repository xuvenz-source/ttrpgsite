/**
 * R18-23: fail-closed verifier for two freshly captured READ-ONLY live SQL
 * results (83 historical body digests and the R18-23 catalog SELECT).
 * It does not connect to Supabase, sign in, run migrations or approve a release.
 * JSON evidence can be forged: this only checks consistency, NOT provenance.
 */
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PROJECT='lwhwgqaunxbmvyndswze';
const VERSION='20261111023204';
const baseline=JSON.parse(readFileSync(new URL(
 '../../staging/world-v2-b10-r18-08-remote-history-content-hashes.json',
 import.meta.url),'utf8')).rows;
const fail=reason=>{throw new Error('R18-23 NO-GO: '+reason)};
const exact={
 history_count:83,latest_version:'20261109171247',r05_registered:false,
 functions_expected:7,functions_present:7,functions_matched:7,
 active_unexpired_sessions:0,b07_pending_installed:false,
 b07_budget_installed:false,r05_backup_installed:false,
 b03_path_installed:false,b08_drain_installed:false,b08_extra_columns:0,
 anon_private_schema_usage:false,auth_private_schema_usage:false,
 anon_advance_execute:false,auth_advance_execute:true,
 private_rls_disabled:0,direct_client_select_tables:0,
 checked_rpc_count:7,present_rpc_count:7,anon_executable_rpc_count:0
};
const historyFields=['version','name','statement_count','fetched_sql_md5'];
export function validateR1823ReadOnlyEvidence(evidence,{now=new Date()}={}){
 if(evidence?.projectRef!==PROJECT)fail('wrong or missing project ref');
 const capture=Date.parse(evidence.observedAt??'');
 const age=now.getTime()-capture;
 if(!Number.isFinite(capture)||age<0||age>30*60*1000)
  fail('capture time missing, future, or older than 30 minutes');
 const rows=evidence.historyRows;
 if(!Array.isArray(rows)||rows.length!==baseline.length||rows.length!==83)
  fail('history must contain exactly 83 independent remote SQL hashes');
 for(let i=0;i<baseline.length;i++){
  const row=rows[i], expected=baseline[i];
  if(!row||historyFields.some(k=>row[k]!==expected[k]))
   fail('remote migration version/name/body mismatch at row '+(i+1));
 }
 if(rows.some(r=>r.version===VERSION))fail('frozen R05 already registered');
 const catalog=Array.isArray(evidence.catalogRows)&&
  evidence.catalogRows.length===1?evidence.catalogRows[0]:null;
 if(!catalog||typeof catalog!=='object')
  fail('exactly one R18-23 catalog row is required');
 for(const [key,value] of Object.entries(exact)){
  if(catalog[key]!==value)fail('protected live catalog mismatch: '+key);
 }
 if(!Number.isInteger(catalog.private_table_count)||
    catalog.private_table_count<6)
  fail('missing expected private World V2 tables');
 return Object.freeze({
  decision:'NO_GO',safeToApply:false,
  projectRef:PROJECT,historyDigestMatches:83,
  protectedFunctionSourceMatches:7,privateTableRlsAndDirectAclBaseline:true,
  liveCatalogReadOnlyAttestationPassed:true,
  linkedCliFetchAndDryRunProven:false,
  independentDmP1PassiveP2AuthProven:false,
  websocketRevocationAndFogSecurityProven:false,
  frontendDeploymentApproved:false,sqlInstallationApproved:false
 });
}
function main(){
 const args=process.argv.slice(2);
 if(args.length!==1||!args[0].startsWith('--evidence='))
  fail('provide only --evidence=<external-json-file>');
 const file=resolve(args[0].slice('--evidence='.length));
 const rootPrefix=ROOT+sep;
 if(file===ROOT||file.startsWith(rootPrefix))
  fail('fresh evidence must stay outside the Git checkout');
 if(!lstatSync(file).isFile()||realpathSync(file)!==file||
    lstatSync(file).size>80000)
  fail('evidence must be a small, non-symlinked external file');
 const payload=JSON.parse(readFileSync(file,'utf8'));
 process.stdout.write(JSON.stringify(validateR1823ReadOnlyEvidence(payload),null,2)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){
  // Do not print supplied JSON, SQL, account IDs or any CLI credentials.
  process.stderr.write((e.message.startsWith('R18-23 NO-GO:')
   ?e.message:'R18-23 NO-GO: invalid evidence file')+'\n');
  process.exitCode=1;
 }
}
