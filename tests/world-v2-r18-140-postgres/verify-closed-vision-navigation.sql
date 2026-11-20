-- B10-R18-140 disposable PG17 ONLY. Fictional original V2 routines.
\set ON_ERROR_STOP on
DO $r140_acl$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api';
 IF n<>13 THEN RAISE EXCEPTION 'R140 exposed API count changed';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_internal' AND p.prosecdef;
 IF n<>13 THEN RAISE EXCEPTION 'R140 expected 13 private definers';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname IN ('forge_v3_api','forge_v3_internal')
 AND p.proname<>'get_authorized_scene_channel_v3'
 AND (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
 OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')))
 THEN RAISE EXCEPTION 'R140 new or inherited gameplay helper EXECUTE leaked';END IF;
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE')
 THEN RAISE EXCEPTION 'R140 public schema reopened';END IF;
END $r140_acl$;

-- The server starts FENCED, regardless of any DM or map rights.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',false);
DO $r140_fenced$
DECLARE m uuid:='00000000-0000-4000-8000-000000000201';
 v uuid:='00000000-0000-4000-8000-000000000303';
 tok uuid:='00000000-0000-4000-8000-000000000404';
BEGIN
 IF forge_v3_api.get_authorized_world_preview_v3(m,v) IS NOT NULL OR
 forge_v3_api.get_authorized_world_preview_at_v3(m,v,tok,1,1) IS NOT NULL OR
 forge_v3_api.get_authorized_world_fog_delta_v3(m,null,null,null) IS NOT NULL OR
 forge_v3_api.get_authorized_world_light_masks_v3(m) IS NOT NULL OR
 forge_v3_api.get_authorized_world_navigation_v3(m,'token',tok) IS NOT NULL
 THEN RAISE EXCEPTION 'R140 fenced mode unexpectedly served gameplay';END IF;
END $r140_fenced$;

-- Only this isolated synthetic test fixture temporarily changes the gate.
UPDATE forge_scene_drain.scene_publication_gate SET mode='v3-only'
 WHERE singleton=true;
DO $r140_dm_preview$
DECLARE m uuid:='00000000-0000-4000-8000-000000000201';
 v uuid:='00000000-0000-4000-8000-000000000303';
 p2 uuid:='00000000-0000-4000-8000-000000000302';
 outsider uuid:='00000000-0000-4000-8000-000000000304';
 tok uuid:='00000000-0000-4000-8000-000000000404';
 other_tok uuid:='00000000-0000-4000-8000-000000000405';
 frame jsonb;
BEGIN
 frame:=forge_v3_api.get_authorized_world_preview_v3(m,v);
 IF frame->>'viewerId' IS DISTINCT FROM v::text OR
    frame->>'scope' IS DISTINCT FROM 'viewer' OR
    pg_catalog.jsonb_typeof(frame->'visiblePieces') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'R140 DM preview target scope incorrect';END IF;
 frame:=forge_v3_api.get_authorized_world_preview_at_v3(m,v,tok,1,1);
 IF frame->>'viewerId' IS DISTINCT FROM v::text OR
    frame->>'scope' IS DISTINCT FROM 'viewer'
 THEN RAISE EXCEPTION 'R140 valid DM virtual-token preview denied';END IF;
 IF forge_v3_api.get_authorized_world_preview_v3(m,outsider) IS NOT NULL OR
    forge_v3_api.get_authorized_world_preview_at_v3(m,v,other_tok,1,1) IS NOT NULL OR
    forge_v3_api.get_authorized_world_preview_at_v3(m,v,tok,-1,1) IS NOT NULL OR
    forge_v3_api.get_authorized_world_preview_at_v3(m,v,tok,10,1) IS NOT NULL OR
    forge_v3_api.get_authorized_world_preview_v3(
      '00000000-0000-4000-8000-000000000203',v) IS NOT NULL
 THEN RAISE EXCEPTION 'R140 unauthorized DM preview escaped bounds';END IF;
 IF (SELECT count(*) FROM r140_fiction.preview_calls)<>2
 THEN RAISE EXCEPTION 'R140 mock unexpected preview side effect';END IF;
END $r140_dm_preview$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r140_p1$
DECLARE m uuid:='00000000-0000-4000-8000-000000000201';
 epoch uuid:='00000000-0000-4000-8000-000000000700';
 tok uuid:='00000000-0000-4000-8000-000000000404';
 stolen uuid:='00000000-0000-4000-8000-000000000405';
 other uuid:='00000000-0000-4000-8000-000000000203';
 frame jsonb;
BEGIN
 IF forge_v3_api.get_authorized_world_preview_v3(m,
  '00000000-0000-4000-8000-000000000302') IS NOT NULL OR
 forge_v3_api.get_authorized_world_preview_at_v3(m,
  '00000000-0000-4000-8000-000000000303',tok,1,1) IS NOT NULL
 THEN RAISE EXCEPTION 'R140 non-DM granted preview';END IF;
 frame:=forge_v3_api.get_authorized_world_fog_delta_v3(m,null,null,null);
 IF frame->>'mode' IS DISTINCT FROM 'snapshot' OR
   pg_catalog.jsonb_typeof(frame->'visible') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'R140 actor fog snapshot incorrect';END IF;
 frame:=forge_v3_api.get_authorized_world_fog_delta_v3(m,epoch,4,0);
 IF frame->>'mode' IS DISTINCT FROM 'delta' OR
   frame->>'baseRevision' IS DISTINCT FROM '4'
 THEN RAISE EXCEPTION 'R140 authorized fog delta mismatch';END IF;
 frame:=forge_v3_api.get_authorized_world_fog_delta_v3(m,epoch,5,1);
 IF frame->>'mode' IS DISTINCT FROM 'noop'
 THEN RAISE EXCEPTION 'R140 authorized fog noop mismatch';END IF;
 IF forge_v3_api.get_authorized_world_fog_delta_v3(m,epoch,null,1) IS NOT NULL OR
    forge_v3_api.get_authorized_world_fog_delta_v3(m,null,4,0) IS NOT NULL
 THEN RAISE EXCEPTION 'R140 partial fog base accepted';END IF;
 frame:=forge_v3_api.get_authorized_world_light_masks_v3(m);
 IF frame->>'protocolVersion' IS DISTINCT FROM '2' OR
    pg_catalog.jsonb_typeof(frame->'masks') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'R140 signed viewer light mask mismatch';END IF;
 frame:=forge_v3_api.get_authorized_world_navigation_v3(m,'token',tok);
 IF frame->>'pieceId' IS DISTINCT FROM tok::text OR
    frame->>'version' IS DISTINCT FROM '1'
 THEN RAISE EXCEPTION 'R140 owner token navigation mismatch';END IF;
 frame:=forge_v3_api.get_authorized_world_navigation_v3(m,'tool',
  '00000000-0000-4000-8000-000000000407');
 IF frame->>'kind' IS DISTINCT FROM 'tool'
 THEN RAISE EXCEPTION 'R140 owner tool navigation mismatch';END IF;
 IF forge_v3_api.get_authorized_world_navigation_v3(m,'token',stolen) IS NOT NULL OR
  forge_v3_api.get_authorized_world_navigation_v3(m,'npc',tok) IS NOT NULL OR
  forge_v3_api.get_authorized_world_navigation_v3(other,'token',tok) IS NOT NULL OR
  forge_v3_api.get_authorized_world_light_masks_v3(other) IS NOT NULL OR
  forge_v3_api.get_authorized_world_fog_delta_v3(other,null,null,null) IS NOT NULL
 THEN RAISE EXCEPTION 'R140 player crossed token/map authorization';END IF;
END $r140_p1$;

-- Player 2 cannot use player 1's token, even within the same campaign map.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',false);
DO $r140_p2$
BEGIN
 IF forge_v3_api.get_authorized_world_navigation_v3(
  '00000000-0000-4000-8000-000000000201','token',
  '00000000-0000-4000-8000-000000000404') IS NOT NULL OR
  forge_v3_api.get_authorized_world_preview_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303') IS NOT NULL
 THEN RAISE EXCEPTION 'R140 P2 gained P1 piece or DM preview';END IF;
END $r140_p2$;

-- Outsider 304 is a DM for a *different* campaign; never trusted on map201.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000304',false);
DO $r140_outsider$
BEGIN
 IF forge_v3_api.get_authorized_world_fog_delta_v3(
   '00000000-0000-4000-8000-000000000201',null,null,null) IS NOT NULL
 OR forge_v3_api.get_authorized_world_preview_v3(
   '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000303') IS NOT NULL
 OR forge_v3_api.get_authorized_world_light_masks_v3(
   '00000000-0000-4000-8000-000000000201') IS NOT NULL
 OR forge_v3_api.get_authorized_world_navigation_v3(
   '00000000-0000-4000-8000-000000000201','token',
   '00000000-0000-4000-8000-000000000404') IS NOT NULL
 THEN RAISE EXCEPTION 'R140 outsider read cross-campaign gameplay';END IF;
END $r140_outsider$;

-- Test a temporary rolled-back signed authenticated grant. This is NOT an
-- actual browser or PostgREST test and grants never escape the transaction.
BEGIN;
GRANT EXECUTE ON FUNCTION
 forge_v3_api.get_authorized_world_light_masks_v3(uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION
 forge_v3_internal.get_authorized_world_light_masks_v3(uuid)
 TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
DO $r140_temporary_authenticated$
DECLARE m jsonb;
BEGIN
 m:=forge_v3_api.get_authorized_world_light_masks_v3(
  '00000000-0000-4000-8000-000000000201');
 IF m->>'protocolVersion' IS DISTINCT FROM '2' THEN
 RAISE EXCEPTION 'R140 temporary signed role failed narrow invoker chain';END IF;
END $r140_temporary_authenticated$;
ROLLBACK;

-- Revoke P1, prove that server topic authorization is re-evaluated.
DELETE FROM public.campaign_members WHERE
 campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000303';
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r140_revoked$
BEGIN
 IF forge_v3_api.get_authorized_world_fog_delta_v3(
  '00000000-0000-4000-8000-000000000201',null,null,null) IS NOT NULL OR
 forge_v3_api.get_authorized_world_navigation_v3(
  '00000000-0000-4000-8000-000000000201','token',
  '00000000-0000-4000-8000-000000000404') IS NOT NULL OR
 forge_v3_api.get_authorized_world_light_masks_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 THEN RAISE EXCEPTION 'R140 revoked actor retained fresh server API access';END IF;
END $r140_revoked$;
UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced'
 WHERE singleton=true;
DO $r140_final$
BEGIN
 IF pg_catalog.has_function_privilege('authenticated',
 'forge_v3_api.get_authorized_world_light_masks_v3(uuid)','EXECUTE') OR
 pg_catalog.has_function_privilege('authenticated',
 'forge_v3_internal.get_authorized_world_light_masks_v3(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'R140 temporary test GRANT escaped rollback';END IF;
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton)
 IS DISTINCT FROM 'fenced'
 THEN RAISE EXCEPTION 'R140 failed safe fenced ending';END IF;
END $r140_final$;
\echo 'R140 SYNTHETIC PG17 PASS: 5 denied browser APIs; DM preview actor map and token bound; P1/P2/outsider and revoke scope; fog delta/noop; light/navigation; ALL source-only and ungranted.'
