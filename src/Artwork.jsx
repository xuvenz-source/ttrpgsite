import React,{useEffect,useState} from 'react';

const signedCache=new Map();
export default function Artwork({db,path,bucket='tabletop-artwork',alt='',className='',style={}}){
 const [src,setSrc]=useState('');
 useEffect(()=>{let alive=true;setSrc('');if(!path||!db)return;
 const cacheKey=bucket+':'+path;
 const refresh=async()=>{const cached=signedCache.get(cacheKey);
   if(cached&&cached.expires>Date.now()){if(alive)setSrc(cached.url);return;}
   const {data,error}=await db.storage.from(bucket).createSignedUrl(path,3600);
   if(!error&&data?.signedUrl){signedCache.set(cacheKey,{url:data.signedUrl,expires:Date.now()+54*60*1000});if(alive)setSrc(data.signedUrl);}
 };
 refresh();const clock=setInterval(refresh,54*60*1000);return()=>{alive=false;clearInterval(clock)}
 },[db,path,bucket]);
 return src?<img alt={alt} className={className} style={style} src={src} draggable={false}/>:<span className={'art-fallback '+className} style={style}>{alt?.slice(0,2).toUpperCase()||'⚔'}</span>;
}