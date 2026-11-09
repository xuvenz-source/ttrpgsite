-- World Engine V2 Phase 6: synthetic publication and privacy contract.
-- Runs only in PostgreSQL 17 CI; never on the real Supabase database.
DO $$
BEGIN
 IF has_function_privilege('anon','public.get_world_scene_v2(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
 'public.get_world_scene_v2(uuid)','EXECUTE')
 OR has_table_privilege('authenticated',
 'forge_world_v2.scene_publications','SELECT')
 OR has_function_privilege('authenticated',
 'forge_world_v2.bump_scene_publication_v2(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'V2 scene privacy grants incorrect';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime'
 AND tablename='messages' AND cmd='SELECT'
 AND policyname='World V2 scene publication receive')
 THEN RAISE EXCEPTION 'Scene channel authorization policy missing';END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime'
 AND tablename='messages' AND cmd='INSERT'
 AND coalesce(with_check,'') LIKE '%forge-world-scene-v2%')
 THEN RAISE EXCEPTION 'Browser can forge V2 scene notices';END IF;
END $$;

-- Baseline map1 has a published solid wall, no Phase 6 generation row yet.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.get_world_scene_v2(
 '10000000-0000-4000-8000-000000000001');
 IF r->>'scope'<>'viewer' OR r->>'published'<>'true'
 OR r->>'sceneGeneration'<>'0' OR r->>'revision'<>'7'
 OR r->>'collisionEnabled'<>'true'
 OR r->'environment' IS DISTINCT FROM 'null'::jsonb
 OR r::text LIKE '%hidden-internal-id%' OR r::text LIKE '%points%'
 THEN RAISE EXCEPTION 'Hidden geometry leaked to player: %',r;END IF;
END $$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.get_world_scene_v2(
 '10000000-0000-4000-8000-000000000001');
 IF r->>'scope'<>'dm'
 OR r->'environment'->'objects'->0->>'id'<>'hidden-internal-id'
 THEN RAISE EXCEPTION 'DM full LIVE publication unavailable: %',r;END IF;
END $$;
RESET ROLE;

-- An ordinary DM PREPARED draft is saved to the map, but MUST NOT change
-- the published scene, collision cache, notification topic or generation.
UPDATE public.map_environments SET prepared=
 '{"version":1,"ambient":35,
 "effects":{"weather":"snow","intensity":40},
 "objects":[
 {"id":"wall-publication-1","type":"wall",
  "points":[{"x":4,"y":0},{"x":4,"y":10}],
  "blocksMovement":true,"blocksLight":true,"vision":"block","oneWay":"a-to-b"},
 {"id":"light-secret","type":"light","x":8,"y":6,
  "bright":3,"dim":4,"intensity":80,"color":"#ffce7a",
  "enabled":true}
 ]}'::jsonb
WHERE map_id='10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM forge_world_v2.scene_publications)
 OR EXISTS(SELECT 1 FROM realtime.messages
  WHERE event='scene-revision-v2')
 THEN RAISE EXCEPTION 'Unpublished DM edit invalidated static scene';END IF;
END $$;

-- The DM's actual PUBLISH updates the existing live environment and revision,
-- then map_rules. New V2 generation signals fire only on these live changes.
UPDATE public.map_environments SET live=prepared,
 revision=revision+1 WHERE
 map_id='10000000-0000-4000-8000-000000000001';
UPDATE forge_visibility.map_rules SET
 fog_enforced=true,collision_enforced=false,
 published_revision=published_revision+1,updated_at=now()
 WHERE map_id='10000000-0000-4000-8000-000000000001';
DO $$
DECLARE count_events integer; max_gen bigint;
BEGIN
 SELECT count(*),max((payload->>'sceneGeneration')::bigint)
 INTO count_events,max_gen FROM realtime.messages
 WHERE event='scene-revision-v2';
 IF count_events<>2 OR max_gen<>2 THEN
  RAISE EXCEPTION 'Published map/rules did not notify precisely: %, %',
  count_events,max_gen;END IF;
 IF (SELECT generation FROM forge_world_v2.scene_publications WHERE
  map_id='10000000-0000-4000-8000-000000000001')<>2
 THEN RAISE EXCEPTION 'Persisted scene generation missing';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages WHERE event='scene-revision-v2'
 AND (private IS DISTINCT FROM true OR
  topic<>'forge-world-scene-v2:10000000-0000-4000-8000-000000000001'
  OR payload ? 'environment' OR payload ? 'objects' OR payload ? 'prepared'
  OR payload ? 'light-secret'))
 THEN RAISE EXCEPTION 'Scene notice exposes private map information';END IF;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.get_world_scene_v2(
 '10000000-0000-4000-8000-000000000001');
 IF r->>'scope'<>'viewer' OR r->>'sceneGeneration'<>'2'
 OR r->>'revision'<>'8' OR r->>'fogEnabled'<>'true'
 OR r->>'collisionEnabled'<>'false'
 OR (r->>'ambient')::numeric<>35
 OR r->'effects'->>'weather'<>'snow'
 OR (r->'effects'->>'intensity')::numeric<>40
 OR r->'environment'<>'null'::jsonb
 OR r::text LIKE '%light-secret%' OR r::text LIKE '%wall-publication-1%'
 THEN RAISE EXCEPTION 'Player got geometry or incorrect display settings: %',r;
 END IF;
END $$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.get_world_scene_v2(
 '10000000-0000-4000-8000-000000000001');
 IF r->>'scope'<>'dm'
 OR r->'environment'->'objects'->0->>'id'<>'wall-publication-1'
 OR r->'environment'->'objects'->1->>'id'<>'light-secret'
 THEN RAISE EXCEPTION 'DM published lights/walls not persisted: %',r;
 END IF;
END $$;
RESET ROLE;

-- Tokens, tools, edits to prepared and unrelated map refreshes do NOT alter
-- the published generation or emit static-scene notifications.
UPDATE public.map_tokens SET updated_at=updated_at
 WHERE id='40000000-0000-4000-8000-000000000001';
UPDATE public.campaign_tool_issues SET revision=revision+1
 WHERE id='50000000-0000-4000-8000-000000000001';
UPDATE public.map_environments SET prepared=jsonb_set(
 prepared,'{ambient}','60'::jsonb)
 WHERE map_id='10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages
  WHERE event='scene-revision-v2')<>2
 OR (SELECT generation FROM forge_world_v2.scene_publications WHERE
 map_id='10000000-0000-4000-8000-000000000001')<>2
 THEN RAISE EXCEPTION 'Token movement or DM draft caused scene reload';END IF;
END $$;

-- Disabling fog without changing live environment revision MUST invalidate
-- V2 scene rules. It does not delete the saved wall/light composition.
UPDATE forge_visibility.map_rules SET fog_enforced=false,
 updated_at=now() WHERE map_id='10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 IF (SELECT generation FROM forge_world_v2.scene_publications WHERE
 map_id='10000000-0000-4000-8000-000000000001')<>3
 OR (SELECT revision FROM public.map_environments WHERE
 map_id='10000000-0000-4000-8000-000000000001')<>8
 OR (SELECT count(*) FROM realtime.messages
 WHERE event='scene-revision-v2')<>3
 THEN RAISE EXCEPTION 'Fog disable did not invalidate scene rules';END IF;
END $$;

-- Repeating the same rule values is NOT a real scene publication.
UPDATE forge_visibility.map_rules SET fog_enforced=false,
 collision_enforced=false WHERE
 map_id='10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages WHERE event='scene-revision-v2')<>3
 THEN RAISE EXCEPTION 'No-op rules caused redundant scene invalidation';END IF;
END $$;

-- Policy: member can receive only map they can currently view. Nonmember
-- or reassigned player cannot subscribe. No browser INSERT on this topic.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
SET request.realtime.topic='forge-world-scene-v2:10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages
 WHERE event='scene-revision-v2')<>3
 THEN RAISE EXCEPTION 'Authorized player scene topic denied';END IF;
 BEGIN
  INSERT INTO realtime.messages(topic,event,payload,private)
   VALUES('forge-world-scene-v2:10000000-0000-4000-8000-000000000001',
    'scene-revision-v2','{"sceneGeneration":9000}'::jsonb,true);
  RAISE EXCEPTION 'Browser forged scene publication';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;END;
END $$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
SET request.realtime.topic='forge-world-scene-v2:10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages WHERE event='scene-revision-v2')<>0
 THEN RAISE EXCEPTION 'Reassigned viewer subscribed to previous scene';END IF;
 IF public.get_world_scene_v2(
 '10000000-0000-4000-8000-000000000001') IS NOT NULL
 THEN RAISE EXCEPTION 'Reassigned viewer read unauthorized scene';END IF;
END $$;
RESET ROLE;

SET ROLE anon;
SET request.realtime.topic='forge-world-scene-v2:10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages WHERE event='scene-revision-v2')<>0
 THEN RAISE EXCEPTION 'Anonymous scene notifications readable';END IF;
END $$;
RESET ROLE;

-- Never send unpublished prepared geometry to a viewer of a map which has
-- no environment record at all (newly-created map2).
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.get_world_scene_v2('10000000-0000-4000-8000-000000000002');
 IF r->>'published'<>'false' OR r->>'sceneGeneration'<>'0'
 OR r->>'scope'<>'viewer' OR r->'environment'<>'null'::jsonb
 THEN RAISE EXCEPTION 'Unpublished new map revealed secret scene: %',r;END IF;
END $$;
RESET ROLE;
SELECT 'world-engine-v2-scene-contract-passed' AS result;
