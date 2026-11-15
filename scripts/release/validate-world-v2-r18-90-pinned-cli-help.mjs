/**
 * B10-R18-90: validate captured --help of the EXACT pinned Supabase CLI.
 * No process spawning, network access, SQL, credentials, GitHub API or writable
 * filesystem calls. This verifies CLI *syntax only*, NEVER linked history.
 */
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const VERSION='2.81.3';
const fail=(m)=>{throw Error('R90 CLI HELP NO-GO: '+m)};
const tasks=[
 ['fetchHelp','migration fetch',['linked']],
 ['listHelp','migration list',['linked']],
 ['pushHelp','db push',['linked','dry-run']],
 ['linkHelp','link',['project-ref']]
];
function textSafe(data,name){
 if(typeof data!=='string'||!data.trim()||data.length>32000||
  /[\0\x1b]/.test(data)||/(?:sb_secret_|sbp_[a-f0-9]|SUPABASE_ACCESS_TOKEN\s*=|postgres(?:ql)?:\/\/)/i.test(data))
  fail('invalid, unsafe or oversized '+name);
 return data.replace(/\r\n/g,'\n');
}
/** Pure parser. A green result proves command flags only, not CLI provenance. */
export function validateR90PinnedHelp({version,fetchHelp,listHelp,pushHelp,linkHelp}={}){
 if(typeof version!=='string'||version.trim()!==VERSION)
  fail('must use original pinned Supabase CLI 2.81.3, not v3 or latest');
 for(const [field,command,flags] of tasks){
  const help=textSafe({fetchHelp,listHelp,pushHelp,linkHelp}[field],field);
  if(!new RegExp('(?:^|\\n)\\s*supabase\\s+'+
     command.replace(/ /g,'\\s+')+'\\s+(?:\\[|<|$)','im').test(help))
    fail('unexpected command usage in '+field);
  for(const flag of flags){
   if(!new RegExp('(?:^|\\s)--'+flag+'(?=\\s|[,=]|$)','m').test(help))
    fail('missing pinned v2 flag --'+flag+' in '+field);
  }
 }
 return Object.freeze({
  workPackage:'B10-R18-90',decision:'NO_GO',
  testedVersion:VERSION,helpSurfacesChecked:4,
  originalLinkedTargetSyntaxPresent:true,
  dryRunFlagPresent:true,readOnlyCliHelpValidated:true,
  authenticatedLinkedCliExecuted:false,
  historicalSqlBodiesFetched:false,
  original83Plus8OfficialDryRunPerformed:false,
  qaBackendIndependentlyIsolated:false,
  productionReleaseAuthorized:false
 });
}

function fileArg(name){
 const args=process.argv.slice(2).filter(x=>x.startsWith('--'+name+'='));
 if(args.length!==1||args[0].slice(name.length+3).trim()==='')
  fail('exactly one file argument required: '+name);
 const filename=resolve(args[0].slice(name.length+3));
 const info=lstatSync(filename);
 if(!info.isFile()||info.isSymbolicLink()||info.size>32000)
  fail('regular small file required: '+name);
 return readFileSync(filename,'utf8');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const names=['version-file','fetch-help','list-help','push-help','link-help'];
  if(process.argv.length!==2+names.length||process.argv.slice(2).some(x=>
    !names.some(k=>x.startsWith('--'+k+'='))))fail('exact five help/version files required');
  const result=validateR90PinnedHelp({
   version:fileArg('version-file'),
   fetchHelp:fileArg('fetch-help'),
   listHelp:fileArg('list-help'),
   pushHelp:fileArg('push-help'),
   linkHelp:fileArg('link-help')
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
