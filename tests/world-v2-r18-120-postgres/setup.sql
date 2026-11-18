-- B10-R18-120 isolated PostgreSQL17 fixture, NOT live SQL / not original source.
-- Minimal schema models receipt-confirmed join_campaign membership behavior.
-- Running this test never connects to, alters or initializes Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
REVOKE ALL ON SCHEMA auth FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $id$
 SELECT NULLIF(
  pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
$id$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.campaigns(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,
 invite_code text NOT NULL UNIQUE
);
CREATE TABLE public.campaign_members(
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,role text NOT NULL CHECK (role IN ('dm','player')),
 PRIMARY KEY(campaign_id,user_id)
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaigns,public.campaign_members
 FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA public TO authenticated,anon;

-- This is a representative stub matching observed R119 first join,
-- duplicate role and generic invite semantics. Not the private original.
CREATE FUNCTION public.join_campaign(p_invite_code text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $join$
DECLARE
 actor uuid := auth.uid();
 target uuid;
BEGIN
 IF actor IS NULL THEN
  RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
 END IF;
 SELECT c.id INTO target FROM public.campaigns AS c
 WHERE c.invite_code=pg_catalog.lower(pg_catalog.btrim(p_invite_code))
 FOR UPDATE;
 IF target IS NULL THEN
  RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES(target,actor,'player')
 ON CONFLICT(campaign_id,user_id) DO NOTHING;
 RETURN target;
END
$join$;
REVOKE ALL ON FUNCTION public.join_campaign(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.join_campaign(text) TO authenticated;

INSERT INTO public.campaigns(id,owner_id,invite_code) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','a1b2c3d4e5f60708'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304','b1c2d3e4f5a60708');
INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','dm'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304','dm');
COMMIT;
