import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {registrationFingerprint} from
 '../supabase/functions/username-register/registration-fingerprint.js';

const secret='test-key-for-unit-tests-only',source='192.0.2.101';
const day=new Date('2026-11-08T04:01:00Z');
test('Edge Function HMAC import signs using SHA-256 and matches Node crypto',async()=>{
 const signed=await registrationFingerprint(secret,source,day);
 const expected=createHmac('sha256',secret)
  .update(source+'|2026-11-08|tabletopforge-signup').digest('hex');
 assert.equal(signed,expected);
 assert.match(signed,/^[a-f0-9]{64}$/);
});
test('same day+source yields stable rate keys, day and source rotate',async()=>{
 const same=await registrationFingerprint(secret,source,new Date('2026-11-08T23:59:00Z'));
 assert.equal(same,await registrationFingerprint(secret,source,day));
 assert.notEqual(same,await registrationFingerprint(secret,source,new Date('2026-11-09T00:00:00Z')));
 assert.notEqual(same,await registrationFingerprint(secret,'192.0.2.102',day));
 assert.notEqual(same,await registrationFingerprint('different-test-secret',source,day));
});
test('missing HMAC secret/source are rejected before import',async()=>{
 await assert.rejects(registrationFingerprint('',source,day),/secret unavailable/);
 await assert.rejects(registrationFingerprint(secret,'',day),/source unavailable/);
});
