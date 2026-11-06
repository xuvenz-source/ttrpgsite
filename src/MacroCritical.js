/**
 * Natural critical tracking supports one positive d20 per roll cell.
 * A modifier such as +4 or @{attack_bonus} does not change the natural face.
 * Use separate cells for multiple independent attacks (including advantage).
 */
export function supportsMacroCritical(formula){
 const compact=String(formula||'').toLowerCase().replace(/\s+/g,'');
 const d20=[...compact.matchAll(/(^|[+\-])(\d{1,2})d(\d{1,4})(?!\d)/g)]
  .filter(match=>Number(match[3])===20);
 return d20.length===1 && Number(d20[0][2])===1 && d20[0][1]!=='-';
}
