import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-174-private-asset-delivery-revocation/manifest.json','utf8'));
const gitBlob=(s)=>createHash('sha1').update('blob '+Buffer.byteLength(s)).update(Buffer.from([0])).update(s).digest('hex');
test('R174 exact R173 source-only child with NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-174');assert.equal(m.parentPr,282);assert.equal(m.parentSha,'486a9224eeb90778421b65dfc8538fdf92977acf');assert.equal(m.decision,'NO_GO');
 for(const k of ['noHostedSqlOrStorageChanges','noRuntimeEdits','noOriginalOrQaDeploy','noRootMigrationEdits','noMerge','noPaidResources'])assert.equal(m[k],true,k);
 assert.ok(Object.values(m.unresolved).every(x=>x===false));
});
test('R174 pins exact current client bearer URL behavior',()=>{
 const s=readFileSync(m.currentAssetStore.path,'utf8');
 assert.equal(gitBlob(s),m.currentAssetStore.gitBlobSha);
 assert.equal(m.currentAssetStore.downloadLinkSeconds,3600);
 assert.equal(m.currentAssetStore.localCacheTtlMs,54*60*1000);
 assert.match(s,/createSignedUrl\(path,3600\)/);
 assert.match(s,/ttlMs=54\*60\*1000/);
 assert.match(s,/if\(e\.listeners\.size>0\)void load\(e\)/);
 assert.equal(m.currentAssetStore.issuedUrlsRevokedByClientClear,false);
});
test('R174 rejects claims of individual URL revocation or retroactive client erasure',()=>{
 const p=m.officialSupabaseContract;
 assert.equal(p.individualSignedUrlRevocationSupported,false);
 assert.equal(p.globalKeyRotateAndRevokeAvailable,true);
 assert.equal(p.authJwtKeyRotationDoesNotInvalidateStorageUrl,true);
 assert.equal(p.cdnMayServePreviouslyCachedContentAfterExpiry,true);
 assert.equal(m.proposedDeliveryModel.campaignPrivateAssets.mustNotRedirectToSignedBearerUrl,true);
 assert.equal(m.proposedDeliveryModel.emergencyGlobalCutover.doesNotEraseAlreadyDownloadedContent,true);
 assert.equal(m.acceptanceMatrix.length,12);
 assert.ok(m.acceptanceMatrix.every(x=>x.result==='NOT_RUN'));
 assert.equal(m.originalReadOnly.buckets.length,3);
 assert.ok(m.originalReadOnly.buckets.every(x=>x.private));
});
