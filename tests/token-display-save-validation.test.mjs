import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {monitorValidationErrors,canSaveMonitorWidgets} from '../src/TokenDisplayValidation.js';

const editor=readFileSync(new URL('../src/TokenDisplayDesigner.jsx',import.meta.url),'utf8');
const main=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
const quickcodes=readFileSync(new URL('../src/SheetQuickcodes.js',import.meta.url),'utf8');

const validBar={
 id:'health',type:'bar',label:'HP',field:'hit_points',
 maxField:'hit_points__max',position:'top',placement:'outside',color:'#df444d'
};
const validGlobe={
 id:'armor',type:'globe',label:'Armor',field:'=@AC',maxField:'',
 position:'bottom-right',placement:'inside',color:'#408ee7'
};

test('removing every monitor is valid even if legacy quickcodes refer to text fields',()=>{
 const references=[
  {id:'sheet_character_name',code:'=@NAME',source:'field',fieldId:'character_name'},
  {id:'sheet_armor',code:'=@AC',source:'equipment_ac',fieldId:'equipment'}
 ];
 assert.deepEqual(monitorValidationErrors([]),[]);
 assert.equal(canSaveMonitorWidgets([]),true);
 assert.equal(canSaveMonitorWidgets([validBar,validGlobe]),true);
 assert.deepEqual(references.map(r=>r.code),['=@NAME','=@AC']);
});

test('monitor editor saves based on widget validity, not unrelated sheet quickcodes',()=>{
 assert.ok(editor.includes('const widgetErrors=monitorValidationErrors(config.widgets)'));
 assert.ok(editor.includes('const valid=widgetErrors.length===0'));
 assert.ok(!editor.includes('const validCodes='));
 assert.ok(editor.includes('onSave(config)'));
 assert.ok(editor.includes('disabled={!valid||!changed||saving}'));
 assert.ok(main.includes("references:camp?.token_display_config?.references||[]"));
 assert.ok(quickcodes.includes("field.type==='equipment'?'equipment_ac':'field'"));
});

test('valid monitors may use normal field IDs and configured quickcodes',()=>{
 assert.equal(canSaveMonitorWidgets([validBar,validGlobe]),true);
 assert.equal(canSaveMonitorWidgets([{
  ...validGlobe,field:'legacy-field_1'
 }]),true);
 assert.equal(canSaveMonitorWidgets([{
  ...validBar,maxField:'=@HP_MAX'
 }]),true);
});
test('invalid settings identify the individual monitor and failing input',()=>{
 assert.deepEqual(monitorValidationErrors([{
  ...validBar,label:'Hit Points',field:'invalid field name',color:'#bad',
  position:'sideways',placement:'in',maxField:'bad max'
 }]),['Hit Points: check linked field, maximum field, colour, position, placement.']);
 assert.deepEqual(monitorValidationErrors([{...validGlobe,color:'#fff'}]),
  ['Armor: check colour.']);
 assert.deepEqual(monitorValidationErrors([{...validBar,position:''}]),
  ['HP: check position.']);
 assert.deepEqual(monitorValidationErrors([{...validGlobe,field:''}]),
  ['Armor: check linked field.']);
 assert.ok(editor.includes('widgetErrors.map((message,index)'));
 assert.ok(!editor.includes('Each monitor needs a valid field name, position and colour.'));
});
test('eight monitors are allowed and nine are rejected, with empty list valid',()=>{
 const eight=Array.from({length:8},(_,i)=>({...validBar,id:'m'+i}));
 assert.deepEqual(monitorValidationErrors(eight),[]);
 assert.equal(canSaveMonitorWidgets([...eight,validGlobe]),false);
 assert.deepEqual(monitorValidationErrors(null),['Monitor settings are invalid.']);
});
