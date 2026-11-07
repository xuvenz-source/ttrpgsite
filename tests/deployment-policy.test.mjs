import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const workflow=readFileSync(new URL('../.github/workflows/verify-staged.yml',import.meta.url),'utf8');
const agents=readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');

test('only main receives automatic Git deployments',()=>{
 assert.deepEqual(vercel.git?.deploymentEnabled,{'**':false,main:true});
 assert.equal(vercel.rewrites?.[0]?.destination,'/index.html',
   'protect the existing single-page-app fallback');
});

test('GitHub validates every branch while Vercel builds are reserved for releases',()=>{
 assert.match(workflow,/branches:\s*\n\s*- '\*\*'/);
 assert.match(workflow,/run: npm test/);
 assert.match(workflow,/run: npm run build/);
 assert.match(workflow,/cancel-in-progress: true/);
 assert.doesNotMatch(workflow,/\bvercel\s+(deploy|--prod)\b/i);
 assert.match(agents,/previewDeploymentsDisabled=true/);
 assert.match(agents,/explicitly requested/);
});
