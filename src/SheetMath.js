export const uid=(prefix='f_')=>prefix+crypto.randomUUID().replace(/-/g,'').slice(0,10);
export const num=(v,fallback=0)=>{
 if(v&&typeof v==='object'&&!Array.isArray(v))v=v.current;
 if(v===null||v===undefined||v==='')return fallback;
 const n=Number(v);return Number.isFinite(n)?n:fallback;
};
export const safeList=(arr,max=100)=>Array.isArray(arr)?arr.slice(0,max):[];
export const clampNumber=(v,min=0,max=9999)=>Math.max(min,Math.min(max,num(v)));
export const numberFields=template=>safeList(template?.tabs).flatMap(tab=>safeList(tab.fields))
 .filter(f=>f&&['number','resource'].includes(f.type))
 .map(f=>({id:f.id,label:f.label||f.id}));
/** Client-side, non-executable arithmetic for optional DM-derived fields.
 * Supports @{field_id}, parentheses, + - * /, min/max/floor/ceil/abs.
 */
export function calculateFormula(expression,values={}){
 const raw=String(expression||'').trim();
 if(!raw)return null;
 if(raw.length>160)throw Error('Formula too long');
 const replaced=raw.replace(/@\{([a-zA-Z0-9_-]{1,80})\}/g,(_,id)=>{
  const n=num(values[id],NaN);
  if(!Number.isFinite(n))throw Error('Missing numeric attribute '+id);
  return '('+n+')';
 }).replace(/\s+/g,'');
 if(!/^[a-zA-Z0-9.,()+*/-]+$/.test(replaced))throw Error('Invalid characters');
 const tokens=replaced.match(/\d+(?:\.\d+)?|[a-zA-Z]+|[(),+\-*/]/g)||[];
 if(tokens.join('')!==replaced||tokens.length>90)throw Error('Invalid formula');
 let i=0,nesting=0;
 function expr(){let x=term();while(['+','-'].includes(tokens[i])){
  const o=tokens[i++],y=term();x=o==='+'?x+y:x-y;
 }return x;}
 function term(){let x=unary();while(['*','/'].includes(tokens[i])){
  const o=tokens[i++],y=unary();
  if(o==='/'&&y===0)throw Error('Division by zero');
  x=o==='*'?x*y:x/y;
 }return x;}
 function unary(){
  if(tokens[i]==='+'){i++;return unary()}
  if(tokens[i]==='-'){i++;return -unary()}
  return atom();
 }
 function atom(){
  if(++nesting>24)throw Error('Formula too deeply nested');
  try{
   const token=tokens[i++];
   if(token==='('){const x=expr();if(tokens[i++]!==')')throw Error('Missing )');return x}
   if(/^\d/.test(token||''))return Number(token);
   if(['min','max','floor','ceil','abs'].includes(token)){
    if(tokens[i++]!=='(')throw Error('Missing function (');
    const args=[expr()];
    while(tokens[i]===','){i++;args.push(expr());if(args.length>8)throw Error('Too many arguments')}
    if(tokens[i++]!==')')throw Error('Missing function )');
    if(['floor','ceil','abs'].includes(token)&&args.length!==1)throw Error('Expected one argument');
    if(['min','max'].includes(token)&&args.length<2)throw Error('Expected more arguments');
    return token==='min'?Math.min(...args):token==='max'?Math.max(...args):
     token==='floor'?Math.floor(args[0]):token==='ceil'?Math.ceil(args[0]):Math.abs(args[0]);
   }
   throw Error('Invalid formula value: '+(token||'empty'));
  }finally{nesting--}
 }
 const result=expr();
 if(i!==tokens.length||!Number.isFinite(result)||Math.abs(result)>1e9)throw Error('Invalid result');
 return result;
}
export const tryFormula=(expression,values)=>{
 try{return calculateFormula(expression,values)}catch{return null}
};
