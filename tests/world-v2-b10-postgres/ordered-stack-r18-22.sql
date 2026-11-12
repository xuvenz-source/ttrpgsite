-- B10-R18-22, third fresh LOCAL disposable PG17 only.
-- PURPOSE: leave real frozen R05 installed (unlike the recovery rehearsal),
-- then execute the exact staged wall -> corrected map guard -> affinity SQL
-- sequence WITH commits in ONE ephemeral database. No Supabase connectivity.
\set ON_ERROR_STOP on

-- Fill only columns absent from the simplified B04 fixture that are required
-- to evaluate exact production token/tool write validators and fog rule guard.
ALTER TABLE forge_visibility.map_rules ADD COLUMN fog_enforced boolean NOT NULL DEFAULT false;
ALTER TABLE public.map_tokens ADD COLUMN npc_template_id uuid;
ALTER TABLE public.campaign_tool_issues
 ADD COLUMN template_id uuid, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE public.npc_templates(id uuid PRIMARY KEY,campaign_id uuid NOT NULL);
CREATE TABLE public.campaign_tool_templates(id uuid PRIMARY KEY,campaign_id uuid NOT NULL);
-- Historical source-real triggers (not candidate code) are established
-- before R05 to reproduce the already-running database baseline.
\i /tmp/world_v2_b10_r18_22_orig_collisions.sql
\i /tmp/world_v2_b10_r18_22_trajectory.sql
\i tests/world-v2-b10-postgres/live-v2-checkpoint-r18-21.sql
\i tests/world-v2-b10-postgres/live-collision-baseline-r18-21.sql
\i tests/world-v2-b10-postgres/live-validators-r18-20.sql
CREATE TRIGGER tokens_validate
 BEFORE INSERT OR UPDATE ON public.map_tokens FOR EACH ROW
 EXECUTE FUNCTION public.validate_token_map();
CREATE TRIGGER campaign_tool_validate_issue
 BEFORE INSERT OR UPDATE ON public.campaign_tool_issues FOR EACH ROW
 EXECUTE FUNCTION public.validate_campaign_tool_write();
\i /tmp/world_v2_b10_r18_22_original_commit.sql

CREATE TEMP TABLE r22_original AS
SELECT v.signature,md5(pg_get_functiondef(to_regprocedure(v.signature))) original_md5
FROM (VALUES
 ('forge_world_v2.publish_approved_observers(forge_world_v2.motion_sessions,jsonb,jsonb)'),
 ('forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'),
 ('public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'),
 ('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)')
) v(signature);
DO $r22_pre$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=4 FROM r22_original) AND
  to_regclass('forge_world_v2.motion_r05_function_backup') IS NULL AND
  (SELECT count(*)=2 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='forge_visibility' AND
    p.proname IN ('enforce_collision','enforce_tool_collision') AND
    position('commit_allows_piece_v2' IN pg_get_functiondef(p.oid))>0),
  'O01 third DB starts on source-real pre-R05 authority and checkpoint-aware legacy guards');
END $r22_pre$;

-- 1. Frozen, unchanged R05 is the first separately committed SQL package.
BEGIN;
\i supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql
COMMIT;
DO $r22_r05$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=4 FROM forge_world_v2.motion_r05_function_backup) AND
  (SELECT count(*)=4 FROM r22_original r WHERE
    md5(pg_get_functiondef(to_regprocedure(r.signature)))<>r.original_md5) AND
  to_regclass('forge_world_v2.observer_pending_b07') IS NOT NULL AND
  to_regclass('forge_world_v2.observer_budget_b07') IS NOT NULL AND
  (SELECT position('validate_motion_path_batch_b03' IN pg_get_functiondef(
   'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure))>0),
  'O02 R05 installed and its four new authority bodies REMAIN ACTIVE, no recovery reset');
 PERFORM public.b08_assert(
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  (SELECT relrowsecurity FROM pg_class WHERE oid=
   'forge_world_v2.observer_pending_b07'::regclass),
  'O03 R05 private observer queue RLS and Data API schema isolation preserved');
END $r22_r05$;

-- 2. Staged dual-geometry helpers. No invented migration timestamp.
BEGIN;
\i supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql
COMMIT;
DO $r22_wall$
BEGIN
 PERFORM public.b08_assert(
  NOT forge_world_v2.swept_hits_segment(0,0,1,1,1,0,1.95,0,1.95,1)
  AND NOT forge_visibility.swept_hits_segment(0,0,1,1,1,0,1.95,0,1.95,1)
  AND forge_world_v2.swept_hits_segment(0,0,1,1,1,0,1.8,0,1.8,1)
  AND forge_visibility.swept_hits_segment(0,0,1,1,1,0,1.8,0,1.8,1),
  'O04 post-R05 both real geometry helpers accept 5% edge but block 20% penetration');
END $r22_wall$;

-- 3. Corrected R18-21 source-real token/tool guards MUST preserve checkpoint.
BEGIN;
\i supabase/candidates/world_v2_r18_19_cross_map_guard.sql
COMMIT;
DO $r22_guards$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='forge_visibility' AND
   p.proname IN ('enforce_collision','enforce_tool_collision')
   AND position('commit_allows_piece_v2' IN pg_get_functiondef(p.oid))>0),
  'O05 corrected guard keeps signed V2 checkpoint hook for BOTH token and tool');
END $r22_guards$;

-- 4. R18-20 no-reparent guard to map/token, without redundant tool trigger.
BEGIN;
\i supabase/candidates/world_v2_r18_20_campaign_affinity.sql
COMMIT;
DO $r22_affinity$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM pg_trigger t
    WHERE t.tgname IN ('forge_map_campaign_affinity_r18_20',
      'forge_token_campaign_affinity_r18_20') AND t.tgenabled='O') AND
  (SELECT count(*)=4 FROM r22_original r WHERE
    md5(pg_get_functiondef(to_regprocedure(r.signature)))<>r.original_md5),
  'O06 complete wall->map-transfer->affinity stack installed while R05 stays active');
END $r22_affinity$;

-- All DML below is test-only and rolled back independently. This transaction
-- does NOT roll back any previously installed candidate SQL in local DB.
BEGIN;
DO $r22_behavior$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 same_map uuid:='00000000-0000-4000-8000-000000000022';
 other_campaign uuid:='00000000-0000-4000-8000-000000000002';
 other_map uuid:='00000000-0000-4000-8000-000000000023';
 token uuid:='00000000-0000-4000-8000-000000000101';
 tool uuid:='00000000-0000-4000-8000-000000000201';
 sid uuid;ack jsonb;advanced jsonb;committed jsonb;reason text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 INSERT INTO public.battle_maps(id,campaign_id,width,height,grid_size)
 VALUES(same_map,campaign,160,160,10),
       (other_map,other_campaign,160,160,10);
 INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES(other_campaign,dm,'dm');
 -- Wall at 3.95 permits the tool's rightmost 5% overlap after inset;
 -- farther inside the token remains clear.
 UPDATE public.map_environments AS e
 SET live='{"objects":[{"type":"wall","points":[{"x":3.95,"y":0},{"x":3.95,"y":16}],"blocksMovement":true}]}'::jsonb
 WHERE e.map_id=test_map;
 ack:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 PERFORM public.b08_assert(ack ? 'sessionId',
  'O07 actual POST-R05 Begin issues player-owned token session');
 sid:=(ack->>'sessionId')::uuid;
 advanced:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  advanced->'accepted'='[{"x":2,"y":1}]'::jsonb,
  'O08 actual R05 B03/V2 authority accepts shallow-border movement');
 committed:=public.commit_world_motion_v2(
  sid,2,'{"x":2,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  committed->'endpoint'='{"x":2,"y":1}'::jsonb AND
  (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=token) AND
  (SELECT status='committed' FROM forge_world_v2.motion_sessions WHERE id=sid),
  'O09 post-R05 authorized canonical token commit succeeds through corrected live collision guard');
 PERFORM public.b08_assert(
  public.commit_world_motion_v2(
   sid,2,'{"x":3,"y":1}'::jsonb,1,1) IS NULL,
  'O10 same-session altered commit replay rejected after canonical commit');

 -- At least one actual direct tool UPDATE still relies on swept collision.
 -- A player-owned tool cannot transfer maps even where RLS alone permits.
 reason:=NULL;
 BEGIN UPDATE public.campaign_tool_issues SET map_id=same_map WHERE id=tool;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(
  position('Only the DM can transfer' IN coalesce(reason,''))>0 AND
  (SELECT map_id=test_map FROM public.campaign_tool_issues WHERE id=tool),
  'O11 issued tool cross-map transfer blocked for non-DM after ALL SQL packages');
 reason:=NULL;
 BEGIN UPDATE public.map_tokens SET x=4 WHERE id=token;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(
  position('Movement blocked' IN coalesce(reason,''))>0
  AND (SELECT x=2 FROM public.map_tokens WHERE id=token),
  'O12 direct token move through solid wall still blocked after authorized commit');

 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 UPDATE public.map_tokens SET map_id=same_map WHERE id=token;
 PERFORM public.b08_assert(
  (SELECT map_id=same_map AND campaign_id=campaign
   FROM public.map_tokens WHERE id=token),
  'O13 DM same-campaign token map transfer survives the identity guard');
 reason:=NULL;
 BEGIN UPDATE public.map_tokens SET campaign_id=other_campaign,
  map_id=other_map WHERE id=token;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(
  position('Campaign identity cannot change' IN coalesce(reason,''))>0 AND
  (SELECT campaign_id=campaign AND map_id=same_map
   FROM public.map_tokens WHERE id=token),
  'O14 token reparent blocked despite DM role in both campaigns');
 reason:=NULL;
 BEGIN UPDATE public.battle_maps SET campaign_id=other_campaign
  WHERE id=same_map;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(
  position('Campaign identity cannot change' IN coalesce(reason,''))>0
  AND (SELECT campaign_id=campaign FROM public.battle_maps WHERE id=same_map),
  'O15 map reparent blocked without corrupting campaign affinity');
 PERFORM public.b08_assert(
  (SELECT count(*)=4 FROM forge_world_v2.motion_r05_function_backup) AND
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  NOT has_function_privilege('anon',
   'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE'),
  'O16 R05 recovery backup, private ACL, and anon commit denial survive entire chain');
 -- The full sequence must also commit an owned 2x2 MOUNT through the
 -- ACTUAL post-R05 signed authority RPCs and the current tool trigger.
 -- The 3.95 wall slightly intersects its outer edge (5% of one cell).
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 ack:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','tool','id',tool)),
  '{"x":1,"y":7}'::jsonb,'drag',1,1,false);
 PERFORM public.b08_assert(ack ? 'sessionId',
  'O18 actual POST-R05 Begin issues player-owned 2x2 mount session');
 sid:=(ack->>'sessionId')::uuid;
 advanced:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":7}'::jsonb,'[{"x":2,"y":7}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  advanced->'accepted'='[{"x":2,"y":7}]'::jsonb,
  'O19 post-R05 B03 authority accepts mount shallow-border movement');
 committed:=public.commit_world_motion_v2(
  sid,2,'{"x":2,"y":7}'::jsonb,1,1);
 PERFORM public.b08_assert(
  committed->'endpoint'='{"x":2,"y":7}'::jsonb AND
  (SELECT x=2 AND y=7 FROM public.campaign_tool_issues WHERE id=tool) AND
  (SELECT status='committed' FROM forge_world_v2.motion_sessions WHERE id=sid),
  'O20 actual mount canonical commit passes corrected tool checkpoint guard');
 RAISE NOTICE 'R18-22: 19 ordered install plus live token/tool authority assertions PASSED';
END $r22_behavior$;
ROLLBACK;

-- The installed staging stack remains persistent only inside this transient
-- DB. Confirm rollback cleaned test changes but not R05 or candidates.
DO $r22_end$
BEGIN
 PERFORM public.b08_assert(
  (SELECT x=1 AND y=1 FROM public.map_tokens WHERE
   id='00000000-0000-4000-8000-000000000101'::uuid) AND
  to_regclass('forge_world_v2.motion_r05_function_backup') IS NOT NULL AND
  to_regprocedure('forge_visibility.guard_campaign_affinity_r18_20()') IS NOT NULL AND
  (SELECT count(*)=0 FROM forge_world_v2.motion_sessions),
  'O17 test-only DML rolled back; R05 and three candidate packages remain installed in third disposable DB');
 RAISE NOTICE 'R18-22: 20 ordered full-stack SQL assertions PASSED; disposable database will be deleted with CI service';
END $r22_end$;
