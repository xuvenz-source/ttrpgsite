-- B04 hostile movement authority tests: real Postgres, real V2 geometry
-- and session_valid source, with ONLY auth/map-membership fixture stubs.
-- Runs inside one transaction and always ROLLBACKs the fixture mutations.
BEGIN;
DO $b04$
DECLARE
 p1 uuid:='00000000-0000-4000-8000-000000000011';
 p2 uuid:='00000000-0000-4000-8000-000000000012';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 map_id uuid:='00000000-0000-4000-8000-000000000021';
 token1 uuid:='00000000-0000-4000-8000-000000000101';
 token2 uuid:='00000000-0000-4000-8000-000000000102';
 npc uuid:='00000000-0000-4000-8000-000000000103';
 tool1 uuid:='00000000-0000-4000-8000-000000000201';
 s1 uuid:='00000000-0000-4000-8000-000000000301';
 sf uuid:='00000000-0000-4000-8000-000000000302';
 sd uuid:='00000000-0000-4000-8000-000000000303';
 st uuid:='00000000-0000-4000-8000-000000000304';
 sg uuid:='00000000-0000-4000-8000-000000000305';
 sc uuid:='00000000-0000-4000-8000-000000000306';
 r jsonb; initial_s jsonb; later_s jsonb; original_scene jsonb;
 call_count integer:=0;
BEGIN
 -- Baseline legitimate user, authoritative session creation fixture.
 PERFORM set_config('request.jwt.claim.sub',p1::text,true);
 PERFORM public.b04_issue_token_session(s1,p1,token1);
 SELECT to_jsonb(m) INTO initial_s
 FROM forge_world_v2.motion_sessions m WHERE id=s1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":4,"y":1}]',1,1);
 PERFORM public.b04_assert(
  r->>'blocked'='false' AND jsonb_array_length(r->'accepted')=3
  AND r->'endpoint'='{"x":4,"y":1}'::jsonb AND
  r->'accepted'='[{"x":2,"y":1},{"x":3,"y":1},{"x":4,"y":1}]'::jsonb,
  'P01 authorized player: ordered 3-cell accepted prefix');
 SELECT to_jsonb(m) INTO later_s
 FROM forge_world_v2.motion_sessions m WHERE id=s1;
 PERFORM public.b04_assert(later_s=initial_s,
  'P02 validator has no session write (not even last_seq)');
 PERFORM public.b04_assert(
  (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token1),
  'P03 validator does not move canonical map_tokens');
 PERFORM public.b04_assert(
  (SELECT x=1 AND y=7 FROM public.campaign_tool_issues WHERE id=tool1),
  'P04 validator does not move canonical campaign_tool_issues');

 -- Auth and IDOR: actor identity is from trusted request context, not UUID.
 PERFORM set_config('request.jwt.claim.sub',p2::text,true);
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":4,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H01 foreign actor cannot use session UUID');
 PERFORM set_config('request.jwt.claim.sub','',true);
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":4,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H02 anonymous JWT context denied');
 PERFORM set_config('request.jwt.claim.sub',p1::text,true);
 PERFORM public.b04_issue_token_session(sf,p1,token2);
 r:=forge_world_v2.validate_motion_path_batch_b03(
  sf,1,'{"x":1,"y":9}','[{"x":2,"y":9}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H03 foreign player token denied');
 PERFORM public.b04_issue_token_session(sd,p1,npc);
 r:=forge_world_v2.validate_motion_path_batch_b03(
  sd,1,'{"x":5,"y":5}','[{"x":6,"y":5}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H04 concealed DM NPC denied to player');
 DELETE FROM forge_world_v2.motion_sessions WHERE id=sd;
 PERFORM public.b04_issue_token_session(sd,dm,npc);
 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 r:=forge_world_v2.validate_motion_path_batch_b03(
  sd,1,'{"x":5,"y":5}','[{"x":6,"y":5}]',1,1);
 PERFORM public.b04_assert(r->>'blocked'='false',
  'P05 legitimate DM may move privately owned NPC');
 PERFORM set_config('request.jwt.claim.sub',p1::text,true);

 -- Stale session, generation, scope, and malicious request coordinates.
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,2,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H05 skipped sequence rejected');
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,0,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H06 zero/out-of-order sequence rejected');
 UPDATE forge_world_v2.motion_sessions SET last_seq=1 WHERE id=s1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H07 replayed last_seq denied by validator');
 UPDATE forge_world_v2.motion_sessions SET last_seq=0 WHERE id=s1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":2,"y":1}','[{"x":3,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H08 forged original coordinate rejected');
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1,"admin":true}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H09 extra origin JSON field rejected');
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2.5,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H10 fractional waypoint rejected');
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1,"secret":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H11 extra waypoint metadata rejected');
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":30,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H12 >24 attempted cells rejected');
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}',
  '[{"x":2,"y":1},{"x":3,"y":1},{"x":4,"y":1},{"x":5,"y":1},{"x":6,"y":1},{"x":7,"y":1},{"x":8,"y":1},{"x":9,"y":1},{"x":10,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H13 >8 waypoint targets rejected');
 UPDATE forge_world_v2.motion_sessions SET attempted_cells=120 WHERE id=s1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":10,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H14 >128 session cell budget rejected');
 UPDATE forge_world_v2.motion_sessions SET attempted_cells=0 WHERE id=s1;
 UPDATE forge_world_v2.motion_sessions SET batches=64 WHERE id=s1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H15 >64 batch cap enforced');
 UPDATE forge_world_v2.motion_sessions SET batches=0 WHERE id=s1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',2,1);
 PERFORM public.b04_assert(r IS NULL,'H16 stale requested environment revision');
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,2);
 PERFORM public.b04_assert(r IS NULL,'H17 stale requested permission generation');
 UPDATE forge_visibility.navigation_permission_generations SET generation=2
 WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H18 changed database permission generation');
 UPDATE forge_visibility.navigation_permission_generations SET generation=1;
 UPDATE public.map_environments SET revision=2;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H19 changed database scene revision');
 UPDATE public.map_environments SET revision=1;
 UPDATE forge_visibility.map_rules SET updated_at='2026-11-10T00:00:00Z';
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H20 changed rules timestamp');
 UPDATE forge_visibility.map_rules SET updated_at='2026-11-09T00:00:00Z';
 UPDATE forge_world_v2.motion_sessions
 SET expires_at=clock_timestamp()-interval '2 seconds' WHERE id=s1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H21 expired session');
 UPDATE forge_world_v2.motion_sessions
 SET expires_at=clock_timestamp()+interval '10 seconds' WHERE id=s1;

 -- Revoked map access, ownership, visibility, character ownership.
 DELETE FROM public.campaign_members WHERE user_id=p1 AND campaign_id=campaign;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H22 revoked player map membership denied');
 INSERT INTO public.campaign_members VALUES(campaign,p1,'player');
 UPDATE public.map_tokens SET owner_id=p2 WHERE id=token1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H23 current token owner changed');
 UPDATE public.map_tokens SET owner_id=p1 WHERE id=token1;
 UPDATE public.map_tokens SET visible=false WHERE id=token1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H24 invisible token for player denied');
 UPDATE public.map_tokens SET visible=true WHERE id=token1;
 UPDATE public.map_tokens SET map_id='00000000-0000-4000-8000-000000000099' WHERE id=token1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H25 selected token transferred to another map');
 UPDATE public.map_tokens SET map_id='00000000-0000-4000-8000-000000000021'::uuid WHERE id=token1;

 -- An untrusted player cannot turn on DM collision override.
 PERFORM public.b04_issue_token_session(sc,p1,token1,true);
 r:=forge_world_v2.validate_motion_path_batch_b03(
  sc,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H26 forged player DM override refused');
 DELETE FROM forge_world_v2.motion_sessions WHERE id=sc;
 PERFORM public.b04_issue_token_session(sc,dm,token1,true);
 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 r:=forge_world_v2.validate_motion_path_batch_b03(
  sc,1,'{"x":1,"y":1}','[{"x":4,"y":1}]',1,1);
 PERFORM public.b04_assert(r->>'blocked'='false',
  'P06 actual DM override permitted by authority');
 PERFORM set_config('request.jwt.claim.sub',p1::text,true);

 -- Walls, one-way sight flags and door thresholds never leak blockers.
 SELECT live INTO original_scene FROM public.map_environments;
 UPDATE public.map_environments
 SET live='{"objects":[{"type":"wall","blocksMovement":true,
  "oneWay":"forward","points":[{"x":3,"y":0},{"x":3,"y":6}]}]}'::jsonb;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":5,"y":1}]',1,1);
 PERFORM public.b04_assert(
  r->>'blocked'='true'
  AND r->'endpoint'='{"x":2,"y":1}'::jsonb
  AND r->'accepted'='[{"x":2,"y":1}]'::jsonb
  AND r->>'wallGeometry' IS NULL,
  'H27 solid oneWay vision wall blocks exact swept path at safe frontier');
 UPDATE public.map_environments
 SET live='{"objects":[{"type":"door","state":"closed",
 "blocksMovement":true,"points":[{"x":3,"y":0},{"x":3,"y":6}]}]}'::jsonb;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":5,"y":1}]',1,1);
 PERFORM public.b04_assert(r->>'blocked'='true',
  'H28 closed door blocks a contiguous step');
 UPDATE public.map_environments
 SET live='{"objects":[{"type":"door","state":"open",
 "blocksMovement":true,"points":[{"x":3,"y":0},{"x":3,"y":6}]}]}'::jsonb;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":5,"y":1}]',1,1);
 PERFORM public.b04_assert(r->>'blocked'='false'
   AND jsonb_array_length(r->'accepted')=4,
  'P07 opened door permits validated passage');
 UPDATE public.map_environments
 SET live='{"objects":[{"type":"window","state":"open",
 "blocksMovement":true,"points":[{"x":3,"y":0},{"x":3,"y":6}]}]}'::jsonb;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":5,"y":1}]',1,1);
 PERFORM public.b04_assert(r->>'blocked'='false',
  'P08 open window permits validated passage');
 UPDATE public.map_environments
 SET live='{"objects":[{"type":"wall","blocksMovement":true,
 "attributeField":"STR","movementAt":"10",
 "points":[{"x":3,"y":0},{"x":3,"y":6}]}]}'::jsonb;
 UPDATE public.map_tokens SET npc_values='{"STR":{"current":12}}' WHERE id=token1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":5,"y":1}]',1,1);
 PERFORM public.b04_assert(r->>'blocked'='false',
  'P09 attribute threshold permits authorized crossing');
 UPDATE public.map_tokens SET npc_values='{"STR":{"current":9}}' WHERE id=token1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":5,"y":1}]',1,1);
 PERFORM public.b04_assert(r->>'blocked'='true',
  'H29 insufficient attribute cannot bypass movement wall');
 UPDATE public.map_tokens SET npc_values='{}' WHERE id=token1;

 -- Missing scene must not be treated as an empty collision mesh.
 UPDATE public.map_environments SET live=NULL;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H30 missing collision scene fails closed');
 UPDATE public.map_environments SET live='{"objects":null}'::jsonb;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  s1,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H31 malformed collision scene fails closed');
 UPDATE public.map_environments SET live=original_scene;

 -- Mixed token+mount footprint, even if the selected anchor is clear.
 PERFORM public.b04_issue_token_session(sg,p1,token1);
 UPDATE forge_world_v2.motion_sessions
 SET selection=selection||jsonb_build_array(jsonb_build_object(
  'kind','tool','id',tool1,'x',1,'y',7,'spanX',2,'spanY',2,'toolRevision',1))
 WHERE id=sg;
 UPDATE public.map_environments
 SET live='{"objects":[{"type":"wall","blocksMovement":true,
  "points":[{"x":4,"y":7},{"x":4,"y":12}]}]}'::jsonb;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  sg,1,'{"x":1,"y":1}','[{"x":7,"y":1}]',1,1);
 PERFORM public.b04_assert(
  r->>'blocked'='true' AND
  r->'endpoint'='{"x":2,"y":1}'::jsonb AND
  r->'accepted'='[{"x":2,"y":1}]'::jsonb,
  'H32 mount swept footprint stops whole mixed group');
 UPDATE public.campaign_tool_issues SET held_by_token_id=token1 WHERE id=tool1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  sg,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H33 newly held tool invalidates group session');
 UPDATE public.campaign_tool_issues SET held_by_token_id=NULL WHERE id=tool1;
 PERFORM public.b04_issue_tool_session(st,p1,tool1);
 r:=forge_world_v2.validate_motion_path_batch_b03(
  st,1,'{"x":1,"y":7}','[{"x":2,"y":7}]',1,1);
 PERFORM public.b04_assert(r->>'blocked'='false',
  'P10 valid independent authorized mount movement');
 UPDATE public.campaign_tool_issues SET owner_id=p2 WHERE id=tool1;
 r:=forge_world_v2.validate_motion_path_batch_b03(
  st,1,'{"x":1,"y":7}','[{"x":2,"y":7}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H34 changed tool ownership rejected');
 UPDATE public.campaign_tool_issues SET owner_id=p1 WHERE id=tool1;

 -- Character-linked ownership and version protection.
 INSERT INTO public.characters(id,campaign_id,user_id,field_values)
 VALUES('00000000-0000-4000-8000-000000000501',campaign,p2,'{}');
 UPDATE public.map_tokens SET
  character_id='00000000-0000-4000-8000-000000000501'
 WHERE id=token1;
 PERFORM public.b04_issue_token_session(
  '00000000-0000-4000-8000-000000000307',p1,token1);
 r:=forge_world_v2.validate_motion_path_batch_b03(
  '00000000-0000-4000-8000-000000000307',1,
  '{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r IS NULL,'H35 foreign character owner rejected');
 UPDATE public.characters SET user_id=p1
 WHERE id='00000000-0000-4000-8000-000000000501';
 r:=forge_world_v2.validate_motion_path_batch_b03(
  '00000000-0000-4000-8000-000000000307',1,
  '{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(r->>'blocked'='false',
  'P11 valid linked-character ownership permitted');

 -- Privilege/metadata assertions must inspect role grants, not source text.
 PERFORM public.b04_assert(
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  NOT has_schema_privilege('anon','forge_world_v2','USAGE'),
  'G01 neither browser role can use private SQL schema');
 PERFORM public.b04_assert(
  NOT has_function_privilege('authenticated',
   'forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
   AND NOT has_function_privilege('anon',
   'forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE'),
  'G02 browser roles lack candidate EXECUTE grant');
 PERFORM public.b04_assert(
  (SELECT prosecdef=false FROM pg_proc
   WHERE oid='forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure),
  'G03 validator is invoker, not privileged definer');
 PERFORM public.b04_assert(
  (SELECT relrowsecurity=true FROM pg_class
   WHERE oid='forge_world_v2.motion_sessions'::regclass),
  'G04 private session table retains row level security');
 RAISE NOTICE 'B04 COMPLETE: isolated PostgreSQL hostile validation checks passed; no production DB interaction.';
END
$b04$;
ROLLBACK;
