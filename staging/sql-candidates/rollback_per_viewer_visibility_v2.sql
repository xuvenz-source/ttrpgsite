-- STAGING ROLLBACK ONLY. Do not run independently of an authorized release.
-- IMPORTANT: deploy the legacy frontend/subscriptions FIRST; only then
-- remove the per-viewer table and RPC. This restores the exact deployed
-- global-tick implementation captured before staging v2, including its
-- deliberately conservative pure-movement behavior.
-- No campaign tokens, character sheets, maps or inventory data are removed.

CREATE OR REPLACE FUNCTION forge_visibility.bump_tick(p_map uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 insert into public.map_visibility_ticks(
  map_id,campaign_id,revision,updated_at,fog_enforced
 )
 select m.id,m.campaign_id,1,now(),coalesce(r.fog_enforced,false)
 from public.battle_maps m
 left join forge_visibility.map_rules r on r.map_id=m.id
 where m.id=p_map
 on conflict(map_id)do update set
  revision=public.map_visibility_ticks.revision+1,
  updated_at=now(),
  fog_enforced=excluded.fog_enforced;
end $function$


CREATE OR REPLACE FUNCTION forge_visibility.tick_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pure_movement boolean;
begin
 if tg_op='INSERT' then
  perform forge_visibility.bump_tick(new.map_id);
  return new;
 end if;
 if tg_op='DELETE' then
  perform forge_visibility.bump_tick(old.map_id);
  return old;
 end if;
 if old.x is distinct from new.x or old.y is distinct from new.y or
    old.map_id is distinct from new.map_id or
    old.visible is distinct from new.visible or
    old.span_x is distinct from new.span_x or old.span_y is distinct from new.span_y or
    old.owner_id is distinct from new.owner_id or
    old.npc_values is distinct from new.npc_values then
  pure_movement:=
   (old.x is distinct from new.x or old.y is distinct from new.y)
   and (to_jsonb(old)-'x'-'y'-'updated_at')=
       (to_jsonb(new)-'x'-'y'-'updated_at');
  if not pure_movement or exists(
   select 1 from forge_visibility.map_rules r
   where r.map_id=new.map_id and r.fog_enforced=true
  ) then
   perform forge_visibility.bump_tick(new.map_id);
  end if;
  if old.map_id is distinct from new.map_id then
   perform forge_visibility.bump_tick(old.map_id);
  end if;
 end if;
 return new;
end $function$


drop function if exists public.get_authorized_map_fog_v2(uuid);
drop function if exists forge_visibility.viewers_affected_by_token_move(
 public.map_tokens,public.map_tokens);
drop function if exists forge_visibility.bump_tick_scoped(uuid,uuid[]);
drop function if exists forge_visibility.bump_viewer_ticks(uuid,uuid[]);
do $publication$
begin
 if exists(select 1 from pg_publication_tables where
  pubname='supabase_realtime' and schemaname='public' and
  tablename='map_viewer_visibility_ticks') then
  alter publication supabase_realtime
   drop table public.map_viewer_visibility_ticks;
 end if;
end $publication$;
drop table if exists public.map_viewer_visibility_ticks;
