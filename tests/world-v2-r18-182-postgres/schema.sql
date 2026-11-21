-- R182 fictitious PG17 only: dependency/guard model, NOT original private SQL.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth,public TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $uid$ SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $uid$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.campaigns(id uuid PRIMARY KEY,active_map_id uuid);
CREATE TABLE public.campaign_members(campaign_id uuid,user_id uuid,role text,PRIMARY KEY(campaign_id,user_id));
CREATE TABLE public.campaign_player_maps(campaign_id uuid,user_id uuid,map_id uuid,PRIMARY KEY(campaign_id,user_id));
CREATE TABLE public.battle_maps(id uuid PRIMARY KEY,campaign_id uuid);
CREATE TABLE public.map_tokens(id uuid PRIMARY KEY,campaign_id uuid,map_id uuid,owner_id uuid);
REVOKE ALL ON public.campaigns,public.campaign_members,public.campaign_player_maps,public.battle_maps,public.map_tokens
FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.is_campaign_dm(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $dm$
 SELECT EXISTS(SELECT 1 FROM public.campaign_members m WHERE
  m.campaign_id=p_campaign AND m.user_id=auth.uid() AND m.role='dm')
$dm$;
CREATE FUNCTION public.can_view_campaign_map(p_campaign uuid,p_map uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $view$
 SELECT EXISTS(SELECT 1 FROM public.battle_maps bm
  WHERE bm.campaign_id=p_campaign AND bm.id=p_map
   AND (public.is_campaign_dm(p_campaign) OR EXISTS(
    SELECT 1 FROM public.campaign_player_maps pm
    JOIN public.campaign_members cm
      ON cm.campaign_id=pm.campaign_id AND cm.user_id=pm.user_id
    WHERE pm.campaign_id=p_campaign AND pm.map_id=p_map
     AND pm.user_id=auth.uid() AND cm.role='player')))
$view$;
CREATE FUNCTION public.get_token_monitor_values(p_map uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $monitor$
 SELECT EXISTS(SELECT 1 FROM public.battle_maps bm
 JOIN public.campaigns c ON c.id=bm.campaign_id
 WHERE bm.id=p_map AND c.active_map_id=p_map
 AND EXISTS(SELECT 1 FROM public.campaign_members m
  WHERE m.campaign_id=c.id AND m.user_id=auth.uid()))
$monitor$;
CREATE FUNCTION public.post_token_reference(p_token uuid,p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $ref$
DECLARE v_token public.map_tokens%rowtype;
BEGIN
 SELECT * INTO v_token FROM public.map_tokens WHERE id=p_token;
 IF NOT FOUND THEN RETURN false;END IF;
 RETURN v_token.owner_id=auth.uid();
END
$ref$;
REVOKE ALL ON FUNCTION public.is_campaign_dm(uuid),
 public.can_view_campaign_map(uuid,uuid),public.get_token_monitor_values(uuid),
 public.post_token_reference(uuid,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_token_monitor_values(uuid),
 public.post_token_reference(uuid,text),public.can_view_campaign_map(uuid,uuid)
TO authenticated;
INSERT INTO public.campaigns VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000204');
INSERT INTO public.battle_maps VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000102');
INSERT INTO public.campaign_members VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','dm'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','player'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304','dm');
INSERT INTO public.campaign_player_maps VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000202');
INSERT INTO public.map_tokens VALUES
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000302');
COMMIT;
