/** Issued tools are snapshots: changes to one mule do not edit other mules. */
export const TOOL_KINDS={
 torch:{label:'Light source',icon:'🔥'},
 mount:{label:'Mount / pack animal',icon:'🐴'},
 inventory:{label:'Shared inventory',icon:'🎒'}
};
export const DEFAULT_TOOL_CONFIG={
 torch:{bright:20,dim:20,color:'#ffce7a',intensity:85},
 mount:{span:2,inventoryMode:'grid',columns:8,rows:5,
  attributes:{hp:15,ac:10,speed:40,strength:16}},
 inventory:{inventoryMode:'list',columns:8,rows:5}
};
const clamp=(value,min,max,defaultValue)=>{
 const number=Number(value);
 return Number.isFinite(number)?Math.min(max,Math.max(min,number)):defaultValue;
};
export function normaliseToolConfig(kind,raw={}){
 const key=TOOL_KINDS[kind]?kind:'inventory';
 const input=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const defaults=DEFAULT_TOOL_CONFIG[key];
 if(key==='torch')return {
  bright:Math.round(clamp(input.bright,0,120,defaults.bright)),
  dim:Math.round(clamp(input.dim,0,120,defaults.dim)),
  color:/^#[0-9a-f]{6}$/i.test(String(input.color||''))?input.color:defaults.color,
  intensity:Math.round(clamp(input.intensity,0,100,defaults.intensity))
 };
 const result={
  inventoryMode:input.inventoryMode==='grid'?'grid':'list',
  columns:Math.round(clamp(input.columns,2,20,defaults.columns)),
  rows:Math.round(clamp(input.rows,2,20,defaults.rows))
 };
 if(key==='mount'){
  const attributes={};
  for(const [name,value] of Object.entries({...defaults.attributes,...input.attributes})){
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(name)||Object.keys(attributes).length>=16)continue;
   attributes[name]=clamp(value,-10000,10000,0);
  }
  result.span=Math.round(clamp(input.span,1,4,defaults.span));
  result.attributes=attributes;
 }
 return result;
}
export function toolInitialState(kind,config){
 return {items:[],attrs:kind==='mount'?{...normaliseToolConfig(kind,config).attributes}:{},
  lit:true};
}
export function toolCanControl(tool,user,isDM){
 return !!tool&&(!!isDM||tool.owner_id===user||tool.party_shared===true);
}
export function toolInventoryField(issue){
 const config=normaliseToolConfig(issue.kind,issue.config);
 return {id:'tool_inventory',type:'inventory',label:'Inventory',
  inventoryPreset:config.inventoryMode||'list',
  gridColumns:config.columns||8,gridRows:config.rows||5,
  columns:['Item','Qty','Weight','Notes']};
}
export function toolLightRadius(config){
 const normal=normaliseToolConfig('torch',config);
 return {bright:normal.bright,outer:normal.bright+normal.dim};
}
export function toolLabel(tool){
 return (tool.icon||TOOL_KINDS[tool.kind]?.icon||'🧰')+' '+(tool.name||'Tool');
}
