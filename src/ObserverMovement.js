/**
 * Observer-specific motion envelopes originate only from the trusted
 * Postgres RPC. No client may publish to a forge-observer channel.
 * Cosmetic motion never authorizes a token row, private artwork or fog cell.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const OBSERVER_PREVIEW_INTERVAL_MS=115;
export const OBSERVER_PREVIEW_EXPIRE_MS=1350;
export const observerMotionTopic=(mapId,userId)=>
 'forge-observer:'+mapId+':'+userId;

export function nextMotionSequence(now,last=0){
 if(!Number.isSafeInteger(now)||now<=0)return null;
 const seq=Math.max(now*1000,last+1);
 return Number.isSafeInteger(seq)?seq:null;
}

export function validObserverMovementPacket(packet,mapId,viewerId){
 if(!packet||packet.mapId!==mapId||packet.actor===viewerId||
    !UUID.test(String(packet.id||''))||
    !UUID.test(String(packet.actor||''))||
    !['token','tool'].includes(packet.kind)||
    !['move','hide'].includes(packet.action)||
    !Number.isSafeInteger(packet.seq)||packet.seq<=0||
    packet.seq>9000000000000000)return false;
 if(packet.action==='hide')
  return packet.x===undefined&&packet.y===undefined;
 return Number.isSafeInteger(packet.x)&&Number.isSafeInteger(packet.y)&&
  packet.x>=0&&packet.y>=0&&packet.x<=10000&&packet.y<=10000;
}
/** Dedupe across out-of-order deliveries without trusting the packet actor
 * as a permission proof; sender verification occurs inside the SQL RPC.
 */
export function acceptObserverMovementPacket(packet,sequenceMap){
 const key=packet.kind+':'+packet.id;
 if((sequenceMap.get(key)||0)>=packet.seq)return false;
 sequenceMap.set(key,packet.seq);
 return true;
}
