-- R18-105: isolated PG17 runtime contracts AFTER applying the actual staged SQL.
-- Tests are SQL execution with simulated JWT GUC, NOT signed Supabase sessions.
\set ON_ERROR_STOP on

DO $acl$ DECLARE n integer; BEGIN
 IF NOT has_function_privilege('authenticated','public.is_map_fog_published(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.is_map_fog_published(uuid)','EXECUTE')
 OR has_schema_privilege('authenticated','forge_visibility','USAGE')
 OR has_table_privilege('authenticated','forge_visibility.map_rules','SELECT') THEN
  RAISE EXCEPTION 'R105 candidate post-install role grants/private fog ACL mismatch';
 END IF;
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.proname='is_map_fog_published'
  AND p.prosecdef AND p.provolatile='s'
  AND 'search_path=""'=ANY(p.proconfig);
 IF n<>1 THEN
  RAISE EXCEPTION 'R105 candidate signature SECURITY DEFINER STABLE search_path mismatch';
 END IF;
 SELECT count(*) INTO n FROM pg_policy pol JOIN pg_class t ON t.oid=pol.polrelid
 WHERE t.relname='map_combats' AND pol.polname='dm or nonfog viewers read combat roster'
  AND pg_get_expr(pol.polqual,pol.polrelid) LIKE '%is_map_fog_published%';
 IF n<>1 THEN RAISE EXCEPTION 'R105 original combat roster RLS policy lost'; END IF;
END $acl$;

-- Anonymous cannot invoke the function (the shell additionally attempts a direct call).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $outsider$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000201') IS DISTINCT FROM false OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000204') IS DISTINCT FROM false OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000205') IS DISTINCT FROM false OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000999') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'R105 signed outsider could infer fog status or map existence';
 END IF;
 IF (SELECT count(*) FROM public.map_combats) <> 0 THEN
  RAISE EXCEPTION 'R105 signed outsider could access another campaign roster';
 END IF;
END $outsider$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $dm_a$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000203') IS DISTINCT FROM true OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000204') IS DISTINCT FROM false OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000205') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'R105 DM visibility, cross-campaign or mismatched map-rules regression';
 END IF;
 IF (SELECT count(*) FROM public.map_combats) <> 2 THEN
  RAISE EXCEPTION 'R105 DM lost valid fog and nonfog combat-roster access';
 END IF;
END $dm_a$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $dm_b$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000204') IS DISTINCT FROM true OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000201') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'R105 DM of campaign B can infer another campaign';
 END IF;
 IF (SELECT count(*) FROM public.map_combats) <> 1 THEN
  RAISE EXCEPTION 'R105 campaign B DM roster boundary violated';
 END IF;
END $dm_b$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $player_assigned_fog$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000203') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'R105 assigned/unassigned player fog access mismatch';
 END IF;
 IF (SELECT count(*) FROM public.map_combats) <> 0 THEN
  RAISE EXCEPTION 'R105 P1 was shown fog-covered or unrelated map roster';
 END IF;
END $player_assigned_fog$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $player_assigned_nonfog$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000201') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'R105 player on nonfog map learned unassigned fog status';
 END IF;
 IF (SELECT count(*) FROM public.map_combats) <> 1 OR
    (SELECT count(*) FROM public.map_combats
      WHERE map_id='00000000-0000-4000-8000-000000000202') <> 1 THEN
  RAISE EXCEPTION 'R105 nonfog assigned player lost expected combat roster';
 END IF;
END $player_assigned_nonfog$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000306',true);
DO $revocable$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'R105 fixture revocable member was not initially authorized';
 END IF;
END $revocable$;
COMMIT;
DELETE FROM public.campaign_members
WHERE campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000306';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000306',true);
DO $revoked$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000201') IS DISTINCT FROM false OR
    (SELECT count(*) FROM public.map_combats) <> 0 THEN
  RAISE EXCEPTION 'R105 membership revocation did not close fog/roster access';
 END IF;
END $revoked$;
COMMIT;

-- Movement cleanup: P1 cannot end P2 session or preview. Valid self cleanup still works.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $foreign_motion$ DECLARE n integer; BEGIN
 n:=public.end_map_motion_sessions(
  '00000000-0000-4000-8000-000000000201',
  ARRAY['00000000-0000-4000-8000-000000000402']::uuid[],ARRAY[]::uuid[]);
 IF n<>0 THEN RAISE EXCEPTION 'R105 P1 ended P2 motion session'; END IF;
 n:=public.end_map_motion_sessions(
  '00000000-0000-4000-8000-000000000201',
  ARRAY['00000000-0000-4000-8000-000000000401']::uuid[],ARRAY[]::uuid[]);
 IF n<>1 THEN RAISE EXCEPTION 'R105 P1 could not end own motion session'; END IF;
END $foreign_motion$;
COMMIT;
DO $motion_verification$ BEGIN
 IF (SELECT count(*) FROM forge_visibility.movement_sessions
     WHERE actor_id='00000000-0000-4000-8000-000000000302')<>0 OR
    (SELECT count(*) FROM forge_visibility.movement_preview_rates
     WHERE actor_id='00000000-0000-4000-8000-000000000302')<>0 OR
    (SELECT count(*) FROM forge_visibility.movement_sessions
     WHERE actor_id='00000000-0000-4000-8000-000000000303')<>1 OR
    (SELECT count(*) FROM forge_visibility.movement_preview_rates
     WHERE actor_id='00000000-0000-4000-8000-000000000303')<>1 THEN
   RAISE EXCEPTION 'R105 foreign movement session/preview was modified';
 END IF;
END $motion_verification$;
\echo 'R105 SOURCE-REAL DISPOSABLE POST-CANDIDATE PASS: 12-case synthetic fog/RLS/movement matrix'
