-- R18-134 disposable PG17 only. Structural stubs for compiling the SIX
-- original full SQL bodies. These are NOT Tabletop Forge live schemas.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA forge_visibility;
REVOKE ALL ON SCHEMA forge_visibility FROM PUBLIC,anon,authenticated;
CREATE TABLE public.map_tokens(
 id uuid PRIMARY KEY, campaign_id uuid,map_id uuid,owner_id uuid,
 character_id uuid,x integer,y integer,span_x integer,span_y integer,
 visible boolean,npc_values jsonb
);
CREATE TABLE public.campaign_tool_issues(
 id uuid PRIMARY KEY,campaign_id uuid,map_id uuid,
 owner_id uuid,x integer,y integer,span_x integer,span_y integer
);
CREATE TABLE forge_visibility.navigation_gestures(
 id uuid PRIMARY KEY,actor_id uuid,campaign_id uuid,map_id uuid,
 expires_at timestamptz,token_origins jsonb,tool_origins jsonb,
 last_seq bigint
);
CREATE TABLE forge_visibility.movement_sessions(
 id uuid PRIMARY KEY,actor_id uuid,campaign_id uuid,map_id uuid,
 expires_at timestamptz,last_seq bigint,last_sent timestamptz,
 span_x integer,span_y integer,map_width integer,map_height integer,
 grid_size integer,ignore_collision boolean,
 kind text,token_visible boolean,piece_id uuid,
 last_x integer,last_y integer,base_x integer,base_y integer,
 scene jsonb,environment_revision bigint
);
CREATE TABLE forge_world_v2.motion_sessions(
 id uuid PRIMARY KEY, actor_id uuid,campaign_id uuid,map_id uuid,
 status text,mode text,
 environment_revision bigint,permission_generation bigint,
 selection jsonb,origin_x integer,origin_y integer
);
CREATE TABLE forge_world_v2.vision_epochs(
 map_id uuid NOT NULL,viewer_id uuid NOT NULL,campaign_id uuid NOT NULL,
 epoch bigint NOT NULL,changed_at timestamptz NOT NULL,
 PRIMARY KEY(map_id,viewer_id)
);
CREATE TABLE public.map_environments(
 map_id uuid PRIMARY KEY,campaign_id uuid,
 revision bigint,live jsonb
);
CREATE TABLE forge_visibility.navigation_permission_generations(
 map_id uuid PRIMARY KEY,generation bigint NOT NULL
);
INSERT INTO public.map_environments(map_id,campaign_id,revision,live)
VALUES('00000000-0000-4000-8000-000000000201',
'00000000-0000-4000-8000-000000000101',9,'{}');
INSERT INTO forge_visibility.navigation_permission_generations(map_id,generation)
VALUES('00000000-0000-4000-8000-000000000201',11);
COMMIT;
