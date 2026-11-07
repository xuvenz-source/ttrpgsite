import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isCompromisedPassword} from '../supabase/functions/username-register/password-breach-check.js';

const endpoint='https://api.pwnedpasswords.com/range/';
const reply=(body,status=200)=>({ok:status===200,status,text:async()=>body});

test('pwned password range request sends only 5-character SHA-1 prefix and never password',async()=>{
 let url='',opts=null;
 const found=await isCompromisedPassword('password',(u,o)=>{
  url=u;opts=o;
  return Promise.resolve(reply('1E4C9B93F3F0682250B6CF8331B7EE68FD8:3303003\r\n' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\r\n'));
 });
 assert.equal(found,true);
 assert.equal(url,endpoint+'5BAA6');
 assert.equal(new URL(url).pathname.includes('password'),false);
 assert.equal(new URL(url).pathname.includes('1E4C9B93F3F0682250B6CF8331B7EE68FD8'),false);
 assert.equal(opts.method,'GET');
 assert.equal(opts.headers['Add-Padding'],'true');
 assert.equal(opts.headers['User-Agent'],'TabletopForge-Signup/1.0');
});

test('padded count zero never triggers compromised result',async()=>{
 const r=await isCompromisedPassword('password',async()=>reply('1E4C9B93F3F0682250B6CF8331B7EE68FD8:0\n'));
 assert.equal(r,false);
});

test('nonmatching password suffix is safe and HIBP outages throw',async()=>{
 const safe=await isCompromisedPassword('password',async()=>reply('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:20\n'));
 assert.equal(safe,false);
 await assert.rejects(isCompromisedPassword('password',async()=>reply('',503)),/unavailable/);
});

test('registration checks known breached password before privileged account creation',()=>{
 const source=readFileSync(new URL('../supabase/functions/username-register/index.ts',import.meta.url),'utf8');
 const check=source.indexOf('isCompromisedPassword(password)');
 const create=source.indexOf('admin.auth.admin.createUser(');
 assert.ok(check>0&&create>check);
 assert.ok(source.includes('Password security check is temporarily unavailable.'));
 assert.ok(source.includes('This password has appeared in a data breach.'));
});
