-- R182 own synthetic equivalent of historical guarded rewrite only.
-- NOT original private migration SQL. Replaying after success MUST fail closed.
\set ON_ERROR_STOP on
DO $rewrite$
DECLARE definition text;amended text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='get_token_monitor_values'
 AND pg_get_function_identity_arguments(p.oid)='p_map uuid';
 IF definition IS NULL THEN RAISE EXCEPTION 'Missing monitor';END IF;
 amended:=replace(definition,'c.active_map_id=p_map',
   'public.can_view_campaign_map(c.id,p_map)');
 IF amended=definition THEN RAISE EXCEPTION 'Expected monitor map check not found';END IF;
 EXECUTE amended;
 SELECT pg_get_functiondef(p.oid) INTO definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='post_token_reference'
 AND pg_get_function_identity_arguments(p.oid)='p_token uuid, p_code text';
 IF definition IS NULL THEN RAISE EXCEPTION 'Missing token reference';END IF;
 amended:=replace(definition,'v_token.owner_id=auth.uid()',
   'v_token.owner_id=auth.uid() and public.can_view_campaign_map(v_token.campaign_id,v_token.map_id)');
 IF amended=definition THEN RAISE EXCEPTION 'Expected owner guard not found';END IF;
 EXECUTE amended;
END
$rewrite$;
