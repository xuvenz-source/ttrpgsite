-- B08 disposable PostgreSQL 17 only; original V2 production commit checkpoint.
CREATE TABLE forge_world_v2.commit_checkpoints(
 transaction_id bigint PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES forge_world_v2.motion_sessions(id)
 ON DELETE CASCADE,
 actor_id uuid NOT NULL,campaign_id uuid NOT NULL,map_id uuid NOT NULL);
ALTER TABLE forge_world_v2.commit_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_world_v2.commit_checkpoints FROM PUBLIC,anon,authenticated;

-- Original V2 commit uses this table as the trusted transaction checkpoint.
-- The test schema has simplified map_token/tool tables without deployment triggers;
-- this does NOT qualify actual production trigger enforcement.
CREATE OR REPLACE FUNCTION public.b08_assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'B08 FAIL: %',label;END IF;
 RAISE NOTICE 'PASS B08: %',label;
END $$;