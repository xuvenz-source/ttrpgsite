-- R18-114: ONLY after installing six SHA-verified Git function bodies in scratch PG17.
\set ON_ERROR_STOP on
-- Synthetic definer probe makes real private helper functions exercise their
-- original permission checks while preserving the original EXECUTE revokes.
CREATE FUNCTION public.r114_sheet_probe(
 p_campaign uuid,p_source text,p_source_id uuid,p_field text)
RETURNS TABLE(editable boolean,inventory_editable boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $probe$
 SELECT public.can_edit_campaign_sheet(p_campaign,p_source,p_source_id),
        public.can_edit_campaign_sheet_inventory(p_campaign,p_source,p_source_id,p_field)
$probe$;
REVOKE ALL ON FUNCTION public.r114_sheet_probe(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.r114_sheet_probe(uuid,text,uuid,text) TO authenticated;

-- Mirrors only the public wrapper's delegation semantics. This is not
-- public.preview_map_motion's live body and is NOT real Supabase Auth.
CREATE FUNCTION public.r114_movement_probe(
 p_map uuid,p_kind text,p_piece uuid,p_x integer,p_y integer,p_seq bigint,p_ignore_collision boolean)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''
AS $motion$
 SELECT forge_visibility.dispatch_movement_preview(
 p_map,p_kind,p_piece,p_x,p_y,p_seq,p_ignore_collision)
$motion$;
REVOKE ALL ON FUNCTION public.r114_movement_probe(
 uuid,text,uuid,integer,integer,bigint,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.r114_movement_probe(
 uuid,text,uuid,integer,integer,bigint,boolean)
 TO authenticated;

-- Assert exact permission envelope before testing any synthetic identity.
DO $acl$ BEGIN
 IF has_function_privilege('authenticated','public.can_edit_campaign_sheet(uuid,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.can_edit_campaign_sheet_inventory(uuid,text,uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.get_campaign_sheet_inventory(uuid,text,uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.patch_campaign_sheet_noninventory(uuid,text,uuid,jsonb,jsonb)','EXECUTE')
    OR has_schema_privilege('authenticated','forge_visibility','USAGE')
    OR has_function_privilege('authenticated',
      'forge_visibility.dispatch_movement_preview(uuid,text,uuid,integer,integer,bigint,boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'R114 scratch ACL boundary not enforced'; END IF;
END $acl$;
