-- B10-R18-20: LIVE-SOURCE WRITE VALIDATORS + CAMPAIGN AFFINITY.
-- Local disposable PG17 ONLY. SQL candidate and all fixture writes ROLLBACK.
BEGIN;
-- Add only the missing columns required by exact live trigger definitions.
ALTER TABLE public.map_tokens ADD COLUMN npc_template_id uuid;
ALTER TABLE public.campaign_tool_issues
 ADD COLUMN template_id uuid, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE public.npc_templates(id uuid PRIMARY KEY,campaign_id uuid NOT NULL);
CREATE TABLE public.campaign_tool_templates(id uuid PRIMARY KEY,campaign_id uuid NOT NULL);

-- Install all originally shipped latest collision trigger bodies, including
-- original trigger DDL, then the R18-19 staged collision/map candidate.
\i /tmp/world_v2_b10_r18_18_legacy_triggers.sql
\i /tmp/world_v2_b10_r18_19_latest_trajectory.sql
\i supabase/candidates/world_v2_r18_19_cross_map_guard.sql
-- This file contains actual pg_get_functiondef snapshots of LIVE validators.
\i tests/world-v2-b10-postgres/live-source-r18-20.sql
CREATE TRIGGER tokens_validate
 BEFORE INSERT OR UPDATE ON public.map_tokens FOR EACH ROW
 EXECUTE FUNCTION public.validate_token_map();
CREATE TRIGGER campaign_tool_validate_issue
 BEFORE INSERT OR UPDATE ON public.campaign_tool_issues FOR EACH ROW
 EXECUTE FUNCTION public.validate_campaign_tool_write();

CREATE OR REPLACE FUNCTION public.r20_assert_error(
 p_statement text,p_error text,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r20$
DECLARE reason text;affected integer;
BEGIN
 BEGIN
  EXECUTE p_statement;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected=0 THEN reason:='zero rows updated';END IF;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;
 END;
 PERFORM public.b08_assert(
  position(lower(p_error) IN lower(coalesce(reason,'')))>0,
  'R20 '||p_label);
END $r20$;

DO $r20$
DECLARE
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 other_campaign uuid:='00000000-0000-4000-8000-000000000002';
 src_map uuid:='00000000-0000-4000-8000-000000000021';
 other_map uuid:='00000000-0000-4000-8000-000000000022';
 foreign_map uuid:='00000000-0000-4000-8000-000000000023';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 player uuid:='00000000-0000-4000-8000-000000000011';
 token uuid:='00000000-0000-4000-8000-000000000101';
 tool uuid:='00000000-0000-4000-8000-000000000201';
 reason text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('forge.collision_override','off',true);
 INSERT INTO public.battle_maps(id,campaign_id,width,height,grid_size)
 VALUES(other_map,campaign,160,160,10),
       (foreign_map,other_campaign,160,160,10);
 INSERT INTO public.campaign_members VALUES(other_campaign,dm,'dm');
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM pg_trigger WHERE tgname IN
   ('tokens_validate','campaign_tool_validate_issue') AND tgenabled='O'),
  'I01 both exact LIVE standard identity validators installed in fixture');

 -- A direct campaign_id-only edit is rejected by the LIVE token validator
 -- even though the collision trigger does not fire on that column.
 PERFORM public.r20_assert_error(
  format('UPDATE public.map_tokens SET campaign_id=%L WHERE id=%L',
    other_campaign,token),
  'Token and map must belong to same campaign',
  'I02 token campaign_id-only mismatch rejected by real validator');
 PERFORM public.b08_assert(
  (SELECT campaign_id=campaign FROM public.map_tokens WHERE id=token),
  'I03 denied token identity update leaves original campaign unchanged');

 -- An issued tool cannot change campaign_id even when the DM belongs
 -- to BOTH campaigns: actual live validator rejects ALL such changes.
 PERFORM public.r20_assert_error(
  format('UPDATE public.campaign_tool_issues SET campaign_id=%L WHERE id=%L',
    other_campaign,tool),'Tool identity cannot change',
  'I04 tool campaign_id-only change rejected by real validator');
 PERFORM public.r20_assert_error(
  format('UPDATE public.campaign_tool_issues SET campaign_id=%L,map_id=%L WHERE id=%L',
    other_campaign,foreign_map,tool),'Tool identity cannot change',
  'I05 tool same-statement campaign+map reparenting also rejected');
 PERFORM public.b08_assert(
  (SELECT campaign_id=campaign AND map_id=src_map
   FROM public.campaign_tool_issues WHERE id=tool),
  'I06 both denied tool updates left original identity unchanged');

 -- Token BOTH campaign+map changes can still pass current validators when
 -- a DM has BOTH campaign roles. This is the true unguarded identity case,
 -- not a generic token/map mismatch.
 UPDATE public.map_tokens
 SET campaign_id=other_campaign,map_id=foreign_map WHERE id=token;
 PERFORM public.b08_assert(
  (SELECT campaign_id=other_campaign AND map_id=foreign_map
   FROM public.map_tokens WHERE id=token),
  'I07 unpatched dual-campaign DM can reparent a token coherently (test fixture)');
 UPDATE public.map_tokens
 SET campaign_id=campaign,map_id=src_map WHERE id=token;

 -- A DM on both campaigns can reparent the MAP row itself, even if
 -- live token/tool identity validators exist, because they do not fire
 -- on battle_maps UPDATE. This is an important referential integrity gap.
 UPDATE public.battle_maps SET campaign_id=other_campaign WHERE id=src_map;
 PERFORM public.b08_assert(
  (SELECT campaign_id=other_campaign FROM public.battle_maps WHERE id=src_map)
  AND (SELECT campaign_id=campaign FROM public.map_tokens WHERE id=token),
  'I08 existing map campaign reparent makes the map/token pair inconsistent');
 UPDATE public.battle_maps SET campaign_id=campaign WHERE id=src_map;

 -- The existing live validator catches tool map/campaign mismatches,
 -- including a map in another campaign (distinct from 10% wall changes).
 PERFORM public.r20_assert_error(
  format('UPDATE public.campaign_tool_issues SET map_id=%L WHERE id=%L',
    foreign_map,tool),'Tool map must belong to campaign',
  'I09 real tool validator forbids cross-campaign map placement');
 PERFORM public.r20_assert_error(
  format('UPDATE public.map_tokens SET map_id=%L WHERE id=%L',
    foreign_map,token),'Token destination map outside campaign',
  'I10 staged R18-19 token guard rejects map/campaign mismatch first');

 -- Introduce the R18-20 NONAPPLIED affinity guard, and prove it preserves
 -- those existing validations and forbids coherent reparenting.
 RAISE NOTICE 'R18-20: 10 unpatched/full-validator baseline assertions PASSED';
END $r20$;
\i supabase/candidates/world_v2_r18_20_campaign_affinity.sql

DO $r20_candidate$
DECLARE
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 other_campaign uuid:='00000000-0000-4000-8000-000000000002';
 src_map uuid:='00000000-0000-4000-8000-000000000021';
 other_map uuid:='00000000-0000-4000-8000-000000000022';
 foreign_map uuid:='00000000-0000-4000-8000-000000000023';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 player uuid:='00000000-0000-4000-8000-000000000011';
 token uuid:='00000000-0000-4000-8000-000000000101';
 tool uuid:='00000000-0000-4000-8000-000000000201';
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM pg_trigger WHERE tgname IN
   ('forge_map_campaign_affinity_r18_20','forge_token_campaign_affinity_r18_20')
   AND tgenabled='O'),
  'I11 campaign identity candidate installs exactly two private guards');
 PERFORM public.r20_assert_error(
  format('UPDATE public.map_tokens SET campaign_id=%L,map_id=%L WHERE id=%L',
   other_campaign,foreign_map,token),
  'Campaign identity cannot change',
  'I12 DM in both campaigns cannot reparent token+map after guard');
 PERFORM public.r20_assert_error(
  format('UPDATE public.battle_maps SET campaign_id=%L WHERE id=%L',
   other_campaign,src_map),
  'Campaign identity cannot change',
  'I13 DM in both campaigns cannot reparent map holding pieces');
 PERFORM public.b08_assert(
  (SELECT campaign_id=campaign FROM public.map_tokens WHERE id=token) AND
  (SELECT campaign_id=campaign FROM public.battle_maps WHERE id=src_map),
  'I14 rejected identity changes leave rows unmodified');
 PERFORM set_config('request.jwt.claim.sub',player::text,true);
 PERFORM public.r20_assert_error(
  format('UPDATE public.map_tokens SET campaign_id=%L,map_id=%L WHERE id=%L',
   other_campaign,foreign_map,token),
  'Campaign identity cannot change',
  'I15 player cannot reparent token even to a map in another campaign');
 PERFORM public.r20_assert_error(
  format('UPDATE public.battle_maps SET campaign_id=%L WHERE id=%L',
   other_campaign,src_map),
  'Campaign identity cannot change',
  'I16 player cannot reparent a campaign map');

 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 UPDATE public.map_tokens SET map_id=other_map WHERE id=token;
 PERFORM public.b08_assert(
  (SELECT campaign_id=campaign AND map_id=other_map
   FROM public.map_tokens WHERE id=token),
  'I17 same-campaign DM map transfer remains permitted');
 UPDATE public.map_tokens SET map_id=src_map WHERE id=token;
 UPDATE public.battle_maps SET width=200 WHERE id=src_map;
 PERFORM public.b08_assert(
  (SELECT campaign_id=campaign AND width=200 FROM public.battle_maps
   WHERE id=src_map),
  'I18 changing ordinary map settings is unaffected by affinity trigger');
 PERFORM public.b08_assert(
  NOT has_function_privilege('authenticated',
   'forge_visibility.guard_campaign_affinity_r18_20()','EXECUTE')
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE'),
  'I19 private affinity function remains inaccessible as a direct player RPC');
 PERFORM public.b08_assert(
  (SELECT campaign_id=campaign FROM public.campaign_tool_issues WHERE id=tool),
  'I20 old tool immutability validator remains independent, unchanged');
 -- We deliberately do not invoke a service-role GUC bypass using a forged
 -- request claim: actual Supabase Auth/service tests require live identities.
 RAISE NOTICE 'R18-20: 10 new affinity candidate assertions PASSED; rollback follows';
END $r20_candidate$;
ROLLBACK;
