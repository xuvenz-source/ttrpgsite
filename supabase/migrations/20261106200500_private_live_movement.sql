-- Staged only: authorized low-latency token previews use private per-map
-- Supabase Realtime Broadcast channels (forge-map:<map UUID>).
-- Postgres map_tokens remains authoritative for persisted movement.
-- This never grants access to another player's private map.
create policy "forge map previews receive"
on realtime.messages for select to authenticated
using (
 extension='broadcast'
 and case
  when (select realtime.topic()) ~ '^forge-map:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then exists (
   select 1 from public.battle_maps m
   where m.id=split_part((select realtime.topic()),':',2)::uuid
    and public.can_view_campaign_map(m.campaign_id,m.id)
  )
  else false end
);
create policy "forge map previews send"
on realtime.messages for insert to authenticated
with check (
 extension='broadcast'
 and case
  when (select realtime.topic()) ~ '^forge-map:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then exists (
   select 1 from public.battle_maps m
   where m.id=split_part((select realtime.topic()),':',2)::uuid
    and public.can_view_campaign_map(m.campaign_id,m.id)
  )
  else false end
);
