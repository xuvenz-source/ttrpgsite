/** Shared stored-sheet defaults. */
export const uid=()=>crypto.randomUUID();
export const D=(field)=>field.type==='number'?0:field.type==='attribute'?10:
 ['inventory','collection'].includes(field.type)?[]:
 ['magic_dashboard','equipment','progression','proficiencies'].includes(field.type)?{}:'';
