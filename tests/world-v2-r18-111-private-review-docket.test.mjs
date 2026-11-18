import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildR111Docket}
 from '../scripts/release/prepare-world-v2-r18-111-private-review-docket.mjs';
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const hex=(alg,content)=>createHash(alg).update(content).digest('hex');
function synthetic(){
 const bodies=new Map();
 const rows=[];
 const aggregate=createHash('sha256');
 for(let i=0;i<83;i++){
  const version=i===82?'20261109171247':'20261105'+String(i+1).padStart(6,'0');
  const name='operator_review_synthetic_'+String(i).padStart(2,'0');
  const sql=i===0?
   '-- synthetic credential-pattern marker sb_secret_'+('A'.repeat(24))+'\nSELECT 1;\n':
   i===1?'DELETE FROM storage.objects WHERE id = 1;\n':
   '-- original SQL body never in report\nSELECT '+i+';\n';
  const filename=version+'_'+name+'.sql';
  bodies.set(version,sql);
  rows.push({version,name,fetched_sql_md5:hex('md5',sql)});
  aggregate.update(filename+'\0'+hex('sha256',sql)+'\n');
 }
 return {rows,bodies,expectedAggregate:aggregate.digest('hex'),
  run:()=>buildR111Docket({
   rows,expectedAggregate:aggregateCopy(),readBody:r=>bodies.get(r.version)
  })};
 function aggregateCopy(){
  const digest=createHash('sha256');
  for(const r of rows){
   const b=bodies.get(r.version);
   digest.update(r.version+'_'+r.name+'.sql\0'+hex('sha256',b)+'\n');
  }
  return digest.digest('hex');
 }
}
test('R111 builds a source-hash-verified private docket, never claims review approved',()=>{
 const f=synthetic();
 const out=buildR111Docket({
  rows:f.rows,readBody:r=>f.bodies.get(r.version),
  expectedAggregate:f.expectedAggregate
 });
 assert.equal(out.workPackage,'B10-R18-111');
 assert.equal(out.decision,'NO_GO');
 assert.equal(out.reviewItems.length,83);
 assert.equal(out.itemsNeedingReview,83);
 assert.equal(out.urgencyMarkerFiles,1);
 assert.equal(out.additionalMarkerFiles,1);
 assert.equal(out.reviewItems[0].priority,'URGENT');
 assert.equal(out.reviewItems[1].priority,'ADDITIONAL');
 assert.equal(out.allReviewerDecisionsPending,true);
 assert.equal(out.qaInstallApproved,false);
 assert.equal(out.productionReleaseAuthorized,false);
 for(const item of out.reviewItems){
  assert.equal(item.reviewStatus,'PENDING');
  assert.equal(item.reviewerAttestation,null);
  assert.equal(item.securityApproved,false);
  assert.ok(Object.values(item.reviewChecklist).every(v=>v==='PENDING'));
  assert.match(item.sourceBodySha256,/^[0-9a-f]{64}$/);
 }
 const txt=JSON.stringify(out);
 assert.doesNotMatch(txt,/DELETE FROM storage|original SQL body never in report|sb_secret_/);
 assert.equal(out.rawSqlBodiesExported,false);
});
test('R111 refuses partial, altered or extra-source private review baselines',()=>{
 const f=synthetic();
 const run=(overrides={})=>buildR111Docket({
  rows:f.rows,readBody:r=>f.bodies.get(r.version),
  expectedAggregate:f.expectedAggregate,...overrides
 });
 const noGo=/R111 PRIVATE REVIEW NO-GO/;
 assert.throws(()=>run({rows:f.rows.slice(1)}),noGo);
 assert.throws(()=>run({expectedAggregate:'f'.repeat(64)}),noGo);
 assert.throws(()=>run({readBody:r=>r.version===f.rows[0].version?
  'SELECT DIFFERENT;\n':f.bodies.get(r.version)}),noGo);
 const changed=structuredClone(f.rows);
 changed[0].version=changed[1].version;
 assert.throws(()=>run({rows:changed}),noGo);
});
test('R111 operator-only code prohibits remote operations and requires exclusive file creation',()=>{
 const src=readFileSync(join(ROOT,
  'scripts/release/prepare-world-v2-r18-111-private-review-docket.mjs'),'utf8');
 assert.match(src,/triageR109PrivateHistory/);
 assert.match(src,/isDeepStrictEqual/);
 assert.match(src,/openSync\(dest,'wx',0o600\)/);
 assert.match(src,/basename\(source\)!=='r106-original-83-recovery'/);
 assert.match(src,/humanSecurityReviewCompleted:false/);
 assert.match(src,/qaDryRunAuthorized:false/);
 assert.doesNotMatch(src,/\b(?:fetch|spawnSync|execSync|apply_migration|eval)\s*\(/);
 const r100=readFileSync(join(ROOT,
  'scripts/release/run-world-v2-r18-100-qa-dry-run.mjs'),'utf8');
 assert.match(r100,/if\(exact\(args,ALLOW\[0\]\)\)/);
 assert.match(r100,/helpText:p.stdout/);
});
