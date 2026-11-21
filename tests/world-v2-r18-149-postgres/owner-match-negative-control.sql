-- R149 adversarial NEGATIVE CONTROL only. NOT A DEPLOYABLE SQL CANDIDATE.
-- Follows fictional R120 setup, not original Supabase migrations.
BEGIN;
CREATE SCHEMA forge_security;
CREATE FUNCTION forge_security.synthetic_owner_match_dm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $b$
BEGIN
 IF NEW.role='dm' AND NOT EXISTS(
   SELECT 1 FROM public.campaigns c
   WHERE c.id=NEW.campaign_id AND c.owner_id=NEW.user_id
 ) THEN
   RAISE EXCEPTION 'R149 owner-match DM insert denied' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END
$b$;
REVOKE ALL ON FUNCTION forge_security.synthetic_owner_match_dm() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER synthetic_dm_owner_check
BEFORE INSERT ON public.campaign_members FOR EACH ROW
EXECUTE FUNCTION forge_security.synthetic_owner_match_dm();

-- This invented creator mirrors only observed structural markers: actor id,
-- campaigns.owner_id, role=dm, membership insert. It is not original body.
CREATE FUNCTION public.synthetic_create_campaign(p_campaign uuid,p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $b$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';END IF;
 INSERT INTO public.campaigns(id,owner_id,invite_code) VALUES(p_campaign,actor,p_code);
 INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES(p_campaign,actor,'dm');
 RETURN p_campaign;
END
$b$;
REVOKE ALL ON FUNCTION public.synthetic_create_campaign(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.synthetic_create_campaign(uuid,text) TO authenticated;
COMMIT;
