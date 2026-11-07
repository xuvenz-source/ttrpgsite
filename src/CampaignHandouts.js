/** Shared client geometry and display helpers; authorization always lives in Postgres. */
export const PIN_ICONS={
 note:'📜',sign:'🪧',engraving:'🪨',book:'📖',clue:'🔎',
 pin:'📍',arrow:'➡️',trap:'🪤',warning:'⚠️',flag:'🚩',skull:'💀',star:'⭐'
};
export const PIN_KINDS=Object.keys(PIN_ICONS);
export function normalizePinPosition(x,y,map){
 const cols=Math.max(1,Number(map?.width)/Math.max(1,Number(map?.grid_size))),
  rows=Math.max(1,Number(map?.height)/Math.max(1,Number(map?.grid_size)));
 const safe=(n,maximum)=>{
  const value=Number(n);
  return Number.isFinite(value)?
   Math.max(0,Math.min(Math.max(0,maximum-.1),Math.round(value*100)/100)):0;
 };
 return {x:safe(x,cols),y:safe(y,rows)};
}
export function pinVisibleTo(pin,isDM){
 return !!pin&&(!!isDM||pin.visible===true);
}
export function handoutInLibrary(handout,isDM){
 return !!handout&&(!!isDM||handout.revealed===true);
}
export function folderHandouts(handouts,folderId){
 return handouts.filter(note=>(note.folder_id||null)===(folderId||null))
  .sort((a,b)=>a.title.localeCompare(b.title));
}
