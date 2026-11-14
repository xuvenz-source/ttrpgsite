/**
 * R18-47 staging-only, read-only verification of exact official-CLI-generated
 * filenames containing the original Git blobs from reviewed SQL candidates.
 * NEVER connects to Supabase, invokes CLI, writes files, or executes SQL.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const HERE=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const blob=s=>{
 const b=Buffer.from(s,'utf8');
 return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
};
const fail=s=>{throw Error('R47 NO-GO: '+s)};
const names=[
 '20261113021005_r47_capture_original_sources.sql',
 '20261113021007_r47_wall_edge_clearance.sql',
 '20261113021010_r47_cross_map_collision_guards.sql',
 '20261113021012_r47_campaign_affinity.sql',
 '20261113021015_r47_step_bbox_prefilter.sql',
 '20261113021017_r47_commit_empty_work.sql',
 '20261113021020_r47_atomic_finalize_rpc.sql',
 '20261113021022_r47_blocked_terminal_semantics.sql',
 '20261113021024_r47_seal_release_sources.sql'
];
const sources=[
 ['supabase/candidates/world_v2_r18_46_capture_original_sources.sql','8b22e5968ce8bdcb71eeb7eb415df6d37f4185c5'],
 ['supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql','c78998da8a9013591f2bb479cca4b222f41ef2d7'],
 ['supabase/candidates/world_v2_r18_19_cross_map_guard.sql','55db7e6b6839d1d8b489203baa11c99264648a55'],
 ['supabase/candidates/world_v2_r18_20_campaign_affinity.sql','3980808966ec56ad74120bc4f737c78ddd2056bb'],
 ['supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql','57522d2d801ca69c92a136c5c915c58101644e51'],
 ['supabase/candidates/world_v2_r18_27_commit_empty_work.sql','bbc2dcf4c770ce857845691c80bd2c11418c3d77'],
 ['supabase/candidates/world_v2_r18_28_atomic_finalize.sql','9f22adbe0de09148a67ba1a1ef0397df1cd85be9'],
 ['supabase/candidates/world_v2_r18_30_blocked_final_semantics.sql','6741a9f31e72bd354818de9d77b9a893aca51c51'],
 ['supabase/candidates/world_v2_r18_46_seal_release_sources.sql','d26ede6f5588a57b34e20ab857e5a06c23fa6509']
];
const pending='staging/world-v2-b10-r18-47-isolated-pending/supabase/migrations/';
const manifestPath='staging/world-v2-b10-r18-47-isolated-pending/manifest.json';
export function validateR47OfflinePackage({repoRoot=HERE,manifest}={}){
 const root=realpathSync(resolve(repoRoot));
 const data=manifest??JSON.parse(readFileSync(join(root,manifestPath),'utf8'));
 if(!data||data.schema!==1||data.workPackage!=='B10-R18-47'||
   data.releaseDecision!=='NO_GO'||data.neverPushFromRepoRoot!==true||
   data.officialCli?.version!=='2.81.3'||
   data.officialCli?.invocation!=='supabase migration new'||
   data.officialCli?.runId!==43350078071||
   data.officialCli?.sourceHeadSha!=='db0a1de2689fa5fe4199c696ee780335cc6509d5'||
   data.officialCli?.offline!==true||data.officialCli?.linked!==false||
   data.live?.projectRef!=='lwhwgqaunxbmvyndswze'||
   data.live?.appliedCount!==83||
   data.live?.verifiedRemoteContentDigests!==83||
   data.live?.latestVersion!=='20261109171247'||
   data.live?.repoRootLocalMigrationFiles!==62||
   data.live?.repoRemoteVersionMatches!==20||
   data.live?.remoteOnlyVersions!==63||
   data.live?.repoOnlyVersions!==35||
   data.stagedMigrationDirectory!==pending)
  fail('official CLI provenance, remote history evidence or NO_GO gate drift');
 const r05='supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql';
 if(data.originalR05?.file!==r05||data.originalR05?.requiredBefore!==true||
   data.originalR05?.gitBlobSha!=='f4e296725c09055685321726cbe4bc6e09dbce5a'||
   blob(readFileSync(join(root,r05),'utf8'))!==data.originalR05.gitBlobSha)
  fail('existing official R05 migration changed');
 const folder=resolve(root,pending); // canonical: no trailing slash before realpath equality
 if(realpathSync(folder)!==folder||!lstatSync(folder).isDirectory())
  fail('staged folder missing or symlinked');
 const actual=readdirSync(folder,{withFileTypes:true});
 if(actual.length!==9||actual.some(x=>!x.isFile()||!names.includes(x.name)))
  fail('unreviewed extra/missing/symlink staging migration');
 if(!Array.isArray(data.packages)||data.packages.length!==9)
  fail('exactly nine reviewed optional migration shells required');
 for(let i=0;i<9;i++){
  const p=data.packages[i],expectedGate=(i===4||i===5)?'performance_no_go':'required';
  if(!p||p.index!==i+1||p.filename!==names[i]||
    p.source!==sources[i][0]||p.gitBlobSha!==sources[i][1]||
    p.officialCliGenerated!==true||p.gate!==expectedGate)
   fail('source/version/order/experimental performance admission drift at '+i);
  const source=readFileSync(join(root,p.source),'utf8');
  const staged=readFileSync(join(folder,p.filename),'utf8');
  if(blob(source)!==p.gitBlobSha||staged!==source)
   fail('versioned SQL is not byte-identical to reviewed historical blob '+p.filename);
  if(staged.length<500||/^\s*\\(?:i|!|copy)\b/m.test(staged))
   fail('non-SQL meta command or empty placeholder in versioned package');
  if(i&&p.filename.slice(0,14)<=names[i-1].slice(0,14))
   fail('CLI migration versions not strictly increasing');
  if(p.filename.slice(0,14)<='20261111023204')
   fail('official generated version predates reviewed R05 dependency');
 }
 const ordinary=join(root,'supabase/migrations');
 if(readdirSync(ordinary).some(f=>names.includes(f)||f.startsWith('202611130210')))
  fail('R47 candidate incorrectly placed on active repo-root migration path');
 if(!Array.isArray(data.releaseBlockers)||data.releaseBlockers.length<4||
   !Array.isArray(data.prohibited)||!data.prohibited.includes('supabase db push')||
   !data.prohibited.includes('production deployment')||
   !data.prohibited.includes('MCP apply_migration'))
  fail('missing mandatory release blockers');
 return Object.freeze({workPackage:data.workPackage,decision:'NO_GO',
   safeToApply:false,cliGenerated:9,reviewedSourceBlobs:9,
   excludedPerformanceFromApproval:2,remoteApplied:83,
   liveSqlDigestsReadOnlyMatched:83,
   next:'secure operator linked fetch/list/dry-run; genuine DM/P1/passive-P2 acceptance',
   sourceRunId:data.officialCli.runId});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(validateR47OfflinePackage(),null,2)+'\n');}
 catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
}
