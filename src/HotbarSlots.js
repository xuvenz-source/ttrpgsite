/** Shared eight-slot hotbar operations. Keep assignments and keyboard
 * positions independent: dragging reorders commands, not keybindings. */
export const EMPTY_HOTBAR=Array.from({length:8},()=>({label:'',command:''}));
export function normaliseHotbar(data){
 return Array.from({length:8},(_,i)=>{
  const slot=Array.isArray(data)?data[i]:null;
  return {
   label:typeof slot?.label==='string'?slot.label.slice(0,40):'',
   command:typeof slot?.command==='string'?slot.command.slice(0,300):''
  };
 });
}
/** Move an occupied slot and shift intervening entries without overwriting. */
export function reorderHotbarSlots(slots,source,destination){
 const result=normaliseHotbar(slots);
 if(!Number.isInteger(source)||!Number.isInteger(destination)||
  source<0||source>=result.length||destination<0||destination>=result.length||
  !result[source].command||source===destination)return result;
 const [entry]=result.splice(source,1);
 result.splice(destination,0,entry);
 return result;
}
/** Dragging outside the hotbar removes the assignment, not the saved macro. */
export function removeHotbarSlot(slots,index){
 const result=normaliseHotbar(slots);
 if(Number.isInteger(index)&&index>=0&&index<result.length)
  result[index]={label:'',command:''};
 return result;
}
