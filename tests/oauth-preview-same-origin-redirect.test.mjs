import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {authReturnUrlForOrigin} from '../src/AuthRedirect.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(join(root,'src/Welcome.jsx'),'utf8');
const helper=readFileSync(join(root,'src/AuthRedirect.js'),'utf8');

test('R18-62 current production origin returns root with exact trailing slash',()=>{
 assert.equal(authReturnUrlForOrigin('https://ttrpgsite.vercel.app'),
  'https://ttrpgsite.vercel.app/');
 assert.equal(authReturnUrlForOrigin('https://ttrpgsite.vercel.app/'),
  'https://ttrpgsite.vercel.app/');
});
test('R18-62 current isolated Vercel preview returns its OWN origin, never production',()=>{
 for(const origin of [
  'https://ttrpgsite-lehdbv6p1-ttrpg-site.vercel.app',
  'https://ttrpgsite-git-test-feature-ttrpg-site.vercel.app',
  'https://preview.example.test'
 ]){
  assert.equal(authReturnUrlForOrigin(origin),origin+'/');
  assert.equal(authReturnUrlForOrigin(origin+'/'),origin+'/');
  assert.notEqual(authReturnUrlForOrigin(origin),
   'https://ttrpgsite.vercel.app/');
 }
});
test('R18-62 local development permitted only on localhost loopback HTTP',()=>{
 assert.equal(authReturnUrlForOrigin('http://localhost:5173'),
  'http://localhost:5173/');
 assert.equal(authReturnUrlForOrigin('http://127.0.0.1:5173'),
  'http://127.0.0.1:5173/');
 assert.equal(authReturnUrlForOrigin('http://[::1]:5173'),
  'http://[::1]:5173/');
});
test('R18-62 forbids insecure HTTP origins outside local development',()=>{
 for(const bad of ['http://ttrpgsite.vercel.app',
  'http://preview.example.test','http://192.168.1.5:5173',
  'http://localhost.evil.tld','ftp://example.test']){
  assert.throws(()=>authReturnUrlForOrigin(bad),/Invalid browser origin/);
 }
});
test('R18-62 rejects open redirect / query / fragment / credentials in origin',()=>{
 for(const bad of [
  'https://ttrpgsite.vercel.app/evil',
  'https://ttrpgsite.vercel.app/?redirect_to=https://evil.test',
  'https://ttrpgsite.vercel.app/#access_token=private',
  'https://attacker@ttrpgsite.vercel.app',
  'https://ttrpgsite.vercel.app@attacker.test',
  'https://ttrpgsite.vercel.app//attacker.test',
  '//attacker.test',
  'javascript:alert(1)',
  'https://',
  '',null,undefined,23
 ]){
  assert.throws(()=>authReturnUrlForOrigin(bad),/Invalid browser origin/);
 }
});
test('R18-62 OAuth providers use same-origin root and do not hardcode production',()=>{
 assert.match(source,/authReturnUrlForOrigin\(window\.location\.origin\)/);
 assert.match(source,/options:\{redirectTo:authReturnUrlForOrigin\(window\.location\.origin\)\}/);
 assert.match(source,/db\.auth\.signInWithOAuth\(\{provider/);
 assert.match(source,/if\(!oauthProviders\[provider\]\)/);
 assert.match(source,/external\?\.google===true/);
 assert.match(source,/external\?\.discord===true/);
 assert.doesNotMatch(source,/redirectTo:\s*['"\x60]https?:\/\//);
});
test('R18-62 legacy email OTP uses same safe browser-origin root',()=>{
 assert.match(source,/emailRedirectTo:authReturnUrlForOrigin\(window\.location\.origin\)/);
 assert.match(source,/shouldCreateUser:false/);
 assert.match(source,/db\.auth\.signInWithOtp/);
 assert.doesNotMatch(source,/emailRedirectTo:location\.origin/);
});
test('R18-62 helper never trusts referrer, incoming redirect_to or server env',()=>{
 assert.match(helper,/target\.origin!==origin/);
 assert.match(helper,/return target\.origin\+'\/';/);
 assert.doesNotMatch(helper,/window\.location\.search|document\.referrer|localStorage|sessionStorage|fetch\(|import\.meta\.env|process\.env|VITE_|SUPABASE_/);
});
