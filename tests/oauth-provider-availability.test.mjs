import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const auth=readFileSync(new URL('../src/Welcome.jsx',import.meta.url),'utf8');
test('OAuth login checks publicly enabled providers before redirecting',()=>{
 assert.match(auth,/auth\/v1\/settings/);
 assert.match(auth,/external\?\.discord===true/);
 assert.match(auth,/external\?\.google===true/);
 assert.match(auth,/disabled=\{busy\|\|!oauthProviders\.discord\}/);
 assert.match(auth,/disabled=\{busy\|\|!oauthProviders\.google\}/);
 assert.match(auth,/if\(!oauthProviders\[provider\]\)/);
});
test('unavailable social sign-in has username/password fallback',()=>{
 assert.ok(auth.includes("Use username and password"));
 assert.ok(auth.includes("Create account"));
});
