import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACCOUNT_USERNAME,validateAccountUsername,validateAccountPassword,
 isNativeUsernameAccount,accountDisplayName} from '../src/AccountIdentity.js';

const settings=readFileSync(new URL('../src/AccountSettings.jsx',import.meta.url),'utf8');
const main=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
const hub=readFileSync(new URL('../src/Welcome.jsx',import.meta.url),'utf8');
const sidebar=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/username-update/index.ts',import.meta.url),'utf8');

test('usernames validate character limits and normalize case',()=>{
 assert.equal(validateAccountUsername('  Archer_99  '),'archer_99');
 for(const value of ['2bad','a','_bad','has-hyphen','bad space',''.padEnd(25,'a')])
  assert.throws(()=>validateAccountUsername(value),/Usernames/);
 assert.ok(ACCOUNT_USERNAME.test('Archer'));
});
test('password rules require secure length, equality and no username inclusion',()=>{
 assert.equal(validateAccountPassword('8_Moon!River#2026','8_Moon!River#2026','archer'),'8_Moon!River#2026');
 assert.throws(()=>validateAccountPassword('short','short'),/10/);
 assert.throws(()=>validateAccountPassword('validlong123','notmatching'),/match/);
 assert.throws(()=>validateAccountPassword('archer123456','archer123456','archer'),/username/);
});
test('OAuth accounts retain a real email while native usernames use synthetic email',()=>{
 assert.equal(isNativeUsernameAccount({email:'cleric@accounts.tabletopforge.example.com'}),true);
 assert.equal(isNativeUsernameAccount({email:'oauth@gmail.com'}),false);
 assert.equal(accountDisplayName({user_metadata:{username:'wizard'}}),'wizard');
});
test('account menu exists in campaign hub and in-game sidebar',()=>{
 assert.ok(hub.includes('onOpenAccountSettings'));
 assert.ok(sidebar.includes('onOpenAccountSettings'));
 assert.ok(main.includes("accountSettingsOpen&&<AccountSettings"));
 assert.ok(settings.includes('<FloatingWindow kind="account"'));
 assert.ok(settings.includes('Save username'));
 assert.ok(settings.includes('Set or change password'));
 assert.ok(settings.includes('db.auth.updateUser(fields)'));
 assert.ok(settings.includes("db.functions.invoke('username-update'"));
 assert.ok(settings.includes('db.auth.refreshSession()'));
});
test('username-update endpoint verifies JWT before administrative modifications',()=>{
 assert.ok(edge.includes('admin.auth.getUser(bearer)'));
 assert.ok(edge.includes("me.user_metadata||{}"));
 assert.ok(edge.includes('updateUserById(me.id,updates)'));
 assert.ok(edge.includes("if(native)"));
 assert.ok(edge.includes("updates.email=username+'@'+DOMAIN"));
 assert.ok(edge.includes('status:403')||edge.includes('status: 403'));
 assert.ok(!/console\.log\(.*password/.test(edge));
});
