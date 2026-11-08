import React,{useEffect,useState} from 'react';
import {signedAssetStore} from './SignedAssetUrls.js';

// A shared cache and refresh timer keeps dozens of mounted tokens from
// creating separate intervals and duplicate signed-URL requests.
function Artwork({db,path,bucket='tabletop-artwork',alt='',className='',style={},loading='lazy'}){
 const [src,setSrc]=useState(()=>signedAssetStore.peek(db,bucket,path));
 useEffect(()=>{
  setSrc(signedAssetStore.peek(db,bucket,path));
  return signedAssetStore.subscribe(db,bucket,path,setSrc);
 },[db,path,bucket]);
 return src?<img alt={alt} className={className} style={style}
  src={src} draggable={false} loading={loading}/>:
  <span className={'art-fallback '+className} style={style}>{alt?.slice(0,2).toUpperCase()||'⚔'}</span>;
}
export default React.memo(Artwork);
