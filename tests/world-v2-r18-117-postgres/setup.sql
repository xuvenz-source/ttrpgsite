-- R117: additive synthetic data only, after R116 source-bound tests.
\set ON_ERROR_STOP on
DO $guard$ BEGIN
 IF current_database()<>'world_v2_r18_114' OR current_user<>'postgres'
 THEN RAISE EXCEPTION 'R117 setup refused unexpected scratch DB';END IF;
END $guard$;

-- Owner P1, issued mount, DM may edit attributes; P1 may toggle light.
INSERT INTO public.campaign_tool_issues(
 id,campaign_id,map_id,owner_id,party_shared,x,y,kind,config,state)
VALUES (
 '00000000-0000-4000-8000-000000000804',
 '00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000201',
 '00000000-0000-4000-8000-000000000302',
 false,1,1,'mount','{}'::jsonb,
 '{"items":[{"_inventoryId":"00000000-0000-4000-8000-000000000707","name":"Saddle"}],"lit":false,"attrs":{"capacity":1}}'::jsonb
);
DO $acl$ BEGIN
 IF has_table_privilege('authenticated','public.campaign_tool_issues','UPDATE')
 THEN RAISE EXCEPTION 'R117 direct state UPDATE must be denied';END IF;
END $acl$;
