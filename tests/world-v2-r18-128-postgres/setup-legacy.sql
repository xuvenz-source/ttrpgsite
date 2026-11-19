-- R18-128 PostgreSQL 17 fabricated legacy clients, public RPC and broadcasts.
-- Depends on R125's synthetic setup.sql and R126 setup-scene.sql ONLY.
-- This is NOT a reconstruction of all 83 original private migrations.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.r128_private_sheet(
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 owner_id uuid NOT NULL,
 secret text NOT NULL,
 PRIMARY KEY(campaign_id,owner_id)
);
ALTER TABLE public.r128_private_sheet ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.r128_private_sheet FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.r128_private_sheet TO authenticated;
CREATE POLICY "R128 owner sheet read" ON public.r128_private_sheet
 FOR SELECT TO authenticated USING(owner_id=auth.uid());
INSERT INTO public.r128_private_sheet(campaign_id,owner_id,secret)
 VALUES('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000302','synthetic-secret');

-- A public SECURITY DEFINER RPC that bypasses table RLS but restricts by
-- auth.uid() and campaign; represents one legacy callable privileged route.
CREATE FUNCTION public.r128_legacy_sheet_rpc(p_campaign uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $s$
 SELECT secret FROM public.r128_private_sheet
 WHERE campaign_id=p_campaign AND owner_id=auth.uid() LIMIT 1
$s$;
REVOKE ALL ON FUNCTION public.r128_legacy_sheet_rpc(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.r128_legacy_sheet_rpc(uuid)
 TO authenticated;

CREATE FUNCTION public.r128_legacy_motion_rpc(p_map uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $m$
 SELECT EXISTS(
  SELECT 1 FROM public.battle_maps bm
  WHERE bm.id=p_map AND public.can_view_campaign_map(bm.campaign_id,p_map)
 )
$m$;
REVOKE ALL ON FUNCTION public.r128_legacy_motion_rpc(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.r128_legacy_motion_rpc(uuid)
 TO authenticated;

-- Negative scope demonstration: a newly exposed private-schema definer
-- is NOT blocked by revoking USAGE on public. An EXHAUSTIVE privilege audit
-- is mandatory before any claim of a complete server maintenance fence.
CREATE FUNCTION forge_world_v2.r128_private_schema_bypass_fixture()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $private$
 SELECT EXISTS(SELECT 1 FROM public.r128_private_sheet);
$private$;
REVOKE ALL ON FUNCTION forge_world_v2.r128_private_schema_bypass_fixture()
 FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA forge_world_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION forge_world_v2.r128_private_schema_bypass_fixture()
 TO authenticated;

-- Reproduce the observed old map-wide scene publisher behavior using
-- only fictional map IDs, the R126 mock Realtime send, and the old counter.
CREATE FUNCTION forge_world_v2.bump_scene_publication_v2(p_map uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $legacy$
DECLARE camp uuid;gen bigint;
BEGIN
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF camp IS NULL THEN RETURN NULL;END IF;
 INSERT INTO forge_world_v2.scene_publications(
  map_id,campaign_id,generation,changed_at)
 VALUES(p_map,camp,1,clock_timestamp())
 ON CONFLICT(map_id) DO UPDATE SET
  generation=forge_world_v2.scene_publications.generation+1,
  campaign_id=excluded.campaign_id,changed_at=clock_timestamp()
 RETURNING generation INTO gen;
 PERFORM realtime.send(
  jsonb_build_object('version',2,'mapId',p_map,'sceneGeneration',gen),
  'scene-revision-v2','forge-world-scene-v2:'||p_map::text,true);
 RETURN gen;
END $legacy$;
REVOKE ALL ON FUNCTION forge_world_v2.bump_scene_publication_v2(uuid)
 FROM PUBLIC,anon,authenticated;
COMMIT;
