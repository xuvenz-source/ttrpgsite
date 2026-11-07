import test from 'node:test';
import assert from 'node:assert/strict';
import {sheetQuickcodeReferences,hydrateSheetQuickcodes,configWithSheetQuickcodes} from '../src/SheetQuickcodes.js';
const template={tabs:[{id:'main',fields:[{id:'hp',type:'resource',label:'Hit Points'},
 {id:'eq',type:'equipment',label:'Equipment'},{id:'note',type:'text',label:'Notes'}]}]};
test('existing campaign quickcodes move into Sheet Designer, retaining field identities',()=>{
 const refs=[{code:'=@HP',source:'field',fieldId:'hp'},
  {code:'=@AC',source:'equipment_ac',fieldId:'eq'}];
 const t=hydrateSheetQuickcodes(template,refs);
 assert.deepEqual(sheetQuickcodeReferences(t).map(r=>[r.code,r.source]),
  [['=@HP','field'],['=@AC','equipment_ac']]);
 assert.equal(template.tabs[0].fields[0].quickcode,undefined);
});
test('saving exports quickcodes in current server-compatible config',()=>{
 const t=hydrateSheetQuickcodes(template,[{code:'=@HP',source:'field',fieldId:'hp'}]);
 const config=configWithSheetQuickcodes({widgets:[],npcVisibility:'dm'},t);
 assert.equal(config.references[0].code,'=@HP');assert.equal(config.npcVisibility,'dm');
});
test('duplicates and invalid quickcodes rejected',()=>{
 const t=structuredClone(template);t.tabs[0].fields[0].quickcode='=@A';t.tabs[0].fields[1].quickcode='=@a';
 assert.throws(()=>sheetQuickcodeReferences(t),/unique/);
 t.tabs[0].fields[1].quickcode='AC';assert.throws(()=>sheetQuickcodeReferences(t),/Invalid/);
});
