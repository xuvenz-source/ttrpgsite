import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appendMacroReference} from '../src/MacroFormula.js';
import {supportsMacroCritical} from '../src/MacroCritical.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=read('src/MacroBuilder.jsx'),sql=read('supabase/migrations/20261108043000_macro_quickcode_resolution.sql');
const css=read('src/styles/05-rolls-and-macros.css');

test('attribute insertion automatically provides one plus, preserving operators',()=>{
 assert.equal(appendMacroReference('1d20','@{dexterity_mod}'),'1d20+@{dexterity_mod}');
 assert.equal(appendMacroReference('1d20+','@{dexterity_mod}'),'1d20+@{dexterity_mod}');
 assert.equal(appendMacroReference('1d20 - ','@{dexterity_mod}'),'1d20 -@{dexterity_mod}');
 assert.equal(appendMacroReference('','@{dexterity_mod}'),'@{dexterity_mod}');
 assert.equal(appendMacroReference('1d8+@{strength_mod}','@{proficiency_bonus}'),
  '1d8+@{strength_mod}+@{proficiency_bonus}');
 assert.equal(appendMacroReference('1d20','=@AC'),'1d20+=@AC');
 assert.equal(appendMacroReference('1d8+=@AC','=@HP'),'1d8+=@AC+=@HP');
 assert.equal(appendMacroReference('','=@AC'),'=@AC');
 assert.equal(supportsMacroCritical(appendMacroReference('1d20','=@AC')),true);
});

test('macro builder refuses arbitrary expression fragments as inserted references',()=>{
 for(const input of ['(@AC)','=@','@{bad id}', ';DROP TABLE', '1d6','=@AC+5'])
  assert.throws(()=>appendMacroReference('1d20',input),/valid sheet attribute or quickcode/);
});

test('all linked Attack fields and standard roll fields offer the same insertion controls',()=>{
 assert.match(ui,/function FormulaReferenceInsert\(/);
 assert.equal((ui.match(/<FormulaReferenceInsert attributes=\{attrs\} quickcodes=\{quickcodes\}/g)||[]).length,4);
 for(const field of ['cell.formula','cell.damage','cell.critDamage'])
  assert.ok(ui.includes('formula={'+field+"||''}"),'Missing selector for '+field);
 assert.match(ui,/onInsert=\{damage=>updateCell\(r\.id,cell\.id,\{damage\}\)\}/);
 assert.match(ui,/onInsert=\{critDamage=>updateCell\(r\.id,cell\.id,\{critDamage\}\)\}/);
 assert.match(ui,/appendMacroReference\(formula,'@\{'\+e\.target\.value\+'\}'\)/);
 assert.match(ui,/appendMacroReference\(formula,e\.target\.value\)/);
 assert.match(ui,/\+ Insert sheet attribute/);
 assert.match(ui,/\+ Insert sheet quickcode/);
 assert.match(ui,/quickcodes=useMemo/);
 assert.match(css,/\.macro-formula-inserts\{display:flex/);
});

test('macro SQL resolves configured codes before every roll while retaining access checks',()=>{
 assert.match(sql,/create or replace function public\.resolve_tabletop_macro_quickcodes\(/);
 assert.match(sql,/public\.token_reference_value\(p_config,p_template,p_sheet,v_code\)/);
 assert.match(sql,/v_code:=upper\(v_match\[1\]\)/);
 assert.match(sql,/jsonb_typeof\(v_value\)<>'number'/);
 assert.match(sql,/v_numeric<>trunc\(v_numeric\) or abs\(v_numeric\)>10000/);
 assert.match(sql,/Select a character or NPC sheet source/);
 assert.match(sql,/Unknown or unavailable macro quickcode/);
 assert.match(sql,/revoke all on function public\.resolve_tabletop_macro_quickcodes\(/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.equal((sql.match(/public\.resolve_tabletop_macro_quickcodes\(v_cell->>/g)||[]).length,5);
 assert.match(sql,/v_macro\.user_id is distinct from auth\.uid\(\)/);
 assert.match(sql,/not public\.is_campaign_member\(v_macro\.campaign_id\)/);
 assert.match(sql,/if not public\.is_campaign_dm\(v_macro\.campaign_id\)/);
 assert.match(sql,/public\.valid_tabletop_macro_rows\(v_macro\.rows\)/);
 assert.match(sql,/public\.tabletop_macro_natural_d20/);
 assert.match(sql,/v_choose1:=v_mode='normal'/);
 assert.doesNotMatch(sql,/alter table .* disable row level security/i);
 assert.ok(sql.trimEnd().endsWith('end $function$;'));
});
