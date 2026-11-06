/** Account/campaign scoped expansion state for the right sidebar.
 * An absent key is deliberately collapsed; only explicitly true keys expand.
 */
const KEY_PATTERN=/^(units|settings|dm)\/[a-z0-9/_-]{1,110}$/i;
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const normalizeSidebarMenuState=data=>{
 if(!data||typeof data!=='object'||Array.isArray(data))return {};
 const normalized={};
 for(const [key,value] of Object.entries(data).slice(0,250)){
  if(KEY_PATTERN.test(key)&&value===true)normalized[key]=true;
 }
 return normalized;
};
export const sidebarMenuOpen=(data,key)=>data?.[key]===true;
export function changeSidebarMenuState(state,key,expanded){
 if(!KEY_PATTERN.test(key))return state;
 if(sidebarMenuOpen(state,key)===!!expanded)return state;
 const next={...normalizeSidebarMenuState(state)};
 if(expanded)next[key]=true;
 else delete next[key];
 return next;
}
export function sidebarMenuStorageKey(userId,campaignId){
 if(!UUID_PATTERN.test(String(userId||''))||
    !UUID_PATTERN.test(String(campaignId||'')))return '';
 return 'tabletopforge.sidebar-menus.v1.'+userId+'.'+campaignId;
}
export function readSidebarMenuState(storage,key){
 if(!storage||!key)return {};
 try{return normalizeSidebarMenuState(JSON.parse(storage.getItem(key)||'{}'))}
 catch{return {}}
}
export function saveSidebarMenuState(storage,key,state){
 if(!storage||!key)return;
 try{storage.setItem(key,JSON.stringify(normalizeSidebarMenuState(state)))}
 catch{/* Disabled/private storage must never break the tabletop. */}
}
