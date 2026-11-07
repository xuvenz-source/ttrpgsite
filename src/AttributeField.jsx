import {rollDragProps} from './HotbarRollActions.js';
import React from 'react';
import {num} from './SheetMath.js';
import {abilityModifier,attributeSaveProficiency} from './SheetDerived.js';

/** Numeric character score with an independent saving-throw proficiency checkbox.
 * The score is stored at the normal field ID, preserving Number-field values.
 */
export default function AttributeField({field,value,values={},template,onChange,onProficiencyChange,onRoll,rollSource=null}){
 const base=num(template?.modifierRules?.base,10);
 const step=Math.max(1,num(template?.modifierRules?.step,2));
 const modifier=abilityModifier(value,'score',base,step);
 const proficient=!!values[field.id+'__save_prof'];
 const proficiency=attributeSaveProficiency(field,values,template);
 const saveBonus=modifier+(proficient?proficiency:0);
 const signed=n=>(n>=0?'+':'')+n;
 return <div className="attribute-field">
  <div className="attribute-score-line">
   <label className="attribute-score">Score
    <input type="number" step="1" value={value??10}
     aria-label={field.label+' score'} onChange={e=>onChange(e.target.value)}/>
   </label>
   <output className="attribute-modifier" title="Calculated attribute modifier">
    <span className="muted tiny">Modifier</span><strong>{signed(modifier)}</strong>
   </output>
  </div>
  <div className="attribute-save-line">
   <label className="attribute-save-proficiency">
    <input type="checkbox" checked={proficient}
     onChange={e=>onProficiencyChange(e.target.checked)}/>
    Saving throw proficient
   </label>
   <button type="button" className="secondary attribute-save-roll" disabled={!onRoll}
    {...rollDragProps(rollSource?{kind:'save',...rollSource,fieldId:field.id,
     label:field.label+' Save'}:null,!onRoll)}
    onClick={()=>onRoll('1d20'+signed(saveBonus),field.label+' saving throw')}
    title={'1d20 '+signed(modifier)+(proficient?' + proficiency '+signed(proficiency):'')}>
    🎲 Save {signed(saveBonus)}
   </button>
  </div>
 </div>;
}
