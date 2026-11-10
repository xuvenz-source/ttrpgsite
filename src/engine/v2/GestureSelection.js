/** Build one gesture's intended selection without changing authorization.
 * The Board and runtime separately verify every returned piece against the
 * current server-authorized roster and owner/tool controls.
 *
 * Player-effective DM preview is ALWAYS single-token even if the DM entered
 * preview with a previously selected multi-token/tool group.
 */
export function worldGestureSelection({
 picked,selectedTokens=[],selectedTools=[],keyboard=false,preview=false
}={}){
 if(!picked||!['token','tool'].includes(picked.kind)||
  typeof picked.id!=='string')return [];
 if(preview)return picked.kind==='token'?[picked]:[];
 const current=[
  ...selectedTokens.map(id=>({kind:'token',id})),
  ...selectedTools.map(id=>({kind:'tool',id}))
 ];
 const grouped=selectedTokens.includes(picked.id)&&picked.kind==='token'||
  selectedTools.includes(picked.id)&&picked.kind==='tool';
 return keyboard||grouped?current:[picked];
}
