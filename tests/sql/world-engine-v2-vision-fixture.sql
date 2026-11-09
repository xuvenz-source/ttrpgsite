-- Phase 7 ONLY disposable PostgreSQL fixture, after Phase 6 tests.
-- Models the exact existing forge_visibility.exploration persistence contract
-- and public.campaign_tool_map_tokens schema without real campaign data.
CREATE TABLE forge_visibility.exploration(
 campaign_id uuid NOT NULL,map_id uuid NOT NULL,user_id uuid NOT NULL,
 explored_cells jsonb NOT NULL DEFAULT '[]'::jsonb,
 revision bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(map_id,user_id)
);
ALTER TABLE forge_visibility.exploration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_visibility.exploration FROM PUBLIC,anon,authenticated;

CREATE TABLE public.campaign_tool_map_tokens(
 issue_id uuid PRIMARY KEY,campaign_id uuid NOT NULL,map_id uuid NOT NULL,
 name text NOT NULL DEFAULT 'Fixture Torch',
 icon text,kind text NOT NULL,x integer NOT NULL,y integer NOT NULL,
 span integer NOT NULL DEFAULT 1,
 light_bright integer NOT NULL DEFAULT 0,
 light_dim integer NOT NULL DEFAULT 0,
 light_color text NOT NULL DEFAULT '#ffce7a',
 light_intensity integer NOT NULL DEFAULT 100,
 light_enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 held_by_token_id uuid
);
ALTER TABLE public.campaign_tool_map_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_tool_map_tokens FROM PUBLIC,anon,authenticated;
INSERT INTO public.campaign_tool_map_tokens(
 issue_id,campaign_id,map_id,kind,x,y,
 light_bright,light_dim,light_enabled)
VALUES(
 '50000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 'torch',1,7,20,20,true
);
-- A held torch follows the holder token's server-owned V2 position.
INSERT INTO public.campaign_tool_issues(
 id,campaign_id,map_id,owner_id,kind,
 config,state,x,y,held_by_token_id
) VALUES(
 '50000000-0000-4000-8000-000000000002',
 '20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001',
 'torch','{}'::jsonb,'{}'::jsonb,2,4,
 '40000000-0000-4000-8000-000000000001'
);
INSERT INTO public.campaign_tool_map_tokens(
 issue_id,campaign_id,map_id,kind,x,y,
 light_bright,light_dim,light_enabled,held_by_token_id
) VALUES(
 '50000000-0000-4000-8000-000000000002',
 '20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 'torch',2,4,10,10,true,
 '40000000-0000-4000-8000-000000000001'
);
