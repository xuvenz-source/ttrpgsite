-- Phase 10 disposable PostgreSQL contract, never run on production.
-- All real V2 commits must execute without legacy forge.trajectory GUCs,
-- and no transaction checkpoint may outlive an acknowledged commit.
DO $$
DECLARE body text;
BEGIN
 IF has_table_privilege('anon','forge_world_v2.commit_checkpoints','SELECT')
  OR has_table_privilege('authenticated','forge_world_v2.commit_checkpoints','SELECT')
  OR has_table_privilege('authenticated','forge_world_v2.commit_checkpoints','INSERT')
  OR has_function_privilege('authenticated',
   'forge_world_v2.commit_allows_piece_v2(text,uuid,uuid,uuid,integer,integer,integer,integer)',
   'EXECUTE')
 THEN RAISE EXCEPTION 'Phase 10 private checkpoint exposed';END IF;
 SELECT pg_get_functiondef(
  'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'::regprocedure)
 INTO body;
 IF body LIKE '%forge.trajectory_%' OR
  body LIKE '%forge.collision_override%'
 THEN RAISE EXCEPTION 'V2 canonical commit still depends on legacy GUC';END IF;
 IF body NOT LIKE '%forge_world_v2.commit_checkpoints%'
 THEN RAISE EXCEPTION 'V2 commit missing private authorization';END IF;
 IF (SELECT count(*) FROM forge_world_v2.commit_checkpoints)<>0
 THEN RAISE EXCEPTION 'Checkpoint leaked after committed or rejected movement';END IF;
 IF pg_get_functiondef('forge_visibility.enforce_collision()'::regprocedure)
   NOT LIKE '%commit_allows_piece_v2%'
  OR pg_get_functiondef(
   'forge_visibility.enforce_tool_collision()'::regprocedure)
   NOT LIKE '%commit_allows_piece_v2%'
 THEN RAISE EXCEPTION 'Legacy triggers were not safely adapted for V2';END IF;
END $$;

-- Even knowing a valid selected token ID and guessing a translation never
-- grants a checkpoint outside its exact, server-validated transaction.
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 IF forge_world_v2.commit_allows_piece_v2(
  'token','40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  0,1,1,1) THEN RAISE EXCEPTION 'Forged V2 commit checkpoint accepted';END IF;
END $$;
RESET request.jwt.claim.sub;
SELECT 'world-engine-v2-phase10-checkpoint-contract-passed' AS result;
