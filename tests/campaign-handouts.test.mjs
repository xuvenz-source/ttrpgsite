import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizePinPosition,pinVisibleTo,handoutInLibrary,folderHandouts,PIN_ICONS}
 from '../src/CampaignHandouts.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

const map={width:700,height:560,grid_size:70};
test('pin positions keep fractional-cell placement inside current map bounds',()=>{
 assert.deepEqual(normalizePinPosition(3.345,2.005,map),{x:3.35,y:2.01});
 assert.deepEqual(normalizePinPosition(-3,800,map),{x:0,y:7.9});
 assert.deepEqual(normalizePinPosition(NaN,Infinity,map),{x:0,y:0});
});
test('hidden pins are DM-only; collected/revealed handouts are party-readable',()=>{
 assert.equal(pinVisibleTo({visible:false},true),true);
 assert.equal(pinVisibleTo({visible:false},false),false);
 assert.equal(pinVisibleTo({visible:true},false),true);
 assert.equal(handoutInLibrary({revealed:false},false),false);
 assert.equal(handoutInLibrary({revealed:false},true),true);
 assert.equal(handoutInLibrary({revealed:true},false),true);
 assert.ok(PIN_ICONS.sign&&PIN_ICONS.engraving&&PIN_ICONS.note);
});
test('folder listings exclude unrelated documents and retain alphabetical order',()=>{
 const docs=[
  {id:'b',title:'Zulu',folder_id:'f'},
  {id:'c',title:'Forgotten',folder_id:null},
  {id:'a',title:'Alpha',folder_id:'f'}
 ];
 assert.deepEqual(folderHandouts(docs,'f').map(d=>d.id),['a','b']);
 assert.deepEqual(folderHandouts(docs,null).map(d=>d.id),['c']);
});
test('Units has a dedicated Handouts subsection with folder management and per-note reveal',()=>{
 const sidebar=source('src/TabletopSidebar.jsx');
 const panel=source('src/CampaignHandoutsPanel.jsx');
 assert.match(sidebar,/unitsSubsection==='handouts'/);
 assert.match(sidebar,/>Handouts<\/button>/);
 assert.match(sidebar,/<CampaignHandoutsPanel/);
 assert.match(panel,/library\.createFolder\(/);
 assert.match(panel,/library\.renameFolder\(/);
 assert.match(panel,/library\.deleteFolder\(/);
 assert.match(panel,/library\.createHandout\(/);
 assert.match(panel,/library\.updateHandout\(note,\{revealed:!note\.revealed\}\)/);
 assert.match(panel,/onPreparePin\(note\.id\)/);
 assert.match(panel,/onDrop=\{e=>moveToFolder\(e,folderId\)\}/);
});
test('handout window permits DM editing and note pickup without exposing edit controls',()=>{
 const ui=source('src/CampaignHandoutWindow.jsx');
 assert.match(ui,/\{isDM\?<div className="campaign-handout-edit">/);
 assert.match(ui,/if\(window\.confirm\('Delete this handout and its map pins\?'\)\)/);
 assert.match(ui,/onCollect\(pin\)/);
 assert.match(ui,/Pick up · Save to Handouts/);
 assert.match(ui,/visible:e\.target\.checked/);
 assert.match(ui,/collectable:e\.target\.checked/);
 assert.match(ui,/revealed:e\.target\.checked/);
});
test('battlemap places and moves clickable pins without mixing them into light geometry',()=>{
 const mapPins=source('src/MapPinLayer.jsx');
 const app=source('src/main.jsx');
 const settings=source('src/MapSettingPanel.jsx');
 assert.match(mapPins,/pinVisibleTo\(pin,isDM\)/);
 assert.match(mapPins,/onCreate\?\.\(editor\.pinHandoutId,p\)/);
 assert.match(mapPins,/onMove\?\.\(pin,\{x:next\.x,y:next\.y\}\)/);
 assert.match(app,/onCreateHandoutPin=\{createHandoutPin\}/);
 assert.match(app,/onOpenHandoutPin=\{openMapHandoutPin\}/);
 assert.match(app,/<MapPinLayer/);
 assert.match(settings,/\{id:'pin',label:'Place handout pin'\}/);
 assert.match(settings,/pinHandoutId/);
});
test('private note contents never travel in a Realtime broadcast payload',()=>{
 const hook=source('src/useCampaignHandouts.js');
 const sql=source('staging/sql-candidates/campaign_pins_and_handouts.sql');
 assert.match(hook,/table:'campaign_handout_events'/);
 assert.doesNotMatch(hook,/table:'campaign_handouts',filter/);
 assert.match(sql,/ONLY the no-content revision table joins Supabase Realtime/);
 assert.match(sql,/tablename='campaign_handout_events'/);
 assert.doesNotMatch(sql,/alter publication supabase_realtime add table public\.campaign_handouts/);
 assert.doesNotMatch(sql,/alter publication supabase_realtime add table public\.campaign_map_pins/);
});
test('RLS, map access and party pickup are verified server-side',()=>{
 const sql=source('staging/sql-candidates/campaign_pins_and_handouts.sql');
 for(const table of ['campaign_handout_folders','campaign_handouts','campaign_map_pins',
  'campaign_handout_events'])
  assert.ok(sql.includes('alter table public.'+table+' enable row level security'));
 assert.match(sql,/public\.can_view_campaign_map\(campaign_id,map_id\)/);
 assert.match(sql,/public\.can_view_campaign_map\(target\.campaign_id,target\.map_id\)/);
 assert.match(sql,/public\.is_campaign_member\(target\.campaign_id\)/);
 assert.match(sql,/not target\.visible or not target\.collectable/);
 assert.match(sql,/set collected=true,revealed=true/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.collect_campaign_map_pin\(uuid\) to authenticated/);
 assert.match(sql,/set visible=false,updated_at=now\(\)/);
 assert.match(sql,/where h\.folder_id=campaign_handout_folders\.id/);
 assert.match(sql,/where p\.handout_id=campaign_handouts\.id/);
});
test('DB release remains separate and follows live-testing project policy',()=>{
 const sql=source('staging/sql-candidates/campaign_pins_and_handouts.sql');
 assert.match(sql,/STAGING CANDIDATE ONLY/);
 assert.match(sql,/existing live test campaigns after explicit release approval/);
});
