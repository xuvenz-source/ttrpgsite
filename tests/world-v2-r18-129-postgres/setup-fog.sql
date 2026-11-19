-- Synthetic PostgreSQL 17 fixture: observed ORIGINAL fog-published helper.
-- R125 setup.sql must be loaded before this fixture, in disposable DB only.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA forge_visibility;
REVOKE ALL ON SCHEMA forge_visibility FROM PUBLIC,anon,authenticated;
CREATE TABLE forge_visibility.map_rules (
 map_id uuid PRIMARY KEY REFERENCES public.battle_maps(id),
 fog_enforced boolean NOT NULL
);
ALTER TABLE forge_visibility.map_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_visibility.map_rules FROM PUBLIC,anon,authenticated;
INSERT INTO forge_visibility.map_rules(map_id,fog_enforced) VALUES
 ('00000000-0000-4000-8000-000000000201',true),
 ('00000000-0000-4000-8000-000000000202',false),
 ('00000000-0000-4000-8000-000000000203',true);

-- Faithful to read-only observed original definition, NOT an invented RPC.
CREATE FUNCTION public.is_map_fog_published(p_map uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $old$
 SELECT EXISTS (SELECT 1 FROM forge_visibility.map_rules r
  WHERE r.map_id=p_map AND r.fog_enforced)
$old$;
REVOKE ALL ON FUNCTION public.is_map_fog_published(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_map_fog_published(uuid) TO authenticated;
COMMIT;
