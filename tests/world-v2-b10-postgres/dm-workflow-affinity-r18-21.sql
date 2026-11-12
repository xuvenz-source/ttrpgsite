-- R18-21 DM ROUTING, MAP UPLOAD/CLONE BY INSERT, AND IDENTITY COMPATIBILITY.
-- SOURCE-REAL installed triggers and read-only-captured public party-map RPC.
-- ONLY disposable PG17 run.sh, BEGIN/ROLLBACK. Never apply to Supabase.
BEGIN;
ALTER TABLE forge_visibility.map_rules
 ADD COLUMN fog_enforced boolean NOT NULL DEFAULT false;
ALTER TABLE public.map_tokens ADD COLUMN npc_template_id uuid;
ALTER TABLE public.campaign_tool_issues
 ADD COLUMN template_id uuid, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE public.npc_templates(id uuid PRIMARY KEY,campaign_id uuid NOT NULL);
CREATE TABLE public.campaign_tool_templates(id uuid PRIMARY KEY,campaign_id uuid NOT NULL);

-- Source-real LIVE token/tool validators and the unchanged latest
-- trajectory-aware collision trigger bodies from R18-19.
\i /tmp/world_v2_b10_r18_18_legacy_triggers.sql
\i /tmp/world_v2_b10_r18_19_latest_trajectory.sql
-- Current deployed trigger hooks are source-real and require the V2
-- transaction checkpoint helper; exact pg_get_functiondef is pinned.
\i tests/world-v2-b10-postgres/live-v2-checkpoint-r18-21.sql
\i tests/world-v2-b10-postgres/live-validators-r18-20.sql
CREATE TRIGGER tokens_validate
 BEFORE INSERT OR UPDATE ON public.map_tokens
 FOR EACH ROW EXECUTE FUNCTION public.validate_token_map();
CREATE TRIGGER campaign_tool_validate_issue
 BEFORE INSERT OR UPDATE ON public.campaign_tool_issues
 FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_tool_write();
\i supabase/candidates/world_v2_r18_19_cross_map_guard.sql
\i supabase/candidates/world_v2_r18_20_campaign_affinity.sql
\i tests/world-v2-b10-postgres/live-party-route-r18-21.sql

CREATE OR REPLACE FUNCTION public.r21_expect_error(
 p_sql text,p_expected text,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r21$
DECLARE err text;affected integer;
BEGIN
 BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected=0 THEN err:='zero rows updated';END IF;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
 END;
 PERFORM public.b08_assert(
  position(lower(p_expected) IN lower(coalesce(err,'')))>0,
  'R21 '||p_label);
END $r21$;

DO $r21$
DECLARE
 first_campaign uuid:='00000000-0000-4000-8000-000000000001';
 second_campaign uuid:='00000000-0000-4000-8000-000000000002';
 first_map uuid:='00000000-0000-4000-8000-000000000021';
 uploaded_map uuid:='00000000-0000-4000-8000-000000000022';
 copied_map uuid:='00000000-0000-4000-8000-000000000024';
 foreign_map uuid:='00000000-0000-4000-8000-000000000023';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 p1 uuid:='00000000-0000-4000-8000-000000000011';
 p2 uuid:='00000000-0000-4000-8000-000000000012';
 token uuid:='00000000-0000-4000-8000-000000000101';
 tool uuid:='00000000-0000-4000-8000-000000000201';
BEGIN
 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 INSERT INTO public.campaigns(id,active_map_id)
 VALUES(second_campaign,foreign_map);
 INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES(second_campaign,dm,'dm');

 -- Actual UI uploads new battle_maps using INSERT, NOT UPDATE campaign_id.
 INSERT INTO public.battle_maps(id,campaign_id,width,height,grid_size)
 VALUES(uploaded_map,first_campaign,160,160,10),
       (foreign_map,second_campaign,160,160,10);
 PERFORM public.b08_assert(
  (SELECT campaign_id=first_campaign FROM public.battle_maps WHERE id=uploaded_map),
  'W01 DM map upload via INSERT stays supported');
 -- A future map-copy workflow should similarly create a NEW ID and row,
 -- never repurpose an existing map's campaign_id.
 INSERT INTO public.battle_maps(id,campaign_id,width,height,grid_size)
 SELECT copied_map,campaign_id,width,height,grid_size
 FROM public.battle_maps WHERE id=uploaded_map;
 PERFORM public.b08_assert(
  (SELECT campaign_id=first_campaign AND width=160
   FROM public.battle_maps WHERE id=copied_map),
  'W02 copy-by-INSERT creates distinct map without reparenting original');
 UPDATE public.battle_maps SET width=200,height=180,grid_size=10
 WHERE id=uploaded_map;
 PERFORM public.b08_assert(
  (SELECT width=200 AND height=180 AND grid_size=10
   FROM public.battle_maps WHERE id=uploaded_map),
  'W03 DM map calibration UPDATE unaffected by campaign identity guard');

 -- The actual production move_entire_party_to_map SECURITY DEFINER RPC
 -- switches active_map_id and clears campaign-specific player overrides.
 INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id)
 VALUES(first_campaign,p1,first_map),(first_campaign,p2,first_map);
 PERFORM public.move_entire_party_to_map(first_campaign,uploaded_map);
 PERFORM public.b08_assert(
  (SELECT active_map_id=uploaded_map FROM public.campaigns
   WHERE id=first_campaign),
  'W04 source-real DM party routing selects uploaded same-campaign map');
 PERFORM public.b08_assert(
  (SELECT count(*)=0 FROM public.campaign_player_maps
   WHERE campaign_id=first_campaign),
  'W05 source-real party routing clears old map overrides');
 PERFORM public.b08_assert(
  (SELECT campaign_id=first_campaign AND map_id=first_map
   FROM public.map_tokens WHERE id=token) AND
  (SELECT campaign_id=first_campaign AND map_id=first_map
   FROM public.campaign_tool_issues WHERE id=tool),
  'W06 party routing does NOT rewrite piece campaign_id or map_id');

 -- Map published for players / ordinary DM navigation remains existing
 -- campaign-state updates, not identity mutations of the battle map.
 PERFORM public.move_entire_party_to_map(first_campaign,copied_map);
 PERFORM public.b08_assert(
  (SELECT active_map_id=copied_map FROM public.campaigns
   WHERE id=first_campaign),
  'W07 new same-campaign map copy is a valid party-routing destination');
 PERFORM public.r21_expect_error(
  format('SELECT public.move_entire_party_to_map(%L,%L)',
    first_campaign,foreign_map),
  'Choose a map in this campaign',
  'W08 DM cannot route party to foreign-campaign map');
 PERFORM public.b08_assert(
  (SELECT active_map_id=copied_map FROM public.campaigns
   WHERE id=first_campaign),
  'W09 rejected foreign-map routing preserves original active map');

 PERFORM set_config('request.jwt.claim.sub',p1::text,true);
 PERFORM public.r21_expect_error(
  format('SELECT public.move_entire_party_to_map(%L,%L)',
    first_campaign,uploaded_map),
  'Only the campaign DM can move the party',
  'W10 ordinary player cannot call DM party routing');
 PERFORM public.b08_assert(
  (SELECT active_map_id=copied_map FROM public.campaigns
   WHERE id=first_campaign),
  'W11 rejected player routing leaves selected party map intact');

 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 UPDATE public.map_tokens SET map_id=uploaded_map WHERE id=token;
 PERFORM public.b08_assert(
  (SELECT campaign_id=first_campaign AND map_id=uploaded_map
   FROM public.map_tokens WHERE id=token),
  'W12 normal same-campaign token assignment still permitted for DM');

 -- Guard covers unrelated identity changes even when the DM is present
 -- on both campaign rosters.
 PERFORM public.r21_expect_error(
  format('UPDATE public.battle_maps SET campaign_id=%L WHERE id=%L',
   second_campaign,uploaded_map),
  'Campaign identity cannot change',
  'W13 real DM cannot reparent uploaded map');
 PERFORM public.r21_expect_error(
  format('UPDATE public.map_tokens SET campaign_id=%L,map_id=%L WHERE id=%L',
   second_campaign,foreign_map,token),
  'Campaign identity cannot change',
  'W14 real DM cannot reparent token with coherent map change');
 PERFORM public.b08_assert(
  (SELECT campaign_id=first_campaign FROM public.battle_maps
   WHERE id=uploaded_map) AND
  (SELECT campaign_id=first_campaign AND map_id=uploaded_map
   FROM public.map_tokens WHERE id=token),
  'W15 rejected reparent actions are atomic and preserve ownership scope');

 -- A map may be transferred to a different campaign by explicitly
 -- creating a new target record; identity of the source map is stable.
 INSERT INTO public.battle_maps(id,campaign_id,width,height,grid_size)
 SELECT '00000000-0000-4000-8000-000000000025'::uuid,
   second_campaign,width,height,grid_size FROM public.battle_maps
 WHERE id=copied_map;
 PERFORM public.b08_assert(
  (SELECT campaign_id=second_campaign FROM public.battle_maps WHERE
   id='00000000-0000-4000-8000-000000000025'::uuid) AND
  (SELECT campaign_id=first_campaign FROM public.battle_maps WHERE id=copied_map),
  'W16 cross-campaign IMPORT-as-NEW-map pattern is compatible');
 PERFORM public.b08_assert(
  NOT has_schema_privilege('authenticated','forge_visibility','USAGE') AND
  NOT has_function_privilege('authenticated',
   'forge_visibility.guard_campaign_affinity_r18_20()','EXECUTE'),
  'W17 private identity guard remains inaccessible directly to players');
 RAISE NOTICE 'R18-21: 17 source-real DM workflow compatibility assertions PASSED';
END $r21$;
ROLLBACK;
