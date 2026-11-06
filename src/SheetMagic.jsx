import React from 'react';
import {uid,num,safeList,clampNumber,tryFormula} from './SheetMath.js';

const tier=(i)=>({id:'tier_'+i,label:String(i),max:0,maxFormula:''});
export function makeMagicDashboardField(){
 return {id:uid('magic_'),label:'Spell resources',type:'magic_dashboard',span:3,
  showTiers:true,showSources:true,showPools:true,tierLabel:'Spell slots',
  tiers:Array.from({length:9},(_,i)=>tier(i+1)),
  sources:[{id:uid('source_'),label:'Tradition'}],
  metrics:[
   {id:'cantrips',label:'Cantrips known',formula:''},
   {id:'known',label:'Spells known',formula:''},
   {id:'prepared',label:'Prepared',formula:''},
   {id:'save_dc',label:'Save DC',formula:''}
  ],
  sourceFormulas:{},
  pools:[{id:uid('pool_'),label:'Focus points',max:0,maxFormula:'',recharge:'Long rest',showLevel:false}]
 };
}
function EditorRows({items,onChange,create,render,title,max=16}){
 return <div className="sheet-module-editor-rows">
  <div className="sheet-module-editor-bar"><strong>{title}</strong>
   <button type="button" className="secondary" disabled={items.length>=max}
    onClick={()=>onChange([...items,create()])}>+ Add</button>
  </div>
  {items.map(x=><div className="sheet-module-editor-row" key={x.id}>
   {render(x,patch=>onChange(items.map(e=>e.id===x.id?{...e,...patch}:e)))}
   <button type="button" className="secondary" title={'Remove '+x.label}
    onClick={()=>onChange(items.filter(e=>e.id!==x.id))}>×</button>
  </div>)}
 </div>;
}
export function MagicDashboardDesigner({field,onChange}){
 const update=patch=>onChange({...field,...patch});
 const tiers=safeList(field.tiers),sources=safeList(field.sources),
  metrics=safeList(field.metrics),pools=safeList(field.pools);
 return <div className="sheet-module-designer">
  <p className="muted small">Optional class-neutral spell resources. Name the traditions,
   slot tiers and pools to match your campaign. Formulas may link numeric sheet fields.</p>
  <div className="sheet-module-switches">
   {[['showTiers','Slot tiers'],['showSources','Traditions / stats'],['showPools','Other pools']].map(([id,label])=>
    <label className="sheet-module-inline-check" key={id}>
     <input type="checkbox" checked={field[id]!==false}
      onChange={e=>update({[id]:e.target.checked})}/>{label}
    </label>)}
  </div>
  <details><summary>Slot tiers (Used / Maximum)</summary>
   <label>Heading<input value={field.tierLabel||'Spell slots'}
    onChange={e=>update({tierLabel:e.target.value})}/></label>
   <EditorRows title="Tiers" max={20} items={tiers} onChange={tiers=>update({tiers})}
    create={()=>({id:uid('tier_'),label:'New tier',max:0,maxFormula:''})}
    render={(t,edit)=><>
     <input aria-label="Tier name" maxLength={32} value={t.label}
      onChange={e=>edit({label:e.target.value})}/>
     <input type="number" aria-label="Default maximum" min="0" max="999"
      value={t.max??0} onChange={e=>edit({max:clampNumber(e.target.value,0,999)})}/>
     <input aria-label="Calculated maximum (optional)" value={t.maxFormula||''}
      placeholder="Optional max formula" onChange={e=>edit({maxFormula:e.target.value})}/>
    </>}/>
  </details>
  <details><summary>Traditions and statistics</summary>
   <EditorRows title="Traditions / sources" max={16} items={sources}
    onChange={sources=>update({sources})}
    create={()=>({id:uid('source_'),label:'New tradition'})}
    render={(s,edit)=><input maxLength={35} aria-label="Tradition name"
     value={s.label} onChange={e=>edit({label:e.target.value})}/>}/>
   <EditorRows title="Statistics" max={16} items={metrics}
    onChange={metrics=>update({metrics})}
    create={()=>({id:uid('metric_'),label:'New statistic',formula:''})}
    render={(m,edit)=><>
     <input maxLength={35} aria-label="Statistic label" value={m.label}
      onChange={e=>edit({label:e.target.value})}/>
     <input value={m.formula||''} aria-label="Statistic formula"
      placeholder="Shared formula (optional)" onChange={e=>edit({formula:e.target.value})}/>
    </>}/>
   <details><summary>Optional per-tradition formula overrides</summary>
    <div className="sheet-module-formula-matrix">{sources.flatMap(source=>
     metrics.map(metric=>{
      const key=source.id+':'+metric.id;
      return <label key={key}>{source.label}: {metric.label}
       <input value={field.sourceFormulas?.[key]||''}
        placeholder="Leave empty for shared formula"
        onChange={e=>update({sourceFormulas:{
         ...(field.sourceFormulas||{}),[key]:e.target.value
        }})}/>
      </label>;
     }))}</div>
   </details>
  </details>
  <details><summary>Additional pools / charges</summary>
   <EditorRows title="Rechargeable pools" items={pools} max={16}
    onChange={pools=>update({pools})}
    create={()=>({id:uid('pool_'),label:'New pool',max:0,maxFormula:'',recharge:'',showLevel:false})}
    render={(p,edit)=><>
     <input maxLength={35} value={p.label} aria-label="Pool label"
      onChange={e=>edit({label:e.target.value})}/>
     <input type="number" min="0" max="999" aria-label="Default pool maximum"
      value={p.max??0} onChange={e=>edit({max:clampNumber(e.target.value,0,999)})}/>
     <input value={p.maxFormula||''} placeholder="Optional max formula"
      aria-label="Pool maximum formula" onChange={e=>edit({maxFormula:e.target.value})}/>
     <input value={p.recharge||''} maxLength={120} placeholder="Recharge description"
      aria-label="Recharge description" onChange={e=>edit({recharge:e.target.value})}/>
     <label className="sheet-module-inline-check"><input type="checkbox"
      checked={!!p.showLevel} onChange={e=>edit({showLevel:e.target.checked})}/>
      Track power / slot level</label>
    </>}/>
  </details>
  <p className="muted tiny">Formula syntax: 2+@{'{intelligence_mod}'}, floor(@{'{level}'}/2),
   min(5,@{'{proficiency_bonus}'}). Formulas are calculated locally, not executed as code.</p>
 </div>;
}
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
function valueMax(def,saved,values){
 const calc=tryFormula(def.maxFormula,values);
 return calc===null?clampNumber(saved.max??def.max??0,0,9999):
  Math.max(0,Math.floor(calc));
}
function NInput({value,onChange,label,minimum=0}){
 return <input type="number" aria-label={label} min={minimum}
  value={value??0} onChange={e=>onChange(clampNumber(e.target.value,minimum,9999))}/>;
}
export function MagicDashboard({field,value,onChange,sheetValues={}}){
 const val=obj(value),tiers=safeList(field.tiers,20),sources=safeList(field.sources,16),
  metrics=safeList(field.metrics,16),pools=safeList(field.pools,16);
 function changeCell(section,id,patch){
  onChange({...val,[section]:{...obj(val[section]),
   [id]:{...obj(val[section]?.[id]),...patch}}});
 }
 function changeMetric(sourceId,metricId,n){
  onChange({...val,sources:{...obj(val.sources),
   [sourceId]:{...obj(val.sources?.[sourceId]),[metricId]:n}}});
 }
 return <div className="spell-dashboard">
  <div className="spell-dashboard-main">
   <div className="spell-dashboard-left">
    {field.showSources!==false&&sources.length>0&&metrics.length>0&&
     <div className="spell-dashboard-traditions">
      <div className="spell-dashboard-title">Traditions & statistics</div>
      <div className="spell-dashboard-matrix-wrap"><table className="spell-dashboard-matrix">
       <thead><tr><th>Statistic</th>{sources.map(s=><th key={s.id}>{s.label}</th>)}</tr></thead>
       <tbody>{metrics.map(metric=><tr key={metric.id}>
        <th>{metric.label}</th>
        {sources.map(source=>{
         const formula=field.sourceFormulas?.[source.id+':'+metric.id]||metric.formula;
         const computed=tryFormula(formula,sheetValues);
         return <td key={source.id} title={formula?'Calculated: '+formula:'Editable'}>
          {formula?<output className={computed===null?'sheet-module-invalid':''}>
           {computed===null?'—':computed}</output>:
           <NInput value={val.sources?.[source.id]?.[metric.id]??0} minimum={-1000}
            label={metric.label+' for '+source.label}
            onChange={n=>changeMetric(source.id,metric.id,n)}/>}
         </td>;
        })}</tr>)}</tbody>
      </table></div>
     </div>}
    {field.showPools!==false&&pools.length>0&&<div className="spell-dashboard-pools">
     <div className="spell-dashboard-title">Additional resources</div>
     {pools.map(pool=>{
      const saved=obj(val.pools?.[pool.id]),max=valueMax(pool,saved,sheetValues);
      return <div className={'spell-dashboard-pool'+(pool.showLevel?' pool-has-level':'')} key={pool.id}>
       <div className="spell-dashboard-pool-name"><strong>{pool.label}</strong>
        {pool.recharge&&<small>{pool.recharge}</small>}</div>
       <label>Used<NInput value={saved.used??0} label={pool.label+' used'}
        onChange={used=>changeCell('pools',pool.id,{used})}/></label>
       <label>Max{pool.maxFormula?<output>{max}</output>:
        <NInput value={saved.max??pool.max??0} label={pool.label+' maximum'}
         onChange={value=>changeCell('pools',pool.id,{max:value})}/>}</label>
       {pool.showLevel&&<label>Level<NInput value={saved.level??1}
        label={pool.label+' level'} onChange={level=>changeCell('pools',pool.id,{level})}/></label>}
      </div>;
     })}
    </div>}
   </div>
   {field.showTiers!==false&&tiers.length>0&&<div className="spell-dashboard-tiers">
    <div className="spell-dashboard-title">{field.tierLabel||'Spell slots'}</div>
    <div className="spell-dashboard-tier-head"><span>Level</span><span>Used</span><span>Max</span></div>
    {tiers.map(tier=>{
     const saved=obj(val.tiers?.[tier.id]),max=valueMax(tier,saved,sheetValues);
     return <div className="spell-dashboard-tier" key={tier.id}>
      <span>{tier.label}</span>
      <NInput value={saved.used??0} label={'Tier '+tier.label+' used'}
       onChange={used=>changeCell('tiers',tier.id,{used})}/>
      {tier.maxFormula?<output title={tier.maxFormula}>{max}</output>:
       <NInput value={saved.max??tier.max??0}
        label={'Tier '+tier.label+' maximum'}
        onChange={n=>changeCell('tiers',tier.id,{max:n})}/>}
     </div>;
    })}
   </div>}
  </div>
 </div>;
}
