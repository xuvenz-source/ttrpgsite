-- B10-R18-142 isolated fictional PG17 fixture ONLY.
-- Run AFTER R140 PG17 checks; never execute on hosted Supabase.
\set ON_ERROR_STOP on
BEGIN;
-- Restore P1 who was intentionally revoked in R140's local test.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES ('00000000-0000-4000-8000-000000000101',
         '00000000-0000-4000-8000-000000000303','player')
 ON CONFLICT DO NOTHING;
ALTER TABLE public.battle_maps
 ADD COLUMN name text,
 ADD COLUMN width integer,
 ADD COLUMN height integer,
 ADD COLUMN grid_size integer,
 ADD COLUMN storage_path text,
 ADD COLUMN source_width integer,
 ADD COLUMN source_height integer;
UPDATE public.battle_maps SET
 name='Published Test Map',width=1000,height=1000,grid_size=100,
 storage_path='secret/dm/unpublished-map.png',
 source_width=2000,source_height=2000;
-- Matches the original read-only campaign-membership helper's actor check.
CREATE FUNCTION public.is_campaign_member(c uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $r142_member$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.campaign_members m
  WHERE m.campaign_id=c AND m.user_id=auth.uid())
$r142_member$;
REVOKE ALL ON FUNCTION public.is_campaign_member(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE TABLE public.characters(
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 user_id uuid NOT NULL,
 name text NOT NULL,
 field_values jsonb NOT NULL,
 portrait_path text,
 token_path text,
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.now());
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.characters FROM PUBLIC,anon,authenticated;

CREATE TABLE public.campaign_handouts(
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 title text NOT NULL,
 body text NOT NULL,
 revealed boolean NOT NULL DEFAULT false,
 collected boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.now());
ALTER TABLE public.campaign_handouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_handouts FROM PUBLIC,anon,authenticated;

CREATE TABLE public.campaign_map_pins(
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 map_id uuid NOT NULL REFERENCES public.battle_maps(id),
 handout_id uuid NOT NULL REFERENCES public.campaign_handouts(id),
 visible boolean NOT NULL);
ALTER TABLE public.campaign_map_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_map_pins FROM PUBLIC,anon,authenticated;

ALTER TABLE public.campaign_tool_issues
 ADD COLUMN name text,
 ADD COLUMN kind text,
 ADD COLUMN icon text,
 ADD COLUMN config jsonb,
 ADD COLUMN state jsonb,
 ADD COLUMN revision bigint;

INSERT INTO public.characters(
 id,campaign_id,user_id,name,field_values,portrait_path,token_path
) VALUES
 ('00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000303',
  'P1 Secret Sheet','{"hp":7,"hidden":"P1-private"}'::jsonb,
  'secret/P1-image.png','secret/P1-token.png'),
 ('00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000302',
  'P2 Secret Sheet','{"hp":8,"hidden":"P2-private"}'::jsonb,
  'secret/P2-image.png','secret/P2-token.png'),
 ('00000000-0000-4000-8000-000000000503',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000304',
  'Outsider Secret Sheet','{"hp":9,"hidden":"outside"}'::jsonb,
  'secret/out-image.png','secret/out-token.png');

INSERT INTO public.campaign_handouts(
 id,campaign_id,title,body,revealed,collected
) VALUES
 ('00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000101',
  'Revealed','Public lore',true,false),
 ('00000000-0000-4000-8000-000000000602',
  '00000000-0000-4000-8000-000000000101',
  'DM Secret','Private DM note',false,false),
 ('00000000-0000-4000-8000-000000000603',
  '00000000-0000-4000-8000-000000000101',
  'Visible Pin','Pin lore',false,false),
 ('00000000-0000-4000-8000-000000000604',
  '00000000-0000-4000-8000-000000000101',
  'Hidden Pin','Secret pin lore',false,false),
 ('00000000-0000-4000-8000-000000000605',
  '00000000-0000-4000-8000-000000000101',
  'Other Map Pin','Other map private',false,false),
 ('00000000-0000-4000-8000-000000000606',
  '00000000-0000-4000-8000-000000000102',
  'Outsider Handout','Other campaign private',true,false);

INSERT INTO public.campaign_map_pins(
 id,campaign_id,map_id,handout_id,visible
) VALUES
 ('00000000-0000-4000-8000-000000000611',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000603',true),
 ('00000000-0000-4000-8000-000000000612',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000604',false),
 ('00000000-0000-4000-8000-000000000613',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000605',true);

INSERT INTO public.campaign_tool_issues(
 id,map_id,campaign_id,owner_id,party_shared,
 name,kind,icon,config,state,revision
) VALUES
 ('00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000303',false,
  'P1 Private Tool','item','book',
  '{"dmHint":"owner-secret"}'::jsonb,'{"hiddenState":"owner"}'::jsonb,1),
 ('00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000303',true,
  'Party Shared Tool','item','torch',
  '{"dmHint":"shared-private"}'::jsonb,
  '{"hiddenState":"shared-private"}'::jsonb,2),
 ('00000000-0000-4000-8000-000000000703',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000302',false,
  'P2 Private Tool','item','shield',
  '{"dmHint":"P2-private"}'::jsonb,'{"hiddenState":"P2-private"}'::jsonb,3),
 ('00000000-0000-4000-8000-000000000704',
  '00000000-0000-4000-8000-000000000203',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000304',true,
  'Outside Tool','item','scroll',
  '{"dmHint":"outside"}'::jsonb,'{"hiddenState":"outside"}'::jsonb,4),
 ('00000000-0000-4000-8000-000000000705',
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000303',true,
  'Different Map Shared Tool','item','map',
  '{"dmHint":"other-map"}'::jsonb,'{"hiddenState":"other-map"}'::jsonb,5);
COMMIT;
