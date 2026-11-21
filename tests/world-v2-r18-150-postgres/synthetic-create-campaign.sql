-- R150 synthetic creator, NOT original private create_campaign source.
BEGIN;
CREATE FUNCTION public.synthetic_create_campaign(p_campaign uuid,p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';END IF;
 INSERT INTO public.campaigns(id,owner_id,invite_code) VALUES(p_campaign,actor,p_code);
 INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES(p_campaign,actor,'dm');
 RETURN p_campaign;
END
$body$;
REVOKE ALL ON FUNCTION public.synthetic_create_campaign(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.synthetic_create_campaign(uuid,text) TO authenticated;
COMMIT;
