-- B10-R18-11: source-real Phase 7 visibility + Phase 5 private topic
-- authorization under a THREE-IDENTITY revoke/downgrade/rejoin sequence.
-- Runs only after the existing V2 isolated source-real tests, on the
-- throwaway PostgreSQL 17 fixture. Every write here is ROLLED BACK.
--
-- This is PostgreSQL role/JWT simulation, NOT a live Auth connection,
-- browser WebSocket disconnect, or a test of applied R05 production SQL.
\set ON_ERROR_STOP on
BEGIN;
-- Explicitly place one recognizable fixture-only private message in the
-- historical topic. A leaked SELECT is an independently visible failure.
INSERT INTO realtime.messages(topic,event,payload,private) VALUES(
 'forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000001',
 'world-motion-v2','{"r1811_fixture":"recipient-only"}'::jsonb,true
);

-- P1 is initially entitled to the published map A.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
SET request.realtime.topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000001';
DO $r1811_p1_allowed$
DECLARE f jsonb; c jsonb;
BEGIN
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 c:=public.get_world_observer_cursor_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f IS NULL OR f->>'scope'<>'viewer' OR
  f->>'viewerId'<>'30000000-0000-4000-8000-000000000001' OR
  c->>'viewerId'<>'30000000-0000-4000-8000-000000000001' OR
  (SELECT count(*) FROM realtime.messages m
   WHERE m.payload->>'r1811_fixture'='recipient-only')<>1
 THEN RAISE EXCEPTION 'R18-11 P1 baseline signed sight/topic unavailable';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(f->'visiblePieces') item
  WHERE item->>'id'='40000000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'R18-11 P1 baseline exposed DM-hidden token';END IF;
END $r1811_p1_allowed$;
RESET ROLE;
RESET request.jwt.claim.sub;
RESET request.realtime.topic;

-- Simulate an owner removing P1 from the campaign while that browser's
-- previous topic/JWT is still cached. No database session is dropped.
DELETE FROM public.campaign_members WHERE
 campaign_id='20000000-0000-4000-8000-000000000001' AND
 user_id='30000000-0000-4000-8000-000000000001';

SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
SET request.realtime.topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000001';
DO $r1811_p1_revoked$
BEGIN
 IF public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001') IS NOT NULL OR
  public.get_world_observer_cursor_v2(
  '10000000-0000-4000-8000-000000000001') IS NOT NULL OR
  (SELECT count(*) FROM realtime.messages m
   WHERE m.payload->>'r1811_fixture'='recipient-only')<>0
 THEN RAISE EXCEPTION 'R18-11 revoked P1 retained signed sight/cursor/topic';END IF;
 -- Even a previously signed DM-preview target cannot be impersonated.
 IF public.preview_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001') IS NOT NULL
 THEN RAISE EXCEPTION 'R18-11 revoked P1 gained DM preview';END IF;
END $r1811_p1_revoked$;
RESET ROLE;
RESET request.jwt.claim.sub;
RESET request.realtime.topic;

-- Rejoin must require a NEW authorized sight. The already stored private
-- message is visible again only to the same recipient, never to P2.
INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES(
 '20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001','player'
);
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
SET request.realtime.topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000001';
DO $r1811_p1_rejoin$
DECLARE f jsonb;
BEGIN
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f IS NULL OR f->>'scope'<>'viewer' OR
  (SELECT count(*) FROM realtime.messages m
   WHERE m.payload->>'r1811_fixture'='recipient-only')<>1
 THEN RAISE EXCEPTION 'R18-11 P1 rejoin did not restore signed viewer scope';END IF;
END $r1811_p1_rejoin$;
RESET ROLE;
RESET request.jwt.claim.sub;
RESET request.realtime.topic;

-- P2 remains mapped to a DIFFERENT active map B, and cannot read P1 topic
-- even by explicitly specifying the full old recipient topic.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
SET request.realtime.topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000001';
DO $r1811_p2_isolated$
DECLARE other jsonb;
BEGIN
 other:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000003');
 IF other IS NULL OR other->>'viewerId'<>
  '30000000-0000-4000-8000-000000000002' OR
  public.get_world_visibility_v2(
   '10000000-0000-4000-8000-000000000001') IS NOT NULL OR
  (SELECT count(*) FROM realtime.messages m
   WHERE m.payload->>'r1811_fixture'='recipient-only')<>0
 THEN RAISE EXCEPTION 'R18-11 P2 mapped sight/stream isolation broken';END IF;
END $r1811_p2_isolated$;
RESET ROLE;
RESET request.jwt.claim.sub;
RESET request.realtime.topic;

-- DM starts entitled to the DM-only hidden NPC and edit-preview RPC.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $r1811_dm_initial$
DECLARE f jsonb;
BEGIN
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f IS NULL OR f->>'scope'<>'dm' OR
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f->'visiblePieces') item
   WHERE item->>'id'='40000000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'R18-11 DM baseline does not contain hidden actor';END IF;
END $r1811_dm_initial$;
RESET ROLE;
RESET request.jwt.claim.sub;

-- Demote DM to player without disconnecting their old JWT/browser session:
-- DM-only fog bypass and hidden NPC roster must disappear from newly signed
-- frames, and the preview RPC must not remain callable.
UPDATE public.campaign_members SET role='player' WHERE
 campaign_id='20000000-0000-4000-8000-000000000001' AND
 user_id='30000000-0000-4000-8000-000000000003';
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $r1811_dm_demoted$
DECLARE f jsonb;
BEGIN
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f IS NULL OR f->>'scope'<>'viewer' OR f->>'enabled'<>'true' OR
  EXISTS(SELECT 1 FROM jsonb_array_elements(f->'visiblePieces') item
   WHERE item->>'id'='40000000-0000-4000-8000-000000000002') OR
  public.preview_world_visibility_v2(
   '10000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001') IS NOT NULL
 THEN RAISE EXCEPTION 'R18-11 downgraded DM retained edit sight or NPC: %',f;
 END IF;
END $r1811_dm_demoted$;
RESET ROLE;
RESET request.jwt.claim.sub;

-- Clean rollback of identity and topic fixture; the source-real migration
-- files remain unchanged, and no live database is involved.
ROLLBACK;
SELECT 'world-v2-b10-r18-11-revocation-auth-contract-passed' AS result;
