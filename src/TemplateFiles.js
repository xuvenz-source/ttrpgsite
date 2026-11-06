import {validateModifierRules} from './SheetDerived.js';
import {sheetQuickcodeReferences} from './SheetQuickcodes.js';

const TYPES=new Set(['text','number','resource','collection','magic_dashboard',
 'equipment','progression','proficiencies','textarea','checkbox','roll','inventory']);
const FORMAT='tabletop-forge-sheet-template';
const MAX_BYTES=2_000_000;
function checkSafeTree(value,depth=0){
 if(depth>35)throw Error('Template is too deeply nested.');
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){
  if(value.length>1000)throw Error('Template array is too large.');
  value.forEach(child=>checkSafeTree(child,depth+1));
 }else{
  for(const [key,v] of Object.entries(value)){
   if(['__proto__','prototype','constructor'].includes(key))
    throw Error('Template contains a reserved property.');
   checkSafeTree(v,depth+1);
  }
 }
}
export function validateSheetTemplate(template){
 if(!template||typeof template!=='object'||Array.isArray(template))throw Error('Invalid sheet template object.');
 if(!Array.isArray(template.tabs)||template.tabs.length<1||template.tabs.length>30)
  throw Error('Template needs 1–30 tabs.');
 const tabIds=new Set(),fieldIds=new Set();
 for(const tab of template.tabs){
  if(!tab||typeof tab!=='object'||!String(tab.name||'').trim()||
   typeof tab.id!=='string'||tabIds.has(tab.id)||
   !Array.isArray(tab.fields)||tab.fields.length>150)
    throw Error('Invalid or duplicated sheet tab.');
  tabIds.add(tab.id);
  for(const field of tab.fields){
   if(!field||typeof field!=='object'||typeof field.id!=='string'||
    !field.id.trim()||fieldIds.has(field.id)||!TYPES.has(field.type)||
    !String(field.label||'').trim())
    throw Error('Invalid or duplicated sheet field.');
   fieldIds.add(field.id);
  }
 }
 checkSafeTree(template);
 validateModifierRules(template);
 sheetQuickcodeReferences(template);
 return template;
}
export function serializeSheetTemplate(template){
 const sheet=validateSheetTemplate(template);
 const result=JSON.stringify({format:FORMAT,version:1,template:sheet},null,2);
 if(new TextEncoder().encode(result).length>MAX_BYTES)throw Error('Template is larger than 2 MB.');
 return result;
}
export function parseSheetTemplateFile(json){
 if(typeof json!=='string'||new TextEncoder().encode(json).length>MAX_BYTES)
  throw Error('Choose a JSON template smaller than 2 MB.');
 let file;
 try{file=JSON.parse(json)}catch{throw Error('This file is not valid JSON.')}
 if(file?.format!==FORMAT||file?.version!==1)
  throw Error('Not a supported Tabletop Forge sheet template (version 1).');
 return structuredClone(validateSheetTemplate(file.template));
}
