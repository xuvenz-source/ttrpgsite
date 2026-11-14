-- B10-R18-69 — disposable PostgreSQL 17 ONLY. Invoked by R18-57's
-- already-open BEGIN/ROLLBACK fixture AFTER guarded opt-in candidate install.
-- Compare original vs candidate complete per-viewer fog frame for all eight
-- independent fixture member IDs under hostile and shared scene states.
-- Never include this in supabase/migrations or run on connected Supabase.
\set ON_ERROR_STOP on
DO $r69_guard$
BEGIN
 PERFORM public.b08_assert(
  current_database()='world_v2_b10_r05'
  AND current_user='postgres'
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND to_regprocedure('forge_visibility.r57_unmodified_fog_frame(uuid,uuid)') IS NOT NULL
  AND md5(pg_get_functiondef(to_regprocedure(
      'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
    ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND (SELECT proacl::text='{postgres=X/postgres}' FROM pg_proc
    WHERE oid=to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'))
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND NOT has_function_privilege('authenticated',
      'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon',
      'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND (SELECT count(*)=8 FROM public.campaign_members WHERE role='player'),
  'R69-01 exact isolated 91-history guarded private eight-viewer fog fixture');
END $r69_guard$;

CREATE TEMP TABLE r69_scenes(
 label text PRIMARY KEY,scene jsonb NOT NULL,
 requires_empty boolean NOT NULL DEFAULT false
);
INSERT INTO pg_temp.r69_scenes(label,scene,requires_empty)
VALUES
 ('open-dark','{"objects":[],"ambient":0,"fog":{"partyShared":false}}'::jsonb,false),
 ('shared-open-dark','{"objects":[],"ambient":0,"fog":{"partyShared":true}}'::jsonb,false),
 ('shared-open-default','{"objects":[],"ambient":25,"fog":{"partyShared":true}}'::jsonb,false),
 ('closed-door','{"objects":[{"type":"door","state":"closed","points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]}],"ambient":25,"fog":{"partyShared":false}}'::jsonb,false),
 ('open-door','{"objects":[{"type":"door","state":"open","points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]}],"ambient":25,"fog":{"partyShared":false}}'::jsonb,false),
 ('closed-window','{"objects":[{"type":"window","state":"closed","points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]}],"ambient":25,"fog":{"partyShared":false}}'::jsonb,false),
 ('malformed-wall','{"objects":[{"type":"wall","points":"bad"}],"ambient":25,"fog":{"partyShared":false}}'::jsonb,false),
 ('null-object','{"objects":[null],"ambient":25,"fog":{"partyShared":false}}'::jsonb,false),
 ('over-limit','{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb,true);
UPDATE pg_temp.r69_scenes
 SET scene=jsonb_set(scene,'{objects}',
   (SELECT jsonb_agg(jsonb_build_object('type','decoration'))
     FROM generate_series(1,121)))
 WHERE label='over-limit';

CREATE TEMP TABLE r69_parity_counts(
 scenario text NOT NULL,
 checked_viewers integer NOT NULL,
 PRIMARY KEY(scenario)
);
DO $r69_full_frame_parity$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 cfg record;person uuid;expected jsonb;actual jsonb;seen integer;
BEGIN
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000011',true);
 PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
 FOR cfg IN SELECT label,scene,requires_empty FROM pg_temp.r69_scenes
  ORDER BY label LOOP
  UPDATE public.map_environments SET live=cfg.scene
   WHERE map_id=test_map;
  seen:=0;
  FOR person IN SELECT cm.user_id FROM public.campaign_members cm
   WHERE cm.campaign_id='00000000-0000-4000-8000-000000000001'::uuid
   AND cm.role='player' ORDER BY cm.user_id LOOP
   -- Call the actual original alias and actual sealed candidate for the
   -- SAME viewer and scene. Compare complete JSONB, not cell counts.
   expected:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
   actual:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
   PERFORM public.b08_assert(
    expected IS NOT DISTINCT FROM actual,
    'R69-02 full private fog/LOS/exploration parity '||cfg.label);
   IF cfg.requires_empty THEN
    PERFORM public.b08_assert(
      expected->'visible'='[]'::jsonb
      AND actual->'visible'='[]'::jsonb,
      'R69-03 over-limit scene fails closed for each viewer');
   END IF;
   seen:=seen+1;
  END LOOP;
  PERFORM public.b08_assert(seen=8,
   'R69-04 all eight independent fixture player memberships included');
  INSERT INTO pg_temp.r69_parity_counts VALUES(cfg.label,seen);
 END LOOP;
 -- Restore exact original scene before R18-57's existing bench/hostile cases.
 UPDATE public.map_environments SET live=
  '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
  WHERE map_id=test_map;
 PERFORM public.b08_assert(
  (SELECT count(*)=9 AND sum(checked_viewers)=72
    FROM pg_temp.r69_parity_counts)
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
    FROM public.map_environments WHERE map_id=test_map)
  AND (SELECT count(*)=8 FROM public.campaign_members WHERE role='player'),
  'R69-05 72 full source-vs-candidate private frames, scene and membership restored');
 RAISE NOTICE 'R18-69 PASS: 9 hostile/shared/dark portal scenes x 8 source-real viewers = 72 full JSONB frame comparisons, all rolled back';
END $r69_full_frame_parity$;
SELECT label,checked_viewers
 FROM pg_temp.r69_parity_counts AS c
 JOIN pg_temp.r69_scenes AS s ON s.label=c.scenario
 ORDER BY label;
