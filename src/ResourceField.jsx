import React from 'react';

/** One sheet field with two persistent numbers.
 * The previous Number field value remains readable when the DM changes its type
 * to Resource: that scalar becomes Current until the character is edited.
 */
export function resourceParts(value){
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  return {current:value.current??'',max:value.max??''};
 }
 return {current:value??'',max:''};
}
export default function ResourceField({value,onChange,disabled=false}){
 const resource=resourceParts(value);
 function change(key,next){onChange({...resource,[key]:next})}
 return <div className="resource-field">
  <label>Current
   <input type="number" step="1" disabled={disabled}
    value={resource.current} aria-label="Current value"
    onChange={e=>change('current',e.target.value)}/>
  </label>
  <span className="resource-separator" aria-hidden="true">/</span>
  <label>Maximum
   <input type="number" step="1" disabled={disabled}
    value={resource.max} aria-label="Maximum value"
    onChange={e=>change('max',e.target.value)}/>
  </label>
 </div>;
}
