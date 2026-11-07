import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const actions=readFileSync(new URL('../.github/workflows/codeql.yml',import.meta.url),'utf8');
const dependabot=readFileSync(new URL('../.github/dependabot.yml',import.meta.url),'utf8');
const owners=readFileSync(new URL('../.github/CODEOWNERS',import.meta.url),'utf8');
const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));

test('CodeQL runs automatically on main and weekly with no privilege beyond analysis uploads',()=>{
 assert.match(actions,/branches:\s*\n\s*- main/);
 assert.match(actions,/schedule:/);
 assert.match(actions,/languages: javascript-typescript/);
 assert.match(actions,/security-events: write/);
 assert.match(actions,/contents: read/);
 assert.doesNotMatch(actions,/\bvercel\s+deploy\b/i);
 assert.doesNotMatch(actions,/\bVERCEL_TOKEN\b|SUPABASE_SERVICE_ROLE_KEY/);
});

test('Dependabot reviews both npm and GitHub Action dependencies',()=>{
 assert.match(dependabot,/package-ecosystem: npm/);
 assert.match(dependabot,/package-ecosystem: github-actions/);
 assert.match(dependabot,/interval: weekly/);
 assert.match(owners,/\/supabase\/ @xuvenz-source/);
 assert.match(owners,/\/vercel\.json @xuvenz-source/);
});

test('existing staging deployment policy remains in place',()=>{
 assert.deepEqual(vercel.git?.deploymentEnabled,{'**':false,main:true});
});
