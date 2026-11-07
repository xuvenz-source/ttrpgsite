import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {acceptedSignupChallenge,validCaptchaToken}
 from '../supabase/functions/username-register/captcha-verification.js';

const edge=readFileSync(new URL('../supabase/functions/username-register/index.ts',import.meta.url),'utf8');
const welcome=readFileSync(new URL('../src/Welcome.jsx',import.meta.url),'utf8');
const widget=readFileSync(new URL('../src/SignupCaptcha.jsx',import.meta.url),'utf8');
const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));

test('only Siteverify success for the expected action and exact hostname allows signup',()=>{
 const good={success:true,action:'username-register',hostname:'ttrpgsite.vercel.app'};
 assert.equal(acceptedSignupChallenge(good,'ttrpgsite.vercel.app'),true);
 for(const bad of [null,{}, {...good,success:false},{...good,hostname:'attacker.example'},
  {...good,action:'password-reset'},{...good,hostname:null},{...good,action:null}])
  assert.equal(acceptedSignupChallenge(bad,'ttrpgsite.vercel.app'),false);
});
test('signup CAPTCHA token accepts only non-empty bounded strings',()=>{
 assert.equal(validCaptchaToken('pass'),true);
 for(const bad of [null,undefined,'',0,{},'x'.repeat(2049)])
  assert.equal(validCaptchaToken(bad),false);
 assert.equal(validCaptchaToken('x'.repeat(2048)),true);
});
test('privileged username creation always performs server verification before the admin user call',()=>{
 const verify=edge.indexOf("fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify'");
 const check=edge.indexOf('acceptedSignupChallenge(verification,new URL(origin).hostname)');
 const create=edge.indexOf('admin.auth.admin.createUser(');
 assert.ok(verify>0&&check>verify&&create>check);
 assert.ok(edge.includes("Deno.env.get('TURNSTILE_SECRET_KEY')"));
 assert.ok(edge.includes('if(!turnstileSecret)return respond(origin,503'));
 assert.ok(edge.includes('if(!validCaptchaToken(captchaToken))'));
 assert.ok(!edge.includes('error.message||\'Could not create account.\''));
 assert.ok(edge.includes("crypto.subtle.sign('HMAC'"));
});
test('signup collects CAPTCHA and legacy email-link login cannot create an account',()=>{
 assert.ok(widget.includes("action:'username-register'"));
 assert.ok(widget.includes("'expired-callback'"));
 assert.ok(widget.includes("'error-callback'"));
 assert.ok(welcome.includes('body:{username:raw,password,captchaToken}'));
 assert.ok(welcome.includes('shouldCreateUser:false'));
 assert.ok(welcome.includes("signup&&(!siteKey||!captchaToken)"));
});
test('Vercel has safe response headers without changing the existing SPA routing',()=>{
 const headers=Object.fromEntries(vercel.headers.flatMap(item=>item.headers.map(h=>[h.key,h.value])));
 assert.equal(headers['X-Content-Type-Options'],'nosniff');
 assert.equal(headers['X-Frame-Options'],'DENY');
 assert.equal(headers['Referrer-Policy'],'strict-origin-when-cross-origin');
 assert.equal(vercel.rewrites[0].destination,'/index.html');
});
