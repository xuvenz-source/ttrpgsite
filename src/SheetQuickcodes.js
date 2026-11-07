/** Canonical field-attached campaign quickcodes, with legacy config hydration. */
export const QUICKCODE=/^=@[A-Za-z][A-Za-z0-9_]{0,31}$/;
export function sheetQuickcodeReferences(template){
 const refs=[],seen=new Set();
 for(const tab of template?.tabs||[])for(const field of tab.fields||[]){
  const code=String(field.quickcode||'').trim().toUpperCase();
  if(!code)continue;
  if(!QUICKCODE.test(code))throw Error('Invalid quickcode on '+(field.label||field.id)+'. Use =@NAME.');
  if(seen.has(code))throw Error('Quickcodes must be unique: '+code);
  seen.add(code);
  refs.push({id:'sheet_'+field.id,code,
   label:String(field.label||field.id).slice(0,40),
   source:field.type==='equipment'?'equipment_ac':'field',fieldId:field.id});
 }
 if(refs.length>60)throw Error('Sheet templates support up to 60 quickcodes.');
 return refs;
}
export function hydrateSheetQuickcodes(template,existing=[]){
 if(!template?.tabs)return template;
 const copy=structuredClone(template),refs=Array.isArray(existing)?existing:[];
 for(const tab of copy.tabs)for(const field of tab.fields||[]){
  if(field.quickcode)continue;
  const ref=refs.find(r=>r.fieldId===field.id&&
   r.source===(field.type==='equipment'?'equipment_ac':'field')&&QUICKCODE.test(r.code||''));
  if(ref)field.quickcode=ref.code.toUpperCase();
 }
 return copy;
}
export function configWithSheetQuickcodes(config,template){
 return {...(config||{}),references:sheetQuickcodeReferences(template)};
}
