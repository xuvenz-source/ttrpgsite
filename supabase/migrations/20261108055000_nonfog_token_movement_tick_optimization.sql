-- Stage-only migration: apply to the existing Supabase Free project after
-- explicit release approval. Pure x/y movement on fog-off maps does not
-- affect visibility. Fog-enabled movement and all access changes still tick.
begin;
create or replace function forge_visibility.tick_tokens()
returns trigger language plpgsql volatile security definer set search_path='' as $$
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
end $$;
commit;
