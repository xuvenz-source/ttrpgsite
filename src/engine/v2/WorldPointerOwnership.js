/** Native document-capture movement can claim a pointerdown before
 * React's board/editor handlers run. WeakSet has no retained pointer IDs.
 */
const claimed=new WeakSet();
const native=event=>event?.nativeEvent??event;
export function claimWorldPointerDown(event){
 const e=native(event);
 if(!e||typeof e!=='object')return false;
 claimed.add(e);return true;
}
export function wasWorldPointerDownClaimed(event){
 const e=native(event);
 return !!e&&typeof e==='object'&&claimed.has(e);
}
