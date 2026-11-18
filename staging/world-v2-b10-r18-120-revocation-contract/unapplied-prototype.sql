-- B10-R18-120 SCRATCH-ONLY SECURITY PROTOTYPE. NOT A MIGRATION.
-- NO original or QA Supabase SQL has been installed or approved.
-- Execute exclusively in isolated GitHub Actions postgres:17 synthetic fixture.
-- Live source join_campaign is private; this prototype is not a patch to it.
--
-- Proposed policy, pending explicit product and independent security review:
--  1. Deleting membership records a durable server-side revocation.
--  2. Any new membership INSERT, including privileged legacy joins, is denied
--     while the revocation remains.
--  3. Voluntary player leave clears its own tombstone in the same transaction.
--  4. Only a current DM in that same campaign can explicitly reinstate a player.
--  5. All paths lock the same campaign row; no JWT metadata decides roles.
--  6. Authenticated callers have NO direct access to tombstones.

BEGIN;

CREATE SCHEMA forge_security;
REVOKE ALL ON SCHEMA forge_security FROM PUBLIC, anon, authenticated;
CREATE TABLE forge_security.campaign_member_revocations (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (campaign_id,user_id)
);
ALTER TABLE forge_security.campaign_member_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_security.campaign_member_revocations FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_security.stamp_campaign_member_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
BEGIN
  -- Pairs with the insert trigger; a direct administrator DELETE also
  -- creates a tombstone. Existing client/service-row deletions still require
  -- an independent audit and reviewed transition plan before any deployment.
  PERFORM 1 FROM public.campaigns AS c
   WHERE c.id=OLD.campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign missing' USING ERRCODE='42501';
  END IF;

  INSERT INTO forge_security.campaign_member_revocations(campaign_id,user_id,removed_at)
    VALUES(OLD.campaign_id,OLD.user_id,pg_catalog.now())
  ON CONFLICT (campaign_id,user_id)
    DO UPDATE SET removed_at=EXCLUDED.removed_at;
  RETURN OLD;
END
$body$;

CREATE FUNCTION forge_security.reject_revoked_member_insertion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
BEGIN
  PERFORM 1 FROM public.campaigns AS c
    WHERE c.id=NEW.campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign missing' USING ERRCODE='42501';
  END IF;

  IF EXISTS(
    SELECT 1 FROM forge_security.campaign_member_revocations AS r
    WHERE r.campaign_id=NEW.campaign_id AND r.user_id=NEW.user_id
  ) THEN
    RAISE EXCEPTION 'DM reinstatement required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$body$;

REVOKE ALL ON FUNCTION forge_security.stamp_campaign_member_deletion() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION forge_security.reject_revoked_member_insertion() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER v2_campaign_member_delete_tombstone
BEFORE DELETE ON public.campaign_members
FOR EACH ROW EXECUTE FUNCTION forge_security.stamp_campaign_member_deletion();

CREATE TRIGGER v2_campaign_member_insert_revocation_gate
BEFORE INSERT ON public.campaign_members
FOR EACH ROW EXECUTE FUNCTION forge_security.reject_revoked_member_insertion();

CREATE FUNCTION public.leave_campaign(p_campaign uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE actor uuid := auth.uid(); removed_count integer;
BEGIN
  IF actor IS NULL OR p_campaign IS NULL THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;

  PERFORM 1 FROM public.campaigns AS c WHERE c.id=p_campaign FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.campaign_members AS m
    WHERE m.campaign_id=p_campaign AND m.user_id=actor AND m.role='player';
  GET DIAGNOSTICS removed_count=ROW_COUNT;
  IF removed_count<>1 THEN
    RETURN false;
  END IF;

  -- The deletion trigger stamps a tombstone. Only this authenticated
  -- actor's own voluntary player-leave path removes it.
  DELETE FROM forge_security.campaign_member_revocations AS r
    WHERE r.campaign_id=p_campaign AND r.user_id=actor;
  RETURN true;
END
$body$;

CREATE FUNCTION public.dm_remove_campaign_player(p_campaign uuid,p_player uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE actor uuid := auth.uid(); removed_count integer;
BEGIN
  IF actor IS NULL OR p_campaign IS NULL OR p_player IS NULL OR actor=p_player THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;

  PERFORM 1 FROM public.campaigns AS c WHERE c.id=p_campaign FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.campaign_members AS m
    WHERE m.campaign_id=p_campaign AND m.user_id=actor AND m.role='dm'
  ) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;

  DELETE FROM public.campaign_members AS m
    WHERE m.campaign_id=p_campaign AND m.user_id=p_player AND m.role='player';
  GET DIAGNOSTICS removed_count=ROW_COUNT;
  RETURN removed_count=1;
END
$body$;

CREATE FUNCTION public.dm_reinstate_campaign_player(p_campaign uuid,p_player uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE actor uuid := auth.uid(); changed_count integer;
BEGIN
  IF actor IS NULL OR p_campaign IS NULL OR p_player IS NULL OR actor=p_player THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;

  PERFORM 1 FROM public.campaigns AS c WHERE c.id=p_campaign FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.campaign_members AS m
    WHERE m.campaign_id=p_campaign AND m.user_id=actor AND m.role='dm'
  ) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;

  -- Only a previously removed player may be explicitly reinstated.
  -- Do not let this route enroll an arbitrary previously unseen user.
  DELETE FROM forge_security.campaign_member_revocations AS r
    WHERE r.campaign_id=p_campaign AND r.user_id=p_player;
  GET DIAGNOSTICS changed_count=ROW_COUNT;
  IF changed_count<>1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.campaign_members(campaign_id,user_id,role)
    VALUES(p_campaign,p_player,'player')
  ON CONFLICT (campaign_id,user_id) DO NOTHING;
  RETURN true;
END
$body$;

REVOKE ALL ON FUNCTION public.leave_campaign(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dm_remove_campaign_player(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dm_reinstate_campaign_player(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leave_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dm_remove_campaign_player(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dm_reinstate_campaign_player(uuid,uuid) TO authenticated;

COMMIT;
