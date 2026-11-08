-- STAGING CANDIDATE ONLY. Apply only with the approved coordinated release.
-- Distinguish fog-on authorization revocations from harmless fog-off ticks.
-- Prevents nonfog tool movement from blanking the board while retaining
-- immediate fail-closed sight revocation when fog is enabled.
begin;
alter table public.map_visibility_ticks
 add column if not exists fog_enforced boolean not null default false;
update public.map_visibility_ticks ticks set fog_enforced=coalesce(
 (select r.fog_enforced from forge_visibility.map_rules r
  where r.map_id=ticks.map_id),false);

create or replace function forge_visibility.bump_tick(p_map uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
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
end $$;
revoke all on function forge_visibility.bump_tick(uuid)
 from public,anon,authenticated;
commit;
