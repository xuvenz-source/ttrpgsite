import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 normalizeSidebarMenuState,sidebarMenuOpen,changeSidebarMenuState,
 sidebarMenuStorageKey,readSidebarMenuState,saveSidebarMenuState
} from '../src/SidebarMenuState.js';

const uid1='4ec17435-56f7-4a80-9d93-579229d61518';
const uid2='1b3e4a87-4a77-41b0-bbe8-61db07d55793';
const camp1='cc44cc26-f2c3-47e4-bb79-655021177102';
const camp2='d1d7e2ac-a0cc-4cbf-8094-e492ffb1dfaf';
const sidebar=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
const hook=readFileSync(new URL('../src/useSidebarMenus.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261107000100_sidebar_menu_preferences.sql',import.meta.url),'utf8');

function fakeStorage(){
 const records=new Map();
 return {
  getItem:key=>records.get(key)??null,
  setItem:(key,value)=>records.set(key,String(value)),
  removeItem:key=>records.delete(key)
 };
}
test('every menu and Unit folder is collapsed until explicitly opened',()=>{
 const blank=normalizeSidebarMenuState(null);
 for(const key of ['units/owner/'+uid1,'units/sheet/'+camp1,'units/unassigned',
  'units/other/'+uid1,'units/place-token','settings/ui','settings/hotbar',
  'dm/maps','dm/quick','dm/invites'])
  assert.equal(sidebarMenuOpen(blank,key),false,key);
 assert.deepEqual(normalizeSidebarMenuState({['units/owner/'+uid1]:false}),{});
});
test('opening and closing separate sections does not lose sibling state',()=>{
 const initial={};
 const a=changeSidebarMenuState(initial,'units/owner/'+uid1,true);
 const b=changeSidebarMenuState(a,'units/sheet/'+camp1,true);
 const c=changeSidebarMenuState(b,'settings/ui',true);
 const d=changeSidebarMenuState(c,'units/owner/'+uid1,false);
 assert.deepEqual(initial,{});
 assert.equal(sidebarMenuOpen(c,'units/owner/'+uid1),true);
 assert.equal(sidebarMenuOpen(d,'units/owner/'+uid1),false);
 assert.equal(sidebarMenuOpen(d,'units/sheet/'+camp1),true);
 assert.equal(sidebarMenuOpen(d,'settings/ui'),true);
 assert.equal(changeSidebarMenuState(d,'settings/ui',true),d);
});
test('saved menu state persists through sign-out and returning to the same account',()=>{
 const storage=fakeStorage();
 const key=sidebarMenuStorageKey(uid1,camp1);
 const saved=changeSidebarMenuState({},'dm/maps',true);
 saveSidebarMenuState(storage,key,saved);
 // A newly mounted sidebar, not the old React state, can restore it.
 assert.deepEqual(readSidebarMenuState(storage,key),{['dm/maps']:true});
 saveSidebarMenuState(storage,key,changeSidebarMenuState(saved,'dm/maps',false));
 assert.deepEqual(readSidebarMenuState(storage,key),{});
});
test('menu choices stay isolated between accounts and campaigns',()=>{
 const storage=fakeStorage();
 const a=sidebarMenuStorageKey(uid1,camp1);
 const b=sidebarMenuStorageKey(uid2,camp1);
 const c=sidebarMenuStorageKey(uid1,camp2);
 assert.notEqual(a,b);assert.notEqual(a,c);
 saveSidebarMenuState(storage,a,{'settings/macros':true});
 assert.deepEqual(readSidebarMenuState(storage,b),{});
 assert.deepEqual(readSidebarMenuState(storage,c),{});
 assert.equal(sidebarMenuStorageKey('bad',camp1),'');
});
test('corrupted or hostile saved menu data does not break rendering',()=>{
 const storage=fakeStorage(),key=sidebarMenuStorageKey(uid1,camp1);
 storage.setItem(key,'not-json');
 assert.deepEqual(readSidebarMenuState(storage,key),{});
 storage.setItem(key,JSON.stringify({
  'units/unassigned':true,'units/sheet/'+camp1:1,
  'dm/invites':false,'__proto__':true,'bad_key':true
 }));
 const result=readSidebarMenuState(storage,key);
 assert.deepEqual(result,{'units/unassigned':true});
 assert.doesNotThrow(()=>saveSidebarMenuState({setItem(){throw Error('blocked')}},key,result));
});
test('Units view uses persisted owner, sheet and NPC open states',()=>{
 assert.ok(!sidebar.includes('setCollapsed('));
 assert.ok(!sidebar.includes('setHiddenSheets('));
 assert.ok(sidebar.includes("opened('units/owner/'+owner.user_id)"));
 assert.ok(sidebar.includes("opened('units/sheet/'+ch.id)"));
 assert.ok(sidebar.includes("opened('units/unassigned')"));
 assert.ok(sidebar.includes("opened('units/other/'+owner.user_id)"));
 assert.ok(sidebar.includes("menuKey={'units/new-character/'+owner.user_id}"));
 assert.ok(sidebar.includes("menuKey={'units/place-token'}"));
});
test('nested Settings and DM sections persist without losing tab state',()=>{
 for(const key of ['settings/ui','settings/keyboard','settings/macros',
  'settings/hotbar','dm/bestiary','dm/maps','dm/calibration','dm/token',
  'dm/quick','dm/status','dm/display','dm/distribute','dm/template','dm/invites'])
  assert.ok(sidebar.includes("menuKey={'"+key+"'}"),key);
 assert.ok(sidebar.includes('useSidebarMenus(db,user,activeCampaignId)'));
 assert.ok(sidebar.includes('open={sidebarMenuOpen(expanded,menuKey)}'));
 assert.ok(sidebar.includes('onMenuToggle(menuKey,event.currentTarget.open)'));
});
test('cloud synchronization is limited to current authenticated campaign membership',()=>{
 assert.ok(hook.includes("from('tabletop_menu_preferences')"));
 assert.ok(hook.includes("upsert(payload,{onConflict:'user_id,campaign_id'})"));
 assert.ok(hook.includes('readSidebarMenuState(localStore(),key)'));
 assert.ok(hook.includes('version.current===versionAtStart'));
 assert.ok(migration.includes('enable row level security'));
 assert.ok(migration.includes('auth.uid()=user_id'));
 assert.ok(migration.includes('public.is_campaign_member(campaign_id)'));
 assert.ok(migration.includes("default '{}'::jsonb"));
});
