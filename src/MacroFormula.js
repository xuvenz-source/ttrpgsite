/** Appends a linked numeric attribute or quickcode with exactly one
 * arithmetic operator. A manually supplied trailing + or - is honored;
 * an empty formula can be a standalone numeric reference.
 */
export function appendMacroReference(formula,reference){
 const token=String(reference||'');
 if(!/^@\{[a-zA-Z0-9_.-]{1,100}\}$/.test(token)&&
    !/^=@[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(token))
  throw Error('Choose a valid sheet attribute or quickcode.');
 const existing=String(formula??'').trimEnd();
 const operator=existing&&!/[+-]$/.test(existing)?'+':'';
 return existing+operator+token;
}
