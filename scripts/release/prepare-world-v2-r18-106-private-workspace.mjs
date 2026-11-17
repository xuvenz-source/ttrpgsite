/**
 * R18-106 operator-local PRIVATE ORIGINAL history workspace scaffolder.
 *
 * Creates empty private LOCAL directories and safe config only. It does not
 * authenticate, set project-ref, link, fetch, execute SQL, connect to either
 * project, copy user data or approve a release.
 *
 * Operator must run pinned Supabase CLI v2.81.3 link privately afterward,
 * verify original project-ref, then use the existing R18-98 fetch helper.
 * NEVER run in CI or within a Git checkout or shared/synced folder.
 */
import {mkdirSync,writeFileSync,lstatSync,existsSync,realpathSync} from 'node:fs';
import {resolve,isAbsolute,basename,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR98Environment} from './validate-world-v2-r18-98-private-history.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGINAL='lwhwgqaunxbmvyndswze';
const QA='bgydsamxypjslergfpla';
const fail=s=>{throw Error('R106 PRIVATE WORKSPACE NO-GO: '+s)};
const inside=(p,q)=>q===p||q.startsWith(p+sep);
const config='[db.migrations]\nenabled = true\n\n[db.seed]\nenabled = false\n';
export function prepareR106PrivateWorkspace({
 workspace,repoRoot=ROOT,env=process.env
}={}){
 validateR98Environment(env);
 if(env.SUPABASE_PROJECT_ID===QA||env.PROJECT_ID===QA||
    env.GITHUB_ACTIONS||env.CI||env.VERCEL)
  fail('no QA target or CI context permitted');
 if(typeof workspace!=='string'||!isAbsolute(workspace)||
   !/^r106-original-83-[a-z0-9-]{1,40}$/.test(basename(workspace)))
  fail('workspace must be a new private absolute r106-original-83-... path');
 const root=realpathSync(resolve(repoRoot));
 const target=resolve(workspace);
 const parent=resolve(dirname(target));
 if(inside(root,target)||inside(target,root)||
   inside(root,parent)||inside(parent,root))
  fail('workspace or parent overlaps repository checkout');
 if(existsSync(target))fail('workspace already exists: no overwrite allowed');
 const s=lstatSync(parent);
 if(!s.isDirectory()||s.isSymbolicLink()||
   realpathSync(parent)!==parent||(s.mode&0o077)!==0)
  fail('private parent must be a real, owner-only directory');
 const prior=process.umask(0o077);
 try{
  mkdirSync(target,{mode:0o700});
  mkdirSync(join(target,'supabase'),{mode:0o700});
  mkdirSync(join(target,'supabase','migrations'),{mode:0o700});
  mkdirSync(join(target,'supabase','.temp'),{mode:0o700});
  writeFileSync(join(target,'supabase','config.toml'),config,
   {mode:0o600,flag:'wx'});
 }finally{
  process.umask(prior);
 }
 return Object.freeze({
  workPackage:'B10-R18-106',decision:'NO_GO',
  originalProjectRef:ORIGINAL,qaProjectRefUsed:false,
  emptyPrivateMigrationsPrepared:true,
  migrationFilesPresent:0,
  operatorStillMustAuthenticateAndLinkOriginal:true,
  projectRefFileCreated:false,
  historicalSqlFetched:false,qaSqlApplied:false,
  productionSqlApplied:false,releaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==3||!args.every(x=>x.startsWith('--')&&x.includes('=')))
   fail('exact workspace and two safety acknowledgments required');
  const get=key=>{
   const p='--'+key+'=';
   const a=args.filter(x=>x.startsWith(p));
   if(a.length!==1||a[0].length<=p.length)fail('missing/duplicate '+key);
   return a[0].slice(p.length);
  };
  if(get('ack-source')!==ORIGINAL||
    get('ack-private-only')!=='NO_UPLOAD_NO_SQL')
   fail('private original-only acknowledgment missing');
  const result=prepareR106PrivateWorkspace({workspace:get('workspace')});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('R106 PRIVATE WORKSPACE NO-GO: private local setup rejected, inspect privately.\n');
  process.exitCode=1;
 }
}
