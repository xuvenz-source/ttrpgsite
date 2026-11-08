-- STAGING ONLY. DO NOT APPLY UNTIL EXPLICIT DESIGNER RELEASE APPROVAL.
-- Phase 1 compatibility change for PR #52 server-owned per-viewer fog revision.
-- Requires applied migration 20261108091818 and existing server-authorized
-- get_authorized_map_light_masks(uuid). Do not replace the legacy RPC.
--
-- Approved release ordering: apply this ADDITIVE function first, verify grants,
-- then deploy the matching client using protocolVersion=2. Existing clients keep
-- calling the unchanged global-revision RPC.
create or replace function public.get_authorized_map_light_masks_v2(p_map uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $viewer_light_masks$
declare
 actor uuid := auth.uid();
 camp uuid;
 before_rev bigint;
 after_rev bigint;
 result jsonb;
begin
 if actor is null or p_map is null then
  raise exception 'Sign in and select a map first';
 end if;
 select m.campaign_id into camp
 from public.battle_maps m
 where m.id = p_map;
 if camp is null or not public.can_view_campaign_map(camp,p_map) then
  raise exception 'Map unavailable';
 end if;
 -- Never claim viewer protocol support without guaranteed revocation ticks.
 if not exists (
  select 1 from pg_catalog.pg_publication_tables
  where pubname='supabase_realtime'
   and schemaname='public' and tablename='map_viewer_visibility_ticks'
 ) then raise exception 'Viewer visibility publication unavailable'; end if;
 select coalesce(t.revision,0) into before_rev
 from public.map_viewer_visibility_ticks t
 where t.map_id=p_map and t.user_id=actor;
 before_rev := coalesce(before_rev,0);
 -- Existing RPC alone computes masked, wall-occluded, server-authorized light.
 result := public.get_authorized_map_light_masks(p_map);
 select coalesce(t.revision,0) into after_rev
 from public.map_viewer_visibility_ticks t
 where t.map_id=p_map and t.user_id=actor;
 after_rev := coalesce(after_rev,0);
 if before_rev is distinct from after_rev then
  raise exception 'Visibility changed while authorizing lighting';
 end if;
 if result is null or pg_catalog.jsonb_typeof(result)<>'object'
   or result->>'mapId' is distinct from p_map::text then
  raise exception 'Invalid authorized lighting frame';
 end if;
 return result || pg_catalog.jsonb_build_object(
  'protocolVersion',2,'revision',after_rev);
end $viewer_light_masks$;

revoke all on function public.get_authorized_map_light_masks_v2(uuid)
 from public,anon;
grant execute on function public.get_authorized_map_light_masks_v2(uuid)
 to authenticated;

-- Production validation once approved:
-- select p.proname, p.prosecdef,
-- has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
-- has_function_privilege('authenticated',p.oid,'EXECUTE') as member_execute
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.proname='get_authorized_map_light_masks_v2';
-- Expected: security_definer=true, anon_execute=false, member_execute=true.
