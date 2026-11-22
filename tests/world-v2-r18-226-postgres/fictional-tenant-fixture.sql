-- R226: ENTIRELY FICTIONAL PostgreSQL 17 database.
-- Nothing is sourced from private historical SQL or real Supabase records.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('r226.actor',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;

CREATE TABLE public.campaigns (
 id uuid PRIMARY KEY,
 active_map_id uuid
);
CREATE TABLE public.campaign_members (
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 user_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN('dm','player')),
 PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE public.battle_maps (
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 UNIQUE(campaign_id,id)
);
ALTER TABLE public.campaigns ADD CONSTRAINT synthetic_active_map_single_id
 FOREIGN KEY(active_map_id) REFERENCES public.battle_maps(id);
CREATE TABLE public.characters (
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 user_id uuid NOT NULL,
 token_path text NOT NULL
);
CREATE TABLE public.map_tokens (
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 map_id uuid NOT NULL REFERENCES public.battle_maps(id) ON DELETE CASCADE,
 character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
 owner_id uuid,
 image_path text NOT NULL,
 visible boolean NOT NULL DEFAULT true
);
-- Synthetic helper intentionally models a plausible current-campaign route,
-- not a direct paste of any original privileged function body.
CREATE FUNCTION public.can_view_campaign_map(p_campaign uuid,p_map uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
 AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.campaign_members member
   JOIN public.campaigns c ON c.id=member.campaign_id
   WHERE member.user_id=auth.uid() AND member.campaign_id=p_campaign
    AND (member.role='dm' OR c.active_map_id=p_map)
 ); $$;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_tokens ENABLE ROW LEVEL SECURITY;

-- All permissions on fixture tables are deliberately bounded to this
-- disposable database. Real existing policies are not installed or copied.
GRANT SELECT ON public.characters,public.battle_maps,public.campaign_members
 TO authenticated;
GRANT INSERT ON public.map_tokens TO authenticated;
CREATE POLICY synthetic_owned_character ON public.characters
 FOR SELECT TO authenticated USING(user_id=auth.uid());

-- Negative control: fictional policy has the same structural error type
-- as live catalog metadata, but is NOT the full real policy definition.
CREATE POLICY synthetic_vulnerable_player_insert ON public.map_tokens
 FOR INSERT TO authenticated WITH CHECK (
  owner_id=auth.uid() AND character_id IS NOT NULL
  AND public.can_view_campaign_map(campaign_id,map_id)
  AND EXISTS (
   SELECT 1 FROM public.characters ch
   WHERE ch.id=map_tokens.character_id
     AND ch.user_id=auth.uid()
     AND ch.campaign_id=ch.campaign_id  -- intentionally tautological
     AND ch.token_path=map_tokens.image_path
  )
 );

CREATE POLICY synthetic_dm_insert ON public.map_tokens
 FOR INSERT TO authenticated WITH CHECK (
  EXISTS(SELECT 1 FROM public.campaign_members cm WHERE
   cm.campaign_id=map_tokens.campaign_id
    AND cm.user_id=auth.uid() AND cm.role='dm')
 );

-- Completely made-up IDs and file paths.
INSERT INTO public.campaigns (id)
 VALUES
 ('00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000102');
INSERT INTO public.battle_maps(id,campaign_id) VALUES
 ('00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000102');
UPDATE public.campaigns SET active_map_id =
  CASE WHEN id='00000000-0000-4000-8000-000000000101'::uuid
   THEN '00000000-0000-4000-8000-000000000201'::uuid
   ELSE '00000000-0000-4000-8000-000000000202'::uuid END;
INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000301','player'),
 ('00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000301','player'),
 ('00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000302','dm');
INSERT INTO public.characters(id,campaign_id,user_id,token_path) VALUES
 ('00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000301','invented/player-a.webp'),
 ('00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000301','invented/player-b.webp');
COMMIT;
