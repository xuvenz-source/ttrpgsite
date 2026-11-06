import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {campaignArtworkPaths,validateTokenArtwork,isRetryableArtworkError} from '../src/TokenArtworkTransfer.js';

const camp='16268cf1-4653-4a26-990f-65e841e9e779';
const user='44420415-9c97-4c43-bc1e-0ed906b6d0ef';
const id='04778251-b527-4301-9ac2-9d12f501aa0b';

test('personal token copies use campaign-member storage paths permitted by RLS',()=>{
 const p=campaignArtworkPaths(camp,user,'players',id);
 assert.equal(p.portraitPath,camp+'/players/'+user+'/'+id+'-portrait.webp');
 assert.equal(p.tokenPath,camp+'/players/'+user+'/'+id+'-token.webp');
 const npc=campaignArtworkPaths(camp,user,'npcs',id);
 assert.equal(npc.tokenPath,camp+'/npcs/'+id+'-token.webp');
 assert.throws(()=>campaignArtworkPaths(camp,'../others','players',id),/Invalid/);
 assert.throws(()=>campaignArtworkPaths(camp,user,'other',id),/Invalid/);
});
test('image checks reject absent, empty and overlarge files before uploading',()=>{
 const valid={size:1234};
 assert.doesNotThrow(()=>validateTokenArtwork(valid,valid));
 assert.throws(()=>validateTokenArtwork(null,valid),/missing/);
 assert.throws(()=>validateTokenArtwork({size:0},valid),/empty/);
 assert.throws(()=>validateTokenArtwork({size:5242881},valid),/5 MB/);
});
test('only transient image upload errors are retried',()=>{
 assert.equal(isRetryableArtworkError({statusCode:'503'}),true);
 assert.equal(isRetryableArtworkError({statusCode:'429'}),true);
 assert.equal(isRetryableArtworkError({statusCode:'403',message:'row-level security'}),false);
 assert.equal(isRetryableArtworkError({message:'network timeout'}),true);
});
test('applying library token validates ownership, reports failed step and refreshes map art',()=>{
 const lib=readFileSync(new URL('../src/PersonalTokenLibrary.jsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(lib.includes("db.auth.getUser()"));
 assert.ok(lib.includes("db.from('campaign_members')"));
 assert.ok(lib.includes('validateTokenArtwork(portraitBlob,tokenBlob)'));
 assert.ok(lib.includes('const uploaded=[]'));
 assert.ok(lib.includes('await upload(tokenPath,tokenBlob)'));
 assert.ok(lib.includes('await upload(portraitPath,portraitBlob)'));
 assert.ok(lib.includes('await storage.remove(uploaded)'));
 assert.ok(lib.includes("'Could not apply this token while '"));
 assert.ok(lib.includes('applying.current'));
 assert.ok(main.includes("owner.user_id!==user||owner.campaign_id!==activeId"));
 assert.ok(main.includes("db.from('map_tokens').update({image_path:art.tokenPath})"));
});
