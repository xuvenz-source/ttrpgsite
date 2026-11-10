-- B07 NONAPPLIED SQL CANDIDATE. Staged under supabase/candidates ONLY.
-- Must NEVER be applied to production or automatically discovered as a migration.
-- Uses the unchanged, server-filtered V2 observer_path_status function;
-- all database/object authorization is inherited from the existing V2 RPC.
-- B08 must integrate final flush on successful commit and safe cancellation.
-- This candidate intentionally does not replace the public Commit RPC.
--
-- Realtime Free supports 100 messages/sec including delivered receiver
-- messages. 20 private publishes/sec is a conservative *movement-only*
-- global budget, NOT a hard cap on billed messages (multiple tabs and other
-- Realtime products also consume quota). Every recipient remains private.

CREATE TABLE forge_world_v2.observer_pending_b07(
 session_id uuid NOT NULL REFERENCES forge_world_v2.motion_sessions(id)
  ON DELETE CASCADE,
 viewer_id uuid NOT NULL,
 map_id uuid NOT NULL,campaign_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 environment_revision bigint NOT NULL,
 permission_generation bigint NOT NULL,
 pending jsonb NOT NULL DEFAULT '[]'::jsonb,
 last_sent_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(session_id,viewer_id),
 CHECK(jsonb_typeof(pending)='array'),
 CHECK(jsonb_array_length(pending)<=48)
);
ALTER TABLE forge_world_v2.observer_pending_b07 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.observer_pending_b07
 FROM PUBLIC,anon,authenticated;

CREATE TABLE forge_world_v2.observer_budget_b07(
 id smallint PRIMARY KEY CHECK(id=1),
 window_started timestamptz NOT NULL,
 emitted integer NOT NULL CHECK(emitted BETWEEN 0 AND 30)
);
ALTER TABLE forge_world_v2.observer_budget_b07 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.observer_budget_b07
 FROM PUBLIC,anon,authenticated;
INSERT INTO forge_world_v2.observer_budget_b07(id,window_started,emitted)
 VALUES(1,'epoch'::timestamptz,0);

-- Use exact existing V2 motion wire grammar, not a newly invented packet.
-- Reject input even when supplied by an internal actor-owned routine.
CREATE OR REPLACE FUNCTION forge_world_v2.valid_observer_items_b07(
 p_items jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE item jsonb;cell jsonb;previous jsonb;cnt integer;ids text[]:=ARRAY[]::text[];
 key text;uuid_text text;
BEGIN
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 48
 THEN RETURN false;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR
   item->>'kind' NOT IN ('token','tool') OR
   item->>'action' NOT IN ('path','hide') OR
   (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RETURN false;END IF;
  key:=item->>'kind'||':'||(item->>'id')::uuid::text;
  IF key=ANY(ids) THEN RETURN false;END IF;
  ids:=array_append(ids,key);
  SELECT count(*) INTO cnt FROM jsonb_object_keys(item);
  IF item->>'action'='hide' THEN
   IF cnt<>3 OR item ? 'path' THEN RETURN false;END IF;
  ELSE
   IF cnt<>4 OR jsonb_typeof(item->'path') IS DISTINCT FROM 'array' OR
    jsonb_array_length(item->'path') NOT BETWEEN 2 AND 25
   THEN RETURN false;END IF;
   previous:=NULL;
   FOR cell IN SELECT value FROM jsonb_array_elements(item->'path') LOOP
    IF forge_world_v2.valid_point(cell) IS DISTINCT FROM true OR
     (SELECT count(*) FROM jsonb_object_keys(cell))<>2
    THEN RETURN false;END IF;
    IF previous IS NOT NULL AND
     greatest(abs((cell->>'x')::integer-(previous->>'x')::integer),
              abs((cell->>'y')::integer-(previous->>'y')::integer))<>1
    THEN RETURN false;END IF;
    previous:=cell;
   END LOOP;
  END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $b07$;

-- Merge only exact contiguous, already-authorized paths. An unseen actor
-- cannot become visible again through an old buffered hide; require a new
-- independently authorized sight/roster instead.
CREATE OR REPLACE FUNCTION forge_world_v2.merge_observer_items_b07(
 p_pending jsonb,p_next jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE old jsonb;incoming jsonb;result jsonb:='[]'::jsonb;
 merged jsonb;path jsonb;found boolean;idx integer;
BEGIN
 IF NOT forge_world_v2.valid_observer_items_b07(p_next) OR
  (p_pending<>'[]'::jsonb AND
   NOT forge_world_v2.valid_observer_items_b07(p_pending))
 THEN RETURN NULL;END IF;
 IF p_pending='[]'::jsonb THEN RETURN p_next;END IF;
 FOR old IN SELECT value FROM jsonb_array_elements(p_pending) LOOP
  merged:=old;found:=false;
  FOR incoming IN SELECT value FROM jsonb_array_elements(p_next) LOOP
   IF incoming->>'kind'=old->>'kind' AND
      incoming->>'id'=old->>'id' THEN
    found:=true;
    IF incoming->>'action'='hide' THEN
     merged:=incoming;
    ELSIF old->>'action'='hide' THEN
     merged:=old;
    ELSE
     path:=old->'path';
     IF path->(jsonb_array_length(path)-1)<>incoming->'path'->0 OR
      jsonb_array_length(path)+jsonb_array_length(incoming->'path')-1>25
     THEN RETURN NULL;END IF;
     FOR idx IN 1..jsonb_array_length(incoming->'path')-1 LOOP
      path:=path||jsonb_build_array(incoming->'path'->idx);
     END LOOP;
     merged:=jsonb_set(old,'{path}',path);
    END IF;
    EXIT;
   END IF;
  END LOOP;
  result:=result||jsonb_build_array(merged);
 END LOOP;
 FOR incoming IN SELECT value FROM jsonb_array_elements(p_next) LOOP
  found:=false;
  FOR old IN SELECT value FROM jsonb_array_elements(p_pending) LOOP
   IF incoming->>'kind'=old->>'kind' AND
      incoming->>'id'=old->>'id' THEN found:=true;EXIT;END IF;
  END LOOP;
  IF NOT found THEN result:=result||jsonb_build_array(incoming);END IF;
 END LOOP;
 IF jsonb_array_length(result)>48 OR
  NOT forge_world_v2.valid_observer_items_b07(result)
 THEN RETURN NULL;END IF;
 RETURN result;
END $b07$;

-- Re-evaluate every buffered segment under the CURRENT viewer membership
-- and CURRENT server-side fog/LOS before any Realtime publication.
-- Returning status 0 silently discards an item; status 2 sends only hide.
CREATE OR REPLACE FUNCTION forge_world_v2.filter_pending_observer_b07(
 p_session forge_world_v2.motion_sessions,p_viewer uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE item jsonb;approved jsonb:='[]'::jsonb;scene jsonb;grid record;
 status integer;exists_selected boolean;piece_id uuid;
BEGIN
 IF p_session.actor_id IS DISTINCT FROM auth.uid() OR
  forge_world_v2.viewer_on_map(p_session.campaign_id,
   p_session.map_id,p_viewer) IS NULL OR
  NOT forge_world_v2.valid_observer_items_b07(p_items)
 THEN RETURN '[]'::jsonb;END IF;
 SELECT e.live INTO scene FROM public.map_environments e
 WHERE e.map_id=p_session.map_id AND e.campaign_id=p_session.campaign_id
  AND e.revision=p_session.environment_revision;
 IF NOT FOUND THEN RETURN '[]'::jsonb;END IF;
 SELECT m.grid_size,
  floor(m.width/m.grid_size)::integer AS width_cells,
  floor(m.height/m.grid_size)::integer AS height_cells
 INTO grid FROM public.battle_maps m
 WHERE m.id=p_session.map_id AND m.campaign_id=p_session.campaign_id
  AND m.grid_size>0;
 IF NOT FOUND THEN RETURN '[]'::jsonb;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  piece_id:=(item->>'id')::uuid;
  SELECT EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_session.selection) sel
   WHERE sel->>'kind'=item->>'kind' AND
    (sel->>'id')::uuid=piece_id) INTO exists_selected;
  IF NOT exists_selected THEN CONTINUE;END IF;
  IF item->>'action'='hide' THEN
   -- A hide ID must have first been certified by the trusted publisher.
   -- No path or destination is exposed.
   approved:=approved||jsonb_build_array(item);
  ELSE
   status:=forge_world_v2.observer_path_status(
    p_session,p_viewer,item->>'kind',piece_id,item->'path',
    scene,grid.grid_size,grid.width_cells,grid.height_cells);
   IF status=1 THEN
    approved:=approved||jsonb_build_array(item);
   ELSIF status=2 THEN
    approved:=approved||jsonb_build_array(jsonb_build_object(
     'kind',item->>'kind','id',piece_id,'action','hide'));
   END IF;
  END IF;
 END LOOP;
 RETURN approved;
EXCEPTION WHEN others THEN RETURN '[]'::jsonb;
END $b07$;

-- Internal only. Mutable cursor and global free-tier budget are acquired
-- under a single database transaction/row lock before realtime.send.
-- If the publisher raises, the exception subtransaction rolls back cursor
-- and budget and the caller retains the queued progress for a later retry.
CREATE OR REPLACE FUNCTION forge_world_v2.flush_recipient_observer_b07(
 p_session forge_world_v2.motion_sessions,p_viewer uuid,
 p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE q forge_world_v2.observer_pending_b07%ROWTYPE;
 filtered jsonb;budget forge_world_v2.observer_budget_b07%ROWTYPE;
 cursor bigint;outcome integer:=0;current_status text;
 max_sent integer:=20;
 current_permission bigint;current_revision bigint;
BEGIN
 IF auth.uid() IS NULL OR p_session.actor_id IS DISTINCT FROM auth.uid() OR
  p_viewer IS NULL OR p_now IS NULL THEN RETURN 0;END IF;
 SELECT * INTO q FROM forge_world_v2.observer_pending_b07
 WHERE session_id=p_session.id AND viewer_id=p_viewer FOR UPDATE;
 IF NOT FOUND OR q.pending='[]'::jsonb OR
  q.map_id IS DISTINCT FROM p_session.map_id OR
  q.campaign_id IS DISTINCT FROM p_session.campaign_id OR
  q.actor_id IS DISTINCT FROM p_session.actor_id OR
  q.environment_revision IS DISTINCT FROM p_session.environment_revision OR
  q.permission_generation IS DISTINCT FROM p_session.permission_generation OR
  p_now>q.expires_at
 THEN RETURN 0;END IF;
 SELECT ms.status INTO current_status
 FROM forge_world_v2.motion_sessions ms
 WHERE ms.id=p_session.id AND ms.actor_id=auth.uid();
 IF current_status NOT IN ('active','committed') THEN RETURN 0;END IF;
 SELECT e.revision INTO current_revision FROM public.map_environments e
 WHERE e.map_id=p_session.map_id AND e.campaign_id=p_session.campaign_id;
 SELECT g.generation INTO current_permission
 FROM forge_visibility.navigation_permission_generations g
 WHERE g.map_id=p_session.map_id;
 IF current_revision IS DISTINCT FROM p_session.environment_revision OR
  coalesce(current_permission,0) IS DISTINCT FROM p_session.permission_generation
  OR forge_world_v2.viewer_on_map(p_session.campaign_id,p_session.map_id,p_viewer) IS NULL
 THEN
  -- Revoked/invalid session: discard cached data; never replay it later.
  DELETE FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session.id AND viewer_id=p_viewer;
  RETURN 0;
 END IF;
 filtered:=forge_world_v2.filter_pending_observer_b07(
  p_session,p_viewer,q.pending);
 IF jsonb_array_length(filtered)=0 THEN
  UPDATE forge_world_v2.observer_pending_b07
   SET pending='[]'::jsonb,updated_at=p_now
   WHERE session_id=p_session.id AND viewer_id=p_viewer;
  RETURN 0;
 END IF;
 BEGIN
  SELECT * INTO budget FROM forge_world_v2.observer_budget_b07
  WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN RETURN 0;END IF;
  IF p_now-budget.window_started>=interval '1 second' THEN
   UPDATE forge_world_v2.observer_budget_b07
    SET window_started=p_now,emitted=0 WHERE id=1;
   budget.emitted:=0;
  END IF;
  -- Reserve 20 movement broadcasts/sec, plus 10 priority hides/sec.
  -- This is NOT a full per-account Realtime billing quota guarantee.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(filtered) e
    WHERE e->>'action'='hide') THEN max_sent:=30;END IF;
  IF budget.emitted>=max_sent THEN RETURN 0;END IF;
  INSERT INTO forge_world_v2.viewer_streams(
   map_id,viewer_id,campaign_id,seq,updated_at)
  VALUES(p_session.map_id,p_viewer,p_session.campaign_id,1,p_now)
  ON CONFLICT(map_id,viewer_id) DO UPDATE
   SET seq=forge_world_v2.viewer_streams.seq+1,
    campaign_id=excluded.campaign_id,updated_at=p_now
  RETURNING seq INTO cursor;
  PERFORM realtime.send(jsonb_build_object(
   'version',2,'mapId',p_session.map_id,'viewerId',p_viewer,
   'seq',cursor,'environmentRevision',p_session.environment_revision,
   'permissionGeneration',p_session.permission_generation,
   'items',filtered),'world-motion-v2',
   'forge-world-v2:'||p_session.map_id::text||':'||p_viewer::text,true);
  UPDATE forge_world_v2.observer_budget_b07
  SET emitted=emitted+1 WHERE id=1;
  UPDATE forge_world_v2.observer_pending_b07
  SET pending='[]'::jsonb,last_sent_at=p_now,updated_at=p_now
  WHERE session_id=p_session.id AND viewer_id=p_viewer;
  outcome:=1;
 EXCEPTION WHEN others THEN
  -- A failed/missing realtime partition cannot consume a stream cursor,
  -- lose pending authorized progress or fail canonical validation.
  RAISE WARNING 'B07 private observer dispatch deferred';
  outcome:=0;
 END;
 RETURN outcome;
END $b07$;

-- Called ONLY after the old observer publisher has built each per-viewer
-- ACL/LOS-filtered item. This helper cannot be a browser-authorized RPC.
CREATE OR REPLACE FUNCTION forge_world_v2.queue_recipient_observer_b07(
 p_session forge_world_v2.motion_sessions,p_viewer uuid,p_items jsonb,
 p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE q forge_world_v2.observer_pending_b07%ROWTYPE;
 merged jsonb;count_sent integer:=0;has_hide boolean;
BEGIN
 IF auth.uid() IS NULL OR p_session.actor_id IS DISTINCT FROM auth.uid() OR
  p_session.status<>'active' OR
  forge_world_v2.session_valid(p_session) IS DISTINCT FROM true OR
  p_viewer=p_session.actor_id OR
  forge_world_v2.viewer_on_map(p_session.campaign_id,p_session.map_id,p_viewer) IS NULL OR
  NOT forge_world_v2.valid_observer_items_b07(p_items)
 THEN RETURN 0;END IF;
 INSERT INTO forge_world_v2.observer_pending_b07(
  session_id,viewer_id,map_id,campaign_id,actor_id,
  environment_revision,permission_generation,pending,
  updated_at,expires_at)
 VALUES(p_session.id,p_viewer,p_session.map_id,p_session.campaign_id,
  p_session.actor_id,p_session.environment_revision,
  p_session.permission_generation,'[]'::jsonb,p_now,
  p_session.created_at+interval '60 seconds')
 ON CONFLICT(session_id,viewer_id) DO NOTHING;
 SELECT * INTO q FROM forge_world_v2.observer_pending_b07
 WHERE session_id=p_session.id AND viewer_id=p_viewer FOR UPDATE;
 IF NOT FOUND OR q.actor_id<>p_session.actor_id OR
  q.map_id<>p_session.map_id OR
  q.campaign_id<>p_session.campaign_id OR
  q.environment_revision<>p_session.environment_revision OR
  q.permission_generation<>p_session.permission_generation
 THEN RETURN 0;END IF;
 merged:=forge_world_v2.merge_observer_items_b07(q.pending,p_items);
 IF merged IS NULL THEN
  -- The receiver supports max 25 points per piece; never truncate or
  -- replace a turn with an endpoint. Flush old safe prefix first.
  IF q.pending<>'[]'::jsonb THEN
   count_sent:=forge_world_v2.flush_recipient_observer_b07(
    p_session,p_viewer,p_now);
   IF count_sent<>1 THEN RETURN 0;END IF;
  END IF;
  merged:=forge_world_v2.merge_observer_items_b07('[]'::jsonb,p_items);
  IF merged IS NULL THEN RETURN count_sent;END IF;
 END IF;
 UPDATE forge_world_v2.observer_pending_b07
 SET pending=merged,updated_at=p_now
 WHERE session_id=p_session.id AND viewer_id=p_viewer;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(merged) i
  WHERE i->>'action'='hide') INTO has_hide;
 -- First accepted motion goes out promptly. Subsequent progress accumulates
 -- at most 200ms; hide never waits for the normal cosmetic cadence.
 IF q.last_sent_at IS NULL OR
    p_now-q.last_sent_at>=interval '200 milliseconds' OR has_hide
 THEN
  count_sent:=count_sent+
   forge_world_v2.flush_recipient_observer_b07(p_session,p_viewer,p_now);
 END IF;
 RETURN count_sent;
END $b07$;

-- B08 integration prerequisite: after a VERIFIED successful final commit,
-- call flush_recipient_observer_b07 for each queued session viewer, then
-- delete session queue rows. On cancel/expiry/revocation, delete without
-- publishing stale uncommitted movement. This helper is not yet wired into
-- public.commit_world_motion_v2 and must not be treated as a release-ready
-- standalone migration.
CREATE OR REPLACE FUNCTION forge_world_v2.flush_session_observers_b07(
 p_session uuid,p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE s forge_world_v2.motion_sessions%ROWTYPE;
 recipient record;sent integer:=0;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL THEN RETURN 0;END IF;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
 WHERE id=p_session AND actor_id=auth.uid();
 IF NOT FOUND OR s.status<>'committed' THEN RETURN 0;END IF;
 FOR recipient IN
  SELECT q.viewer_id FROM forge_world_v2.observer_pending_b07 q
  WHERE q.session_id=p_session ORDER BY q.viewer_id
 LOOP
  sent:=sent+forge_world_v2.flush_recipient_observer_b07(
   s,recipient.viewer_id,p_now);
 END LOOP;
 RETURN sent;
END $b07$;

-- Replacement of the existing private server-side recipient-LOS publisher.
-- Exact source-derived V2 selection, visibility, membership and fog checks
-- retained; ONLY the final realtime.send is replaced by bounded queueing.
CREATE OR REPLACE FUNCTION forge_world_v2.publish_approved_observers(
 p_session forge_world_v2.motion_sessions,p_from jsonb,p_accepted jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $
DECLARE audience record;part jsonb;waypoint jsonb;
 viewer_role text;scene jsonb;grid record;
 path jsonb;items jsonb;world_x integer;world_y integer;
 start_x integer;start_y integer;status integer;
 piece_kind text;piece_id uuid;cursor bigint;sent integer:=0;
BEGIN
 IF p_session.actor_id<>auth.uid() OR p_session.status<>'active' OR
  p_session.mode='preview' OR NOT forge_world_v2.session_valid(p_session) OR
  jsonb_typeof(p_accepted)<>'array' OR
  jsonb_array_length(p_accepted) NOT BETWEEN 1 AND 24 OR
  NOT forge_world_v2.valid_point(p_from)
 THEN RETURN 0;END IF;
 SELECT env.live INTO scene FROM public.map_environments env
 WHERE env.map_id=p_session.map_id AND
  env.campaign_id=p_session.campaign_id;
 SELECT m.grid_size,
  floor(m.width/m.grid_size)::integer AS width_cells,
  floor(m.height/m.grid_size)::integer AS height_cells
 INTO grid FROM public.battle_maps m
 WHERE m.id=p_session.map_id AND m.campaign_id=p_session.campaign_id
  AND m.grid_size>0;
 IF NOT FOUND THEN RETURN 0;END IF;
 FOR audience IN
  SELECT m.user_id FROM public.campaign_members m
  WHERE m.campaign_id=p_session.campaign_id
   AND m.user_id<>p_session.actor_id AND m.role IN ('player','dm')
  ORDER BY CASE WHEN m.role='dm' THEN 0 ELSE 1 END,
   m.user_id LIMIT 32
 LOOP
  viewer_role:=forge_world_v2.viewer_on_map(
   p_session.campaign_id,p_session.map_id,audience.user_id);
  IF viewer_role IS NULL THEN CONTINUE;END IF;
  items:='[]'::jsonb;
  FOR part IN SELECT value FROM jsonb_array_elements(p_session.selection) LOOP
   piece_kind:=part->>'kind';piece_id:=(part->>'id')::uuid;
   start_x:=(part->>'x')::integer+(p_from->>'x')::integer-
    p_session.origin_x;
   start_y:=(part->>'y')::integer+(p_from->>'y')::integer-
    p_session.origin_y;
   path:=jsonb_build_array(jsonb_build_object('x',start_x,'y',start_y));
   FOR waypoint IN SELECT value FROM jsonb_array_elements(p_accepted) LOOP
    world_x:=(part->>'x')::integer+(waypoint->>'x')::integer-
      p_session.origin_x;
    world_y:=(part->>'y')::integer+(waypoint->>'y')::integer-
      p_session.origin_y;
    path:=path||jsonb_build_array(
     jsonb_build_object('x',world_x,'y',world_y));
   END LOOP;
   status:=forge_world_v2.observer_path_status(
    p_session,audience.user_id,piece_kind,piece_id,path,scene,
    grid.grid_size,grid.width_cells,grid.height_cells);
   IF status=1 THEN
    items:=items||jsonb_build_array(jsonb_build_object(
     'kind',piece_kind,'id',piece_id,'action','path','path',path));
   ELSIF status=2 THEN
    items:=items||jsonb_build_array(jsonb_build_object(
     'kind',piece_kind,'id',piece_id,'action','hide'));
   END IF;
  END LOOP;
  IF jsonb_array_length(items)=0 THEN CONTINUE;END IF;
  sent:=sent+forge_world_v2.queue_recipient_observer_b07(
   p_session,audience.user_id,items);
 END LOOP;
 RETURN sent;
END $;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2
 FROM PUBLIC,anon,authenticated;
