/**
 * World Engine V2 — bounded spatial acceleration for ALREADY DISCLOSED scene
 * barriers. Builds only when the published scene changes, never per drag.
 *
 * This is an optimization, not an authorization predicate. On malformed
 * bounds or index budget exhaustion, query conservatively returns every
 * barrier so collision cannot become permissive due to indexing failure.
 */
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const intersects=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&
 a.minY<=b.maxY&&a.maxY>=b.minY;
export function createSceneSpatialIndex(scene,{
 bucketSize=8,maxAssignments=32000,maxQueryBuckets=2048
}={}){
 if(!scene||!Array.isArray(scene.segments)||
  !Number.isInteger(bucketSize)||bucketSize<1||bucketSize>64||
  !Number.isInteger(maxAssignments)||maxAssignments<256||
  !Number.isInteger(maxQueryBuckets)||maxQueryBuckets<1)
  throw Error('Invalid V2 scene index');
 const segments=scene.segments;
 const buckets=new Map();
 let assignments=0,linear=false;
 for(let i=0;i<segments.length;i++){
  const bounds=segments[i]?.bounds;
  if(!bounds||!['minX','minY','maxX','maxY'].every(k=>finite(bounds[k]))||
   bounds.minX>bounds.maxX||bounds.minY>bounds.maxY){
   linear=true;break;
  }
  const minX=Math.floor(bounds.minX/bucketSize);
  const maxX=Math.floor(bounds.maxX/bucketSize);
  const minY=Math.floor(bounds.minY/bucketSize);
  const maxY=Math.floor(bounds.maxY/bucketSize);
  const count=(maxX-minX+1)*(maxY-minY+1);
  if(assignments+count>maxAssignments){linear=true;break}
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
   const key=x+':'+y;
   let bucket=buckets.get(key);
   if(!bucket){bucket=[];buckets.set(key,bucket)}
   bucket.push(i);
  }
  assignments+=count;
 }
 if(linear)buckets.clear();
 return Object.freeze({
  mode:linear?'linear':'grid',
  segmentCount:segments.length,
  bucketCount:buckets.size,
  query(bounds){
   if(linear||!bounds||
    !['minX','minY','maxX','maxY'].every(k=>finite(bounds[k]))||
    bounds.minX>bounds.maxX||bounds.minY>bounds.maxY)return segments;
   const x0=Math.floor(bounds.minX/bucketSize);
   const x1=Math.floor(bounds.maxX/bucketSize);
   const y0=Math.floor(bounds.minY/bucketSize);
   const y1=Math.floor(bounds.maxY/bucketSize);
   if((x1-x0+1)*(y1-y0+1)>maxQueryBuckets)return segments;
   const matches=new Set();
   for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
    const bucket=buckets.get(x+':'+y);
    if(bucket)for(const i of bucket)matches.add(i);
   }
   // Keep stable original order for identical simultaneous wall impacts.
   return [...matches].sort((a,b)=>a-b)
    .map(i=>segments[i]).filter(segment=>intersects(segment.bounds,bounds));
  }
 });
}
