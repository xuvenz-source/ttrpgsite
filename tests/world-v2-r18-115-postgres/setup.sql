-- R18-115, after isolated R18-114 has completed successfully.
-- CI scratch PostgreSQL 17 only. No hosted Supabase SQL.
\set ON_ERROR_STOP on
DO $guard$ BEGIN
 IF current_database()<>'world_v2_r18_114' OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'R115 setup refused unexpected database';
 END IF;
END $guard$;

-- The production migration's lease schema is reproduced with synthetic
-- campaign/auth foreign keys, unique identity and row-level security.
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000301'),
 ('00000000-0000-4000-8000-000000000302'),
 ('00000000-0000-4000-8000-000000000303'),
 ('00000000-0000-4000-8000-000000000304'),
 ('00000000-0000-4000-8000-000000000305');
CREATE TABLE public.campaign_sheet_item_leases(
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
 source_type text NOT NULL CHECK(source_type IN ('character','npc_template','npc_token')),
 source_id uuid NOT NULL,
 field_id text NOT NULL CHECK(field_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 item_id uuid NOT NULL,
 holder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(campaign_id,source_type,source_id,field_id,item_id)
);
ALTER TABLE public.campaign_sheet_item_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_sheet_item_leases FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.campaign_sheet_item_leases TO authenticated;

-- R114 movement revokes synthetic P1; re-add explicitly for baseline tests.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
VALUES ('00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000302','player')
ON CONFLICT(campaign_id,user_id) DO UPDATE SET role=excluded.role;

-- Two distinct actual item IDs and source data; no real user content.
UPDATE public.characters SET field_values=
 '{"hp":10,"bag":[
    {"_inventoryId":"00000000-0000-4000-8000-000000000701","name":"P1 potion"},
    {"_inventoryId":"00000000-0000-4000-8000-000000000702","name":"P1 scroll"}
  ]}'::jsonb
WHERE id='00000000-0000-4000-8000-000000000501';

