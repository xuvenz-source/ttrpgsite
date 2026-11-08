import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fogFrameDuringRefresh,tokenObservedByFogFrame,fogMasks,FOG_EXPLORED,FOG_UNEXPLORED}
 from '../src/MapFogModel.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const main=read('src/TabletopApp.jsx'),board=read('src/BattlemapBoard.jsx');
const sheet=read('src/PlayerSheetFields.jsx');
const fog=read('src/useAuthorizedMapFog.js');
const sql=read('supabase/migrations/20261108033000_player_owned_token_artwork.sql');

test('only owned player tokens open a sheet via Alt+double click',()=>{
 assert.match(board,/onDoubleClick=\{e=>\{if\(e\.altKey&&!previewActive&&/);
 assert.match(board,/t\.owner_id===user&&t\.visible!==false&&t\.map_id===map\.id/);
 assert.match(main,/async function openTokenSheet\(t\)\{\s*if\(!isDM\)\{/);
 assert.match(main,/t\.owner_id!==user\|\|t\.map_id!==playerMapId\|\|!t\.visible/);
 assert.match(main,/try\{await openOwnCharacter\(id\)\}/);
});

test('player keystrokes update local sheet state, parent receives coalesced edits',()=>{
 assert.match(sheet,/const \[values,setValues\]=useState/);
 assert.match(sheet,/setValues\(previous=>enrichSheetValues\(template,\{\.\.\.previous,\[id\]:value\}\)\)/);
 assert.match(sheet,/timer\.current=setTimeout\(\(\)=>flushRef\.current\?\.\(\),140\)/);
 assert.match(sheet,/sendRef\.current\(characterId,patch\)/);
 assert.match(sheet,/const castSafe=.*flush\(\);return onCastSpell/);
 assert.match(sheet,/const attackSafe=.*flush\(\);return onEquipmentAttack/);
 assert.match(main,/registerFlusher=\{registerSheetFlusher\}/);
 assert.match(main,/latestLocalCharacter\.current=next/);
 assert.match(main,/pending\.patches/);
 assert.match(main,/React\.startTransition\(\(\)=>setCharacters/);
});

test('server trigger allows only own sheet-approved image path',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.protect_token_fields\(\)/);
 assert.ok(sql.trimEnd().endsWith('end $function$;'));
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/old\.image_path is distinct from new\.image_path/);
 assert.match(sql,/to_jsonb\(new\)-'image_path'-'updated_at'/);
 assert.match(sql,/to_jsonb\(old\)-'image_path'-'updated_at'/);
 assert.match(sql,/old\.owner_id=auth\.uid\(\)/);
 assert.match(sql,/old\.character_id is not null/);
 assert.match(sql,/old\.visible/);
 assert.match(sql,/public\.can_view_campaign_map\(old\.campaign_id,old\.map_id\)/);
 assert.match(sql,/ch\.id=old\.character_id/);
 assert.match(sql,/ch\.campaign_id=old\.campaign_id/);
 assert.match(sql,/ch\.user_id=auth\.uid\(\)/);
 assert.match(sql,/ch\.token_path is not distinct from new\.image_path/);
 assert.match(sql,/old\.campaign_id::text\|\|\x27\/players\/\x27\|\|old\.owner_id::text/);
 assert.ok(sql.includes('[0-9a-f]{12}-token[.]webp$'));
 assert.match(sql,/Players may only change positions, statuses or DM-approved quick attributes/);
 assert.doesNotMatch(sql,/alter table public\.map_tokens disable row level security/i);
 assert.doesNotMatch(sql,/grant (all|update) on public\.map_tokens/i);
 assert.match(main,/Character artwork saved, but a map token did not update/);
});

test('pending fog keeps dimmed exploration but drops old sight',()=>{
 const frame={mapId:'test',width:3,height:2,revision:3,
  enabled:true,partyShared:false,visible:[1,2],explored:[0,1,2,4]};
 const pending=fogFrameDuringRefresh(frame,'test');
 assert.deepEqual(pending.visible,[]);
 const pixels=fogMasks(pending);
 assert.equal(pixels[1],FOG_EXPLORED);
 assert.equal(pixels[3],FOG_UNEXPLORED);
 assert.equal(fogFrameDuringRefresh(null,'test'),null);
 assert.equal(fogFrameDuringRefresh(frame,'other'),null);
 assert.match(fog,/\+\+request\.current;/);
 assert.match(fog,/previous:fogFrameDuringRefresh\(previous,mapId\)/);
 assert.match(fog,/if\(invalidate\(event\)\)changed\.request\(\)/);
 assert.match(fog,/event\?\.new\?\.fog_enforced===false&&previous\?\.enabled===false/);
});

test('stale non-owner tokens cannot remain visible through refreshing dim fog',()=>{
 const frame={mapId:'test',width:4,height:3,revision:3,
  enabled:true,partyShared:false,visible:[5],explored:[1,4,5,6]};
 const npc={id:'npc',x:1,y:1,span_x:1,span_y:1,owner_id:null};
 const nearby={...npc,x:0,y:0};
 const own={...nearby,owner_id:'player-id'};
 assert.equal(tokenObservedByFogFrame(npc,frame,'player-id'),true);
 assert.equal(tokenObservedByFogFrame(nearby,frame,'player-id'),false);
 const waiting=fogFrameDuringRefresh(frame,'test');
 assert.equal(tokenObservedByFogFrame(npc,waiting,'player-id'),false);
 assert.equal(tokenObservedByFogFrame(own,waiting,'player-id'),true);
 assert.equal(tokenObservedByFogFrame(npc,null,'player-id'),false);
 assert.equal(tokenObservedByFogFrame(npc,{...frame,enabled:false},'player-id'),true);
 assert.equal(tokenObservedByFogFrame({...npc,x:1,span_x:2},frame,'player-id'),true);
 assert.match(board,/tokenObservedByFogFrame\(t,fogFrame,user\)/);
});
