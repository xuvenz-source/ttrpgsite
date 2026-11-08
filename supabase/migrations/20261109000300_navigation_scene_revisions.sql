-- Staging only. No production database writes until designer approval.
-- Keep the authenticated fog RPC and private viewer tick protocol in sync:
-- scene revisions invalidate collision grants only when map geometry changes,
-- rather than after EVERY unrelated token movement/visibility revision.
CREATE OR REPLACE FUNCTION public.get_authorized_map_fog_v2(p_map uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor uuid:=auth.uid();before_rev bigint;after_rev bigint;
 result jsonb;
begin
 if actor is null then raise exception 'Sign in first';end if;
 -- A missing publication would silently strand v2 watchers. Never advertise
 -- a protocol that cannot deliver server-owned revocation notifications.
 if not exists(select 1 from pg_publication_tables where
  pubname='supabase_realtime' and schemaname='public' and
  tablename='map_viewer_visibility_ticks') then
  raise exception 'Viewer visibility publication unavailable';
 end if;
 select coalesce(revision,0) into before_rev
 from public.map_viewer_visibility_ticks
 where map_id=p_map and user_id=actor;
 before_rev:=coalesce(before_rev,0);
 result:=public.get_authorized_map_fog(p_map);
 select coalesce(revision,0) into after_rev
 from public.map_viewer_visibility_ticks
 where map_id=p_map and user_id=actor;
 after_rev:=coalesce(after_rev,0);
 if before_rev is distinct from after_rev then
  raise exception 'Visibility changed while authorizing frame';
 end if;
 return result || jsonb_build_object(
  'protocolVersion',2,'revision',after_rev,
  'navigationEnvironmentRevision',
   coalesce((select e.revision from public.map_environments e
    where e.map_id=p_map),0),
  'permissionGeneration',coalesce((select g.generation
    from forge_visibility.navigation_permission_generations g
    where g.map_id=p_map),0));
end $function$;

CREATE OR REPLACE FUNCTION public.get_authorized_map_fog_delta(p_map uuid, p_base_epoch uuid DEFAULT NULL::uuid, p_base_revision bigint DEFAULT NULL::bigint, p_base_sequence bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();current_frame jsonb;old forge_visibility.viewer_fog_snapshots%rowtype;
 now_rev bigint;next_seq bigint;v jsonb;e jsonb;can_delta boolean;
begin
 if actor is null or p_map is null then raise exception 'Map unavailable';end if;
 current_frame:=public.get_authorized_map_fog_v2(p_map);
 if current_frame->>'protocolVersion'<>'2' or current_frame->>'mapId'<>p_map::text
 then raise exception 'Invalid current authorized visibility';end if;
 now_rev:=(current_frame->>'revision')::bigint;
 insert into forge_visibility.viewer_fog_snapshots(map_id,user_id)
 values(p_map,actor) on conflict(map_id,user_id) do nothing;
 select * into old from forge_visibility.viewer_fog_snapshots
 where map_id=p_map and user_id=actor for update;
 can_delta:=p_base_epoch is not null and p_base_epoch=old.epoch and
  p_base_revision=old.revision and p_base_sequence=old.sequence and
  old.frame ? 'visible' and old.frame ? 'explored' and
  old.frame->>'width'=current_frame->>'width' and
  old.frame->>'height'=current_frame->>'height' and
  old.frame->>'enabled'=current_frame->>'enabled' and
  old.frame->>'partyShared'=current_frame->>'partyShared';
 -- The server returns NOOP only for a client which already holds this very
 -- snapshot/epoch/sequence. Other clients get a complete authorized frame.
 if current_frame=old.frame and can_delta then
  return pg_catalog.jsonb_build_object('mode','noop','deltaProtocolVersion',1,
    'mapId',p_map,'protocolVersion',2,'revision',now_rev,
    'epoch',old.epoch,'sequence',old.sequence);
 end if;
 if current_frame=old.frame then
  return current_frame||pg_catalog.jsonb_build_object(
   'mode','snapshot','deltaProtocolVersion',1,
   'epoch',old.epoch,'sequence',old.sequence,'entitiesChanged',false);
 end if;
 next_seq:=old.sequence+1;
 if can_delta then
  v:=forge_visibility.fog_cells_diff(old.frame->'visible',current_frame->'visible');
  e:=forge_visibility.fog_cells_diff(old.frame->'explored',current_frame->'explored');
 end if;
 update forge_visibility.viewer_fog_snapshots set
 frame=current_frame,revision=now_rev,sequence=next_seq,updated_at=now()
 where map_id=p_map and user_id=actor;
 if can_delta then
  return pg_catalog.jsonb_build_object(
   'mode','delta','deltaProtocolVersion',1,'protocolVersion',2,'mapId',p_map,
   'width',current_frame->'width','height',current_frame->'height',
   'enabled',current_frame->'enabled','partyShared',current_frame->'partyShared',
   'collisionEnabled',current_frame->'collisionEnabled',
   'navigationEnvironmentRevision',current_frame->'navigationEnvironmentRevision',
   'permissionGeneration',current_frame->'permissionGeneration',
   'epoch',old.epoch,'revision',now_rev,'sequence',next_seq,
   'baseRevision',old.revision,'baseSequence',old.sequence,
   'visibleAdd',v->'add','visibleRemove',v->'remove',
   'exploredAdd',e->'add','exploredRemove',e->'remove',
   'entitiesChanged',true);
 end if;
 return current_frame||pg_catalog.jsonb_build_object(
  'mode','snapshot','deltaProtocolVersion',1,
  'epoch',old.epoch,'sequence',next_seq,'entitiesChanged',true);
end $function$;

REVOKE ALL ON FUNCTION public.get_authorized_map_fog_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_authorized_map_fog_v2(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_authorized_map_fog_delta(uuid,uuid,bigint,bigint)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_authorized_map_fog_delta(uuid,uuid,bigint,bigint)
 TO authenticated,service_role;
