import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const sql=readFileSync(new URL('../staging/sql-candidates/npc_template_inheritance_and_dead_status.sql',import.meta.url),'utf8');

test('Dead is a normal shared status, selectable through Quick Adjust',()=>{
 const status=source('TokenStatuses.jsx');
 const quick=source('TokenQuickEdit.jsx');
 assert.ok(status.includes("item('dead','Dead','conditions','skull')"));
 assert.ok(quick.includes('className="quick-token-dead-toggle"'));
 assert.ok(quick.includes('<span>Dead</span>'));
 assert.ok(quick.includes('setStatusValues(previous=>normalizedEffects(checked?'));
 assert.ok(quick.includes('onApplyStatuses(token,statusValues)'));
 assert.ok(quick.includes('disabled={!canEditStatuses||deadLimitReached}'));
});

test('Dead status tints the full token for all viewers without obscuring badges or movement',()=>{
 const app=source('main.jsx');
 const css=source('style.css');
 assert.ok(app.includes("effect.id==='dead')?' token-dead'"));
 assert.ok(app.includes('<span className="token-dead-overlay" aria-hidden="true"/>'));
 assert.ok(app.includes("normalizedEffects(t.status_effects).some(effect=>effect.id==='dead')"));
 assert.match(css,/\.token \.token-dead-overlay\{[^}]*pointer-events:none/);
 assert.match(css,/background:rgba\(197,31,47,\.49\)/);
 assert.ok(app.includes('<TokenStatusBadges effects={t.status_effects}'));
});

test('status update uses the existing validated RPC; staging candidate expands its whitelist',()=>{
 const app=source('main.jsx');
 assert.ok(app.includes("db.rpc('set_token_statuses',{p_token:token.id,p_statuses:effects})"));
 assert.ok(sql.includes("create or replace function public.valid_token_statuses"));
 assert.match(sql,/'blinded','charmed','deafened','dead','exhaustion'/);
 assert.match(sql,/if v_id<>all\(v_builtin\)/);
 assert.match(sql,/if v_level>v_max then return false/);
 assert.doesNotMatch(sql,/grant execute .* to anon/i);
});

test('bestary sheet is freshly loaded for every token instance with independent values',()=>{
 const app=source('main.jsx');
 assert.ok(app.includes("db.from('npc_templates')"));
 assert.ok(app.includes(".eq('id',npcId).eq('campaign_id',activeId).single()"));
 assert.ok(app.includes("npc_template_id:npc.id,npc_values:structuredClone(npc.field_values||{})"));
 assert.ok(app.includes("name:draft.name.trim(),npc_values:draft.values"));
 assert.ok(app.includes('await refreshNpcs();\n   // Template edits can propagate'));
 const editor=source('NpcEditor.jsx');
 assert.ok(editor.includes('async function restoreBestiaryDefaults()'));
 assert.ok(editor.includes('Restore Bestiary defaults'));
 assert.ok(editor.includes("record.kind==='token'&&record.data.npc_template_id"));
 assert.ok(editor.includes(".eq('campaign_id',campaignId).maybeSingle()"));
 assert.ok(editor.includes('setDraft(old=>({...old,values:enrichSheetValues(template,'));
});

test('inherited bestiary stats update only when still equal to the previous default',()=>{
 assert.ok(sql.includes('create or replace function public.inherit_npc_template_values('));
 assert.ok(sql.includes('v_current is not distinct from v_prev'));
 assert.ok(sql.includes("v_key='character_name'"));
 assert.ok(sql.includes("array['current','max']::text[]"));
 assert.ok(sql.includes('v_current->v_part is not distinct from v_prev->v_part'));
 assert.ok(sql.includes('where t.npc_template_id=new.id and t.campaign_id=new.campaign_id'));
 assert.ok(sql.includes('and t.character_id is null'));
 assert.ok(sql.includes('new.field_values is not distinct from old.field_values'));
 assert.ok(sql.includes('after update of field_values on public.npc_templates'));
 assert.ok(sql.includes('revoke all on function public.propagate_npc_template_defaults()'));
 assert.match(sql,/STAGING CANDIDATE ONLY\. DO NOT EXECUTE AGAINST PRODUCTION/);
});
