import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initiativeFields,normalizeCombat,currentCombatant,combatLabel,
 combatEntryForUser,availableCombatTokens,canRollCombatEntry,sortedCombatEntries,
 MAX_COMBATANTS} from '../src/CombatInitiative.js';

const token=(id,name,owner='player',visible=true,characterId='character')=>({
 id,name,owner_id:owner,visible,character_id:characterId
});
const players=[token('t1','Borin'),token('t2','Goblin','dm',true,null),
 token('t3','Secret caster','dm',false,null)];
const publicState={
 map_id:'map-1',campaign_id:'camp-1',encounter_id:'combat-1',active:true,
 round:2,current_entry_id:'e2',initiative_field:'dex',initiative_mode:'modifier',
 participants:[
  {id:'e1',name:'Borin',token_id:'t1',kind:'character',score:14},
  {id:'e2',name:'Goblin',token_id:'t2',kind:'npc',score:19},
  {id:'e3',name:'Unknown combatant',token_id:null,kind:'unknown',score:null}
 ],revision:12
};
test('numeric and attribute fields from a custom sheet can drive initiative',()=>{
 const fields=initiativeFields({tabs:[{fields:[
  {id:'dex',type:'number',label:'Dexterity'},
  {id:'reaction',type:'attribute',label:'Reaction'},
  {id:'hp',type:'resource',label:'Resource'},
  {id:'story',type:'textarea',label:'Story'}
 ]}]});
 assert.deepEqual(fields.map(f=>f.id),['dex','reaction','hp']);
});
test('shared combat is map-scoped and preserves null scores, current unit and round',()=>{
 const state=normalizeCombat(publicState);
 assert.equal(state.mapId,'map-1');
 assert.equal(state.encounterId,'combat-1');
 assert.equal(state.entries.length,3);
 assert.equal(state.entries[2].score,null);
 assert.equal(state.entries[2].kind,'unknown');
 assert.equal(state.entries[1].score,19);
 assert.equal(currentCombatant(state).id,'e2');
 assert.equal(state.round,2);
 assert.equal(normalizeCombat(null),null);
});
test('private token ID is never synthesized for the player',()=>{
 const state=normalizeCombat(publicState),hidden=state.entries[2];
 const secret=[{entry_id:'e3',token_id:'t3'}];
 assert.deepEqual(combatEntryForUser(hidden,secret,players,false),hidden);
 assert.equal(hidden.tokenId,null);
 assert.equal(combatEntryForUser(hidden,secret,players,true).tokenId,'t3');
 assert.equal(combatEntryForUser(hidden,secret,players,true).name,'Secret caster');
 assert.equal(combatLabel(players[2]),'Unknown combatant');
});
test('only an owned visible unrolled token may roll as a player',()=>{
 const combat=normalizeCombat(publicState);
 assert.equal(canRollCombatEntry(combat.entries[2],players,'player',false),false);
 assert.equal(canRollCombatEntry(combat.entries[0],players,'player',false),false);
 const pending={id:'e4',tokenId:'t1',rolled:false,score:null};
 assert.equal(canRollCombatEntry(pending,players,'player',false),true);
 assert.equal(canRollCombatEntry(pending,players,'stranger',false),false);
 assert.equal(canRollCombatEntry(pending,players,'stranger',true),true);
});
test('combatants are individual tokens; sorting leaves unresolved rolls last',()=>{
 assert.equal(MAX_COMBATANTS,60);
 const entries=normalizeCombat(publicState).entries;
 const ordered=sortedCombatEntries(entries);
 assert.deepEqual(ordered.map(e=>e.id),['e2','e1','e3']);
 assert.deepEqual(availableCombatTokens(players,{entries:[
  {tokenId:'t1'},{tokenId:'t2'}]}).map(t=>t.id),['t3']);
});
test('client renders DM section, player controls, and existing floating window architecture',()=>{
 const source=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
 const sidebar=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
 const window=readFileSync(new URL('../src/CombatTurnOrder.jsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/CombatSetupPanel.jsx',import.meta.url),'utf8');
 const hook=readFileSync(new URL('../src/useMapCombat.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/combat.css',import.meta.url),'utf8');
 assert.ok(source.includes('const combatTracker=useMapCombat('));
 assert.ok(source.includes('combatActiveTokenId={combatActiveTokenId}'));
 assert.ok(source.includes('token-current-turn'));
 assert.ok(source.includes('{combatTracker.combat?.active&&combatTracker.open&&'));
 assert.ok(sidebar.includes("menuKey={'dm/combat'}"));
 assert.ok(sidebar.includes('CombatSetupPanel'));
 assert.ok(sidebar.includes('combat-sidebar-shortcut'));
 assert.ok(window.includes('kind="combat"'));
 assert.ok(window.includes('Previous combatant'));
 assert.ok(window.includes('Next combatant'));
 assert.ok(window.includes('Re-sort by initiative'));
 assert.ok(panel.includes('Begin Combat'));
 assert.ok(panel.includes('const mapTokens=tokens.filter(token=>token?.map_id===map?.id)'));
 assert.ok(panel.includes('availableCombatTokens(mapTokens'));

 assert.ok(panel.includes('Roll all unrolled NPCs'));
 assert.ok(hook.includes("event:'*',schema:'public',table:'map_combats'"));
 assert.ok(hook.includes('lastEncounter.current.get(mapId)!==encounterKey'));
 assert.ok(css.includes('.token.token-current-turn'));
});
test('initiative migration trigger functions use valid PostgreSQL dollar quoting',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261107052003_map_combat_initiative.sql',import.meta.url),'utf8');
 for(const name of ['combat_sync_token_change','combat_sync_deleted_entry']){
  const start=sql.indexOf('create or replace function public.'+name+'()');
  const end=sql.indexOf('revoke all on function public.'+name+'()',start);
  assert.ok(start>=0&&end>start,'missing trigger function '+name);
  const body=sql.slice(start,end);
  assert.ok(body.includes(' as $$'),'function body not quoted '+name);
  assert.ok(body.includes('end $$;'),'function end not quoted '+name);
  assert.ok(!body.includes(' as $\n'),'invalid single dollar '+name);
 }
});
test('SQL restricts score writes to server RPC and separates private token IDs',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261107052003_map_combat_initiative.sql',import.meta.url),'utf8');
 assert.ok(sql.includes('public.can_view_campaign_map(campaign_id,map_id)'));
 assert.ok(sql.includes('only dm sees private combat token IDs'));
 assert.ok(sql.includes('grant select on public.map_combats to authenticated'));
 assert.ok(sql.includes('grant select on public.map_combat_entries to authenticated'));
 assert.ok(!sql.includes('grant update on public.map_combats to authenticated'));
 assert.ok(!sql.includes('grant update on public.map_combat_entries to authenticated'));
 assert.ok(sql.includes('alter publication supabase_realtime add table public.map_combats'));
 assert.ok(!sql.includes('alter publication supabase_realtime add table public.map_combat_entries'));
 assert.ok(sql.includes("else 'Unknown combatant' end"));
 assert.ok(sql.includes('v_token.owner_id is distinct from auth.uid()'));
 assert.ok(sql.includes('Roll or set all initiative scores before advancing'));
 assert.ok(sql.includes('public.is_campaign_dm(v_combat.campaign_id)'));
 assert.ok(sql.includes('from public.map_combats where map_id=p_map for update'));
 assert.ok(sql.includes('v_nat:=floor(random()*20)::integer+1'));
 assert.ok(sql.includes('roll_map_npc_initiative'));
});
