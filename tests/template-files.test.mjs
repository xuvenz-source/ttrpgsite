import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSheetTemplateFile,serializeSheetTemplate} from '../src/TemplateFiles.js';

const template={tabs:[{id:'main',name:'Main',fields:[
 {id:'dexterity',label:'Dexterity',type:'number',modifierEnabled:true,modifierCode:'dexterity'},
 {id:'notes',label:'Notes',type:'textarea'}]}],modifierRules:{base:10,step:2}};
test('exports and imports only portable sheet template definitions',()=>{
 const exported=serializeSheetTemplate(template);
 const parsed=parseSheetTemplateFile(exported);
 assert.deepEqual(parsed,template);
 assert.equal(JSON.parse(exported).format,'tabletop-forge-sheet-template');
 assert.ok(!exported.includes('campaign_id'));
});
test('rejects malformed or untrusted templates before import',()=>{
 assert.throws(()=>parseSheetTemplateFile('{}'),/supported/);
 assert.throws(()=>parseSheetTemplateFile('{bad'),/valid JSON/);
 assert.throws(()=>parseSheetTemplateFile(JSON.stringify({format:'tabletop-forge-sheet-template',version:1,
  template:{tabs:[{id:'main',name:'Main',fields:[{id:'dup',type:'number',label:'A'},
   {id:'dup',type:'number',label:'B'}]}]}})),/duplicated/);
});
