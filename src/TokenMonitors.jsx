import React from 'react';

export const DEFAULT_TOKEN_DISPLAY={
 playerVisibility:'owner',
 npcVisibility:'dm',
 widgets:[
  {id:'health',type:'bar',label:'HP',field:'hp',maxField:'hp_max',color:'#df444d',position:'top',icon:'heart'},
  {id:'armor',type:'globe',label:'AC',field:'ac',maxField:'',color:'#408ee7',position:'bottom-right',icon:'shield'}
 ]
};
export const ICONS={heart:'♥',shield:'🛡',wing:'↟',star:'★',bolt:'⚡',magic:'✦',none:''};
export const POSITIONS={
 top:'Above token',bottom:'Below token',
 'top-left':'Upper left','top-right':'Upper right',
 'bottom-left':'Lower left','bottom-right':'Lower right'
};
export function normalizeConfig(input){
 const obj=input&&typeof input==='object'?input:DEFAULT_TOKEN_DISPLAY;
 const widgets=Array.isArray(obj.widgets)?obj.widgets.slice(0,8):DEFAULT_TOKEN_DISPLAY.widgets;
 return {
  playerVisibility:obj.playerVisibility==='everyone'?'everyone':'owner',
  npcVisibility:obj.npcVisibility==='everyone'?'everyone':'dm',
  widgets:widgets.filter(x=>x&&typeof x==='object')
 };
}
function number(value){
 if(value===undefined||value===null||value==='')return null;
 if(!/^-?\d+(\.\d+)?$/.test(String(value)))return null;
 const n=Number(value);
 return Number.isFinite(n)?n:null;
}
export function TokenMonitors({config,fields,preview=false,zoom=1}){
 const settings=normalizeConfig(config);
 if(!preview&&!fields)return null;
 const data=fields||{hp:14,hp_max:22,ac:16,elevation:25};
 const counters={};
 return <div className="token-monitor-layer" aria-hidden="true"
  style={{'--overlay-scale':Math.max(.45,Math.min(1.2,Number(zoom)||1))}}>
  {settings.widgets.map((w,i)=>{
   const kind=w.type==='globe'?'globe':'bar';
   const position=POSITIONS[w.position]?w.position:(kind==='bar'?'top':'bottom-right');
   const index=counters[position]||0;counters[position]=index+1;
   const value=number(data[w.field]),max=number(data[w.maxField]);
   const fraction=max!==null&&max>0&&value!==null?Math.max(0,Math.min(1,value/max)):null;
   const color=/^#[0-9a-f]{6}$/i.test(w.color||'')?w.color:'#df444d';
   const style={'--monitor-color':color,'--monitor-index':index};
   const label=String(w.label||w.field||'Resource').slice(0,20);
   const icon=ICONS[w.icon]??ICONS.none;
   return kind==='bar'?
    <div key={w.id||i} className={'token-monitor monitor-bar pos-'+position} style={style}
     title={label+(value!==null?': '+value:'')+(max!==null?' / '+max:'')}>
     <div className="monitor-track">
      <div className="monitor-fill" style={{width:fraction===null?'0%':(fraction*100)+'%'}}/>
      <span className="monitor-number">{w.showValue===false?'':(value??'—')+(max!==null?'/'+max:'')}</span>
     </div>
    </div>
   :<div key={w.id||i} className={'token-monitor monitor-globe pos-'+position} style={style}
     title={label+(value!==null?': '+value:'')}>
     <span className="monitor-icon">{icon}</span>
     <span className="monitor-globe-number">{value??'—'}</span>
    </div>;
  })}
 </div>;
}
