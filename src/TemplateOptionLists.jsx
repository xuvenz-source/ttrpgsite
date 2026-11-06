import React from 'react';
import {uid,safeList} from './SheetMath.js';
import {numericFieldsWithDerived} from './SheetDerived.js';

export const optionLists=template=>safeList(template?.optionLists,30);
export const optionListById=(template,id)=>optionLists(template).find(list=>list.id===id);
export const listItems=list=>safeList(list?.items,60).filter(item=>item&&item.id);

export function SheetListField({field,template,value,onChange}){
 const list=optionListById(template,field.listId),items=listItems(list);
 return <div className="sheet-list-field">
  <select aria-label={field.label} value={value??''} onChange={e=>onChange(e.target.value)}>
   <option value="">Choose {list?.name||'an option'}…</option>
   {items.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
   {value&&!items.some(item=>item.id===value)&&
    <option value={value}>Previously selected option</option>}
  </select>
  {!list&&<span className="muted tiny">Choose a saved list in the sheet designer.</span>}
 </div>;
}

/** Campaign/template-owned reusable lists. A list can power ordinary select fields
 * or a weapon's deliberately small modifier selector.
 */
export function TemplateListsDesigner({template,changeTemplate}){
 const lists=optionLists(template),fields=numericFieldsWithDerived(template);
 const editList=(id,patch)=>changeTemplate(t=>{
  t.optionLists=safeList(t.optionLists,30).map(list=>list.id===id?{...list,...patch}:list);
 });
 const editItem=(list,itemId,patch)=>editList(list.id,{
  items:listItems(list).map(item=>item.id===itemId?{...item,...patch}:item)
 });
 function addList(){
  if(lists.length>=30)return;
  changeTemplate(t=>{
   t.optionLists=[...(t.optionLists||[]),{
    id:uid('list_'),name:'New modifier list',
    items:[{id:uid('option_'),label:'Strength',statField:'strength',statMode:'score'}]
   }];
  });
 }
 return <details className="template-list-designer">
  <summary>Reusable lists <span className="muted tiny">({lists.length} defined)</span></summary>
  <p className="muted small">Define named dropdown lists once. Insert them as List fields
   or assign them to an equipment section for a concise weapon modifier menu.
   Linked attributes resolve to the existing score or modifier when selected.</p>
  <button type="button" className="secondary" onClick={addList}
   disabled={lists.length>=30}>+ Create list</button>
  {lists.map(list=><section className="template-list-definition" key={list.id}>
   <div className="template-list-heading">
    <label>List name<input value={list.name||''} maxLength={60}
     onChange={e=>editList(list.id,{name:e.target.value})}/></label>
    <button type="button" className="secondary" onClick={()=>{
     if(confirm('Remove this list? Existing sheet selections and weapon values will not be deleted.'))
      changeTemplate(t=>t.optionLists=optionLists(t).filter(item=>item.id!==list.id));
    }}>Remove list</button>
   </div>
   <div className="template-list-items">
    {listItems(list).map(item=><div className="template-list-item" key={item.id}>
     <label>Option<input maxLength={50} value={item.label||''}
      onChange={e=>editItem(list,item.id,{label:e.target.value})}/></label>
     <label>Linked weapon modifier
      <select value={item.statField||''}
       onChange={e=>editItem(list,item.id,{statField:e.target.value})}>
       <option value="">Default weapon attribute</option>
       {fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
     </label>
     <label>Interpret as
      <select value={item.statMode||'score'}
       onChange={e=>editItem(list,item.id,{statMode:e.target.value})}>
       <option value="score">Score → modifier</option>
       <option value="modifier">Already a modifier</option>
      </select>
     </label>
     <button type="button" className="secondary" aria-label={'Remove '+item.label}
      onClick={()=>editList(list.id,{items:listItems(list).filter(x=>x.id!==item.id)})}>×</button>
    </div>)}
   </div>
   <button type="button" className="secondary" disabled={listItems(list).length>=60}
    onClick={()=>editList(list.id,{items:[...listItems(list),{
     id:uid('option_'),label:'New option',statField:'',statMode:'score'
    }]})}>+ Option</button>
  </section>)}
 </details>;
}
