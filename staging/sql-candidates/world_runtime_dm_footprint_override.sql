-- STAGING CANDIDATE ONLY; explicit designer release approval required.
-- Scope: resizing is collision-checked for all users by the movement trigger,
-- and the DM can deliberately override wall collision for a token's footprint.
-- Depends on world_runtime_collision_and_group_move.sql.
begin;
create or replace function public.resize_map_token(
 p_token uuid,p_span_x numeric,p_span_y numeric,
 p_ignore_collision boolean default false
) returns public.map_tokens
language plpgsql volatile security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid(); row public.map_tokens%rowtype;
begin
 if actor is null then raise exception 'Sign in first';end if;
 select * into row from public.map_tokens t where t.id=p_token for update;
 if not found or not public.is_campaign_dm(row.campaign_id) or
  not public.can_view_campaign_map(row.campaign_id,row.map_id) then
  raise exception 'Only the map DM may resize that token';end if;
 if p_span_x is null or p_span_y is null or
  p_span_x<0.25 or p_span_y<0.25 or
  p_span_x>12 or p_span_y>12 then
   raise exception 'Token footprint out of range';end if;
 if p_ignore_collision then
  perform set_config('forge.collision_override','on',true);
 end if;
 update public.map_tokens t set span_x=p_span_x,span_y=p_span_y
 where t.id=p_token returning * into row;
 return row;
end $$;
revoke all on function public.resize_map_token(uuid,numeric,numeric,boolean)
 from public,anon;
grant execute on function public.resize_map_token(uuid,numeric,numeric,boolean)
 to authenticated;
commit;
