import {POSITIONS} from './TokenMonitors.jsx';

/** Validation is owned by the monitor editor, not by the sheet quickcode editor.
 * A valid =@CODE may reference a text or other non-numeric sheet field,
 * so quickcode definitions cannot invalidate an unrelated bar/globe save.
 */
const FIELD_ID=/^(?:[a-zA-Z0-9_-]{1,100}|=@[a-zA-Z][a-zA-Z0-9_]{0,31})$/;
const COLOR=/^#[0-9a-f]{6}$/i;
export function monitorValidationErrors(widgets){
 if(!Array.isArray(widgets))return ['Monitor settings are invalid.'];
 const errors=[];
 if(widgets.length>8)errors.push('Use at most eight bars or globes.');
 widgets.forEach((widget,index)=>{
  const name=String(widget?.label||'Monitor '+(index+1));
  const field=widget?.field;
  const maxField=widget?.maxField;
  const issue=[];
  if(!['bar','globe'].includes(widget?.type))issue.push('display type');
  if(!FIELD_ID.test(field||''))issue.push('linked field');
  if(widget?.type==='bar'&&maxField&&!FIELD_ID.test(maxField))issue.push('maximum field');
  if(!COLOR.test(widget?.color||''))issue.push('colour');
  if(!Object.hasOwn(POSITIONS,widget?.position))issue.push('position');
  if(!['inside','outside'].includes(widget?.placement))issue.push('placement');
  if(String(widget?.label||'').length>24)issue.push('label');
  if(issue.length)errors.push(name+': check '+issue.join(', ')+'.');
 });
 return errors;
}
export const canSaveMonitorWidgets=widgets=>monitorValidationErrors(widgets).length===0;
