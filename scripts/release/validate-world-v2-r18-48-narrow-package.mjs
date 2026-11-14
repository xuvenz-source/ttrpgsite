/**
 * R18-48 staging-only NO-GO manifest validator. No CLI, SQL, remote API,
 * writes or permission to deploy. Validates approved byte-for-byte sources
 * in seven officially generated migration filenames outside active dir.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,realpathSync,lstatSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='staging/world-v2-b10-r18-48-narrow-pending/';
const frozen=[
['20261113021005_r47_capture_original_sources.sql','supabase/candidates/world_v2_r18_46_capture_original_sources.sql','8b22e5968ce8bdcb71eeb7eb415df6d37f4185c5'],
['20261113021007_r47_wall_edge_clearance.sql','supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql','c78998da8a9013591f2bb479cca4b222f41ef2d7'],
['20261113021010_r47_cross_map_collision_guards.sql','supabase/candidates/world_v2_r18_19_cross_map_guard.sql','55db7e6b6839d1d8b489203baa11c99264648a55'],
['20261113021012_r47_campaign_affinity.sql','supabase/candidates/world_v2_r18_20_campaign_affinity.sql','3980808966ec56ad74120bc4f737c78ddd2056bb'],
['20261113021020_r47_atomic_finalize_rpc.sql','supabase/candidates/world_v2_r18_28_atomic_finalize.sql','9f22adbe0de09148a67ba1a1ef0397df1cd85be9'],
['20261113021022_r47_blocked_terminal_semantics.sql','supabase/candidates/world_v2_r18_30_blocked_final_semantics.sql','6741a9f31e72bd354818de9d77b9a893aca51c51'],
['20261113024116_r48_narrow_release_seal.sql','supabase/candidates/world_v2_r18_48_narrow_seal_release_sources.sql','f2ed50d4b2e1046d1cf2a1bd034abba093625ce8']
];
const sha=src=>{const b=Buffer.from(src,'utf8');return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
const fail=s=>{throw Error('R48 NO-GO: '+s)};
export function validateR48NarrowPackage({repoRoot=root,manifest}={}){
 const base=realpathSync(resolve(repoRoot));
 const m=manifest??JSON.parse(readFileSync(join(base,prefix+'manifest.json'),'utf8'));
 if(m.schema!==1||m.workPackage!=='B10-R18-48'||m.releaseDecision!=='NO_GO'||
   m.safeToApply!==false||m.noSqlDeployed!==true||m.rootMigrationsUntouched!==true||
   m.sourceParentSha!=='d547025b84cc125ca0e109140ff243d1ad846510'||
   m.baseline?.remoteMigrations!==83||m.baseline.sqlDigestsMatched!==83||
   m.baseline.latest!=='20261109171247'||m.baseline.r05Version!=='20261111023204'||
   m.lastCli?.version!=='2.81.3'||m.lastCli?.unlinked!==true||
   m.lastCli?.runId!==43353868226||
   m.lastCli?.generated!=='20261113024116_r48_narrow_release_seal.sql'||
   m.expectedPendingTotalWithR05!==8||
   m.stagedMigrationDirectory!==prefix+'supabase/migrations/')
  fail('baseline, CLI provenance, package identity or NO-GO drift');
 const r05=readFileSync(join(base,'supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql'),'utf8');
 if(m.baseline.r05GitBlob!=='f4e296725c09055685321726cbe4bc6e09dbce5a'||
   sha(r05)!==m.baseline.r05GitBlob)
  fail('frozen R05 source drift');
 const folder=resolve(base,prefix+'supabase/migrations/');
 if(realpathSync(folder)!==folder||!lstatSync(folder).isDirectory())
  fail('nonregular or symlinked isolated migration folder');
 const entries=readdirSync(folder,{withFileTypes:true});
 if(entries.length!==7||entries.some(x=>!x.isFile()||!frozen.some(p=>p[0]===x.name)))
  fail('unreviewed SQL file or symlink in package');
 if(!Array.isArray(m.pending)||m.pending.length!==7)
  fail('expected precisely seven pending versioned sources');
 for(let i=0;i<frozen.length;i++){
  const [name,source,digest]=frozen[i],e=m.pending[i];
  if(!e||e.sequence!==i+1||e.filename!==name||e.source!==source||e.gitBlobSha!==digest)
   fail('altered official CLI filename, sequence or source pin');
  const staged=join(folder,name);
  if(!lstatSync(staged).isFile()||realpathSync(staged)!==staged)
   fail('versioned SQL must not be symlinked');
  const body=readFileSync(staged,'utf8');
  if(!body.trim()||body!==readFileSync(join(base,source),'utf8')||sha(body)!==digest)
   fail('versioned SQL deviates from pinned reviewed source '+name);
  if(i>0&&name.slice(0,14)<=frozen[i-1][0].slice(0,14))
   fail('CLI timestamps not increasing');
 }
 if(!Array.isArray(m.intentionallyExcluded)||m.intentionallyExcluded.length!==2||
  !m.intentionallyExcluded.some(x=>x.stage==='R18-26'&&x.originalFilename.includes('step_bbox'))||
  !m.intentionallyExcluded.some(x=>x.stage==='R18-27'&&x.originalFilename.includes('commit_empty')))
  fail('unapproved performance candidates entered narrow release');
 const narrowed=readFileSync(join(base,frozen[6][1]),'utf8');
 if(!narrowed.includes("current_md5<>rec.original_digest")||
   !narrowed.includes("rec.signature LIKE 'forge_world_v2.step_allowed(%'")||
   !narrowed.includes('6dcd75ce4719cd0bf6173f77f75fdf32')||
   !narrowed.includes('current_md5=rec.original_digest'))
  fail('narrow seal cannot attest exactly four changed and one original function');
 if(readdirSync(join(base,'supabase/migrations')).some(s=>s.startsWith('2026111302')))
  fail('new pending SQL entered unsafe active repo-root migration directory');
 if(!Array.isArray(m.requiredGates)||m.requiredGates.length<4||
  !Array.isArray(m.prohibited)||!m.prohibited.includes('supabase db push')||
  !m.prohibited.includes('production deployment'))
  fail('required release blockers removed');
 return Object.freeze({decision:'NO_GO',safeToApply:false,
  pendingWithR05:8,stagingOnly:true,cliVersion:'2.81.3',
  selectedVersionedSources:7,excludedMixedPerformance:2,
  originalStepValidatorPreserved:true});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(validateR48NarrowPackage(),null,2)+'\n');}
 catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
}
