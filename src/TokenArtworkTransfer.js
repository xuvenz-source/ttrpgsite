export const MAX_TOKEN_IMAGE_BYTES=5*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function campaignArtworkPaths(campaignId,userId,mode,id){
 if(!UUID.test(String(campaignId||''))||!UUID.test(String(userId||''))||
    !UUID.test(String(id||'')))throw Error('Invalid campaign, account or artwork ID.');
 if(!['players','npcs'].includes(mode))throw Error('Invalid artwork destination.');
 const root=mode==='npcs'?campaignId+'/npcs/':
  campaignId+'/players/'+userId+'/';
 return {portraitPath:root+id+'-portrait.webp',tokenPath:root+id+'-token.webp'};
}
export function validateTokenArtwork(portraitBlob,tokenBlob,maxBytes=MAX_TOKEN_IMAGE_BYTES){
 if(!portraitBlob||!tokenBlob||
  !Number.isFinite(Number(portraitBlob.size))||
  !Number.isFinite(Number(tokenBlob.size))||
  portraitBlob.size<=0||tokenBlob.size<=0)
  throw Error('One of the saved images is empty or missing. Recreate the token in your library.');
 if(portraitBlob.size>maxBytes||tokenBlob.size>maxBytes)
  throw Error('Portrait or token artwork exceeds the campaign’s 5 MB image limit.');
}
/** Only retry network/transient failures, never RLS or missing file errors. */
export function isRetryableArtworkError(error){
 const status=Number(error?.statusCode||error?.status||0);
 return status===408||status===429||status>=500&&status<600||
  /network|connection|timeout|timed out|fetch failed/i.test(String(error?.message||''));
}
