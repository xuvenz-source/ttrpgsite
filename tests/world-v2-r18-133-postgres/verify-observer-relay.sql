-- R133 disposable PG17. R125/R126/R132 candidates loaded before this.
\set ON_ERROR_STOP on

-- A legitimate recipient must first obtain an R125 opaque scene epoch.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('r133.p2scene',
 public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
SELECT pg_catalog.set_config('r133.p2observer',
 replace(pg_catalog.current_setting('r133.p2scene'),
 'forge-world-scene-v3:','forge-world-observer-v3:'),false);

-- Server-origin notice impersonates a verified signed P1 actor.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',false);
DO $assert$
DECLARE ok boolean;
BEGIN
 ok:=forge_observer_v3.dispatch_authorized_observer_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303',
  'motion',
  jsonb_build_object('mapId','00000000-0000-4000-8000-000000000201',
    'actor','00000000-0000-4000-8000-000000000302','seq',1,
    'action','hide'));
 IF ok IS DISTINCT FROM false OR
  (SELECT count(*) FROM realtime.messages)<>0 THEN
  RAISE EXCEPTION 'R133 initial fenced mode emitted to observer';END IF;
END $assert$;

-- Only this fictional trusted PG17 actor enables server mode.
UPDATE forge_scene_drain.scene_publication_gate
 SET mode='v3-only' WHERE singleton=true;
DO $assert$
DECLARE result boolean;
BEGIN
 result:=forge_observer_v3.dispatch_authorized_observer_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303','motion',
  jsonb_build_object('mapId','00000000-0000-4000-8000-000000000201',
    'actor','00000000-0000-4000-8000-000000000302','seq',2,
    'action','hide'));
 IF result IS DISTINCT FROM true OR
  (SELECT count(*) FROM realtime.messages)<>1
 THEN RAISE EXCEPTION 'R133 V3 observer fanout not emitted';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages
  WHERE topic IS DISTINCT FROM pg_catalog.current_setting('r133.p2observer')
    OR topic LIKE 'forge-observer:%'
    OR topic LIKE 'forge-world-v2:%'
    OR private IS DISTINCT FROM true)
 THEN RAISE EXCEPTION 'R133 legacy or unscoped observer notice';END IF;
END $assert$;

-- P2 sees their private observer channel under a fresh RLS evaluation.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('request.jwt.claim.scene_topic',
 pg_catalog.current_setting('r133.p2observer'),true);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM realtime.messages
  WHERE topic=realtime.topic())<>1
 THEN RAISE EXCEPTION 'R133 P2 receiver RLS denied legitimate topic';END IF;
END $assert$;
COMMIT;

-- P1 actor cannot join P2's recipient topic. Nor can another campaign's DM.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('request.jwt.claim.scene_topic',
 pg_catalog.current_setting('r133.p2observer'),true);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM realtime.messages
  WHERE topic=realtime.topic())<>0
 THEN RAISE EXCEPTION 'R133 P1 impersonated P2 observer topic';END IF;
END $assert$;
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000304',true);
SELECT pg_catalog.set_config('request.jwt.claim.scene_topic',
 pg_catalog.current_setting('r133.p2observer'),true);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM realtime.messages
  WHERE topic=realtime.topic())<>0
 THEN RAISE EXCEPTION 'R133 cross-campaign DM observed another viewer';END IF;
END $assert$;
COMMIT;

-- Untrusted payloads, actor mismatch, oversized/unknown events, wrong
-- recipient-viewer, wrong map, outsider recipient and null actor fail closed.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',false);
DO $assert$
DECLARE
 mapid uuid:='00000000-0000-4000-8000-000000000201';
 p2 uuid:='00000000-0000-4000-8000-000000000303';
 payload jsonb:='{"mapId":"00000000-0000-4000-8000-000000000201","actor":"00000000-0000-4000-8000-000000000302"}';
BEGIN
 IF forge_observer_v3.dispatch_authorized_observer_v3(mapid,p2,'delete-map',payload)
  IS DISTINCT FROM false OR
  forge_observer_v3.dispatch_authorized_observer_v3(mapid,p2,'motion',
   jsonb_set(payload,'{actor}',
    '"00000000-0000-4000-8000-000000000304"')) IS DISTINCT FROM false OR
  forge_observer_v3.dispatch_authorized_observer_v3(mapid,p2,'motion',
   '{"mapId":"00000000-0000-4000-8000-000000000202","actor":"00000000-0000-4000-8000-000000000302"}')
    IS DISTINCT FROM false OR
  forge_observer_v3.dispatch_authorized_observer_v3(mapid,p2,'world-vision-v2',
    payload) IS DISTINCT FROM false OR
  forge_observer_v3.dispatch_authorized_observer_v3(mapid,
    '00000000-0000-4000-8000-000000000304','motion',payload)
    IS DISTINCT FROM false OR
  forge_observer_v3.dispatch_authorized_observer_v3(mapid,p2,'motion',
    jsonb_build_object('mapId',mapid,'actor',auth.uid(),
      'filler',repeat('a',9000))) IS DISTINCT FROM false OR
  (SELECT count(*) FROM realtime.messages)<>1
 THEN RAISE EXCEPTION 'R133 invalid/foreign payload bypassed relay';END IF;
END $assert$;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',false);
DO $assert$
BEGIN
 IF forge_observer_v3.dispatch_authorized_observer_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303','motion',
  '{"mapId":"00000000-0000-4000-8000-000000000201"}')
  IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R133 null actor reached server fanout';END IF;
END $assert$;

-- Member DELETE makes the epoch expire. Even an old already-open
-- recipient topic receives NO NEW message from this relay.
DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000303';
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',false);
DO $assert$
BEGIN
 IF forge_observer_v3.dispatch_authorized_observer_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303','motion',
  '{"mapId":"00000000-0000-4000-8000-000000000201",
    "actor":"00000000-0000-4000-8000-000000000302"}')
  IS DISTINCT FROM false OR
  (SELECT count(*) FROM realtime.messages)<>1
 THEN RAISE EXCEPTION 'R133 removed P2 received new V3 notice';END IF;
END $assert$;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('request.jwt.claim.scene_topic',
 pg_catalog.current_setting('r133.p2observer'),true);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM realtime.messages
  WHERE topic=realtime.topic())<>0
 THEN RAISE EXCEPTION 'R133 revoked P2 still passes fresh observer RLS';END IF;
END $assert$;
COMMIT;

-- Reinstatement must use a brand-new epoch; the old topic never reactivates.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000303','player');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('r133.p2newscene',
 public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
DO $assert$
BEGIN
 IF pg_catalog.current_setting('r133.p2scene')=
  pg_catalog.current_setting('r133.p2newscene')
 THEN RAISE EXCEPTION 'R133 old observer epoch reused after reinstatement';END IF;
END $assert$;

-- Actor and recipient remain checked on current map assignment.
INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id)
 VALUES('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000303',
 '00000000-0000-4000-8000-000000000202');
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',false);
DO $assert$
BEGIN
 IF forge_observer_v3.dispatch_authorized_observer_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303','motion',
  '{"mapId":"00000000-0000-4000-8000-000000000201",
    "actor":"00000000-0000-4000-8000-000000000302"}')
  IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R133 off-map P2 got legacy map notice';END IF;
END $assert$;

-- Return to default fenced state; no new dispatch even with membership.
UPDATE forge_scene_drain.scene_publication_gate
 SET mode='fenced' WHERE singleton=true;
DO $assert$
BEGIN
 IF forge_observer_v3.dispatch_authorized_observer_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000301','motion',
  '{"mapId":"00000000-0000-4000-8000-000000000201",
    "actor":"00000000-0000-4000-8000-000000000302"}')
  IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R133 maintenance fence did not block observer';END IF;
END $assert$;

-- Deliberately demonstrate the unguarded old sender is STILL callable in
-- the mock. This is an unresolved release blocker, NOT a safe fallback.
DO $assert$
BEGIN
 PERFORM realtime.send(
  '{"fixture":true}'::jsonb,'old-legacy-bypass',
  'forge-observer:00000000-0000-4000-8000-000000000201:00000000-0000-4000-8000-000000000303',true);
 IF (SELECT count(*) FROM realtime.messages
  WHERE event='old-legacy-bypass' AND
    topic LIKE 'forge-observer:%')<>1
 THEN RAISE EXCEPTION 'R133 legacy unguarded bypass proof absent';END IF;
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton)
  IS DISTINCT FROM 'fenced'
 THEN RAISE EXCEPTION 'R133 direct sender inadvertently changed gate';END IF;
END $assert$;
\echo 'R133 synthetic PG17 PASS: recipient-scoped observer relay; old SQL call sites still unmodified.'
