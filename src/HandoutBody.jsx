import React from 'react';

/** Minimal safe handout renderer: preserve prose and show HTTPS image references.
 * HTML is always treated as text; no trusted-HTML bypass or scriptable URLs. */
export default function HandoutBody({body}){
 const source=String(body||'');
 const image=/!\[([^\]\n]{0,120})\]\((https:\/\/[^\s)]+)\)/g;
 const nodes=[];let offset=0;let match;
 while((match=image.exec(source))!==null){
  if(match.index>offset)nodes.push(<span key={'text'+offset}>{source.slice(offset,match.index)}</span>);
  nodes.push(<img key={'image'+match.index} src={match[2]} alt={match[1]}
   loading="lazy" referrerPolicy="no-referrer"/>);
  offset=image.lastIndex;
 }
 if(offset<source.length)nodes.push(<span key={'text'+offset}>{source.slice(offset)}</span>);
 return <div className="map-handout-bubble-body">{nodes.length?nodes:'No text'}</div>;
}
