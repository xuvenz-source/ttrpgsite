/**
 * Supabase realtime.send() injects an 'id' UUID into its broadcast payload.
 * Delivery metadata does NOT grant sight, movement, ownership or a cursor.
 * Callers must independently validate all other exact packet fields.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validWorldBroadcastId(value){
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&
  (!Object.hasOwn(value,'id')||
   typeof value.id==='string'&&UUID.test(value.id));
}
