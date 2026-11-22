-- Entirely synthetic R227 PostgreSQL17 fixture: no real Auth or campaign data.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.campaigns (id integer PRIMARY KEY,active_map_id integer);
CREATE TABLE public.battle_maps (
 id integer PRIMARY KEY,
 campaign_id integer NOT NULL REFERENCES public.campaigns(id)
);
ALTER TABLE public.campaigns
 ADD CONSTRAINT fictional_active_map_fkey
 FOREIGN KEY(active_map_id) REFERENCES public.battle_maps(id);
CREATE TABLE public.characters (
 id integer PRIMARY KEY,campaign_id integer NOT NULL REFERENCES public.campaigns(id)
);
CREATE TABLE public.map_tokens (
 id integer PRIMARY KEY,
 campaign_id integer NOT NULL REFERENCES public.campaigns(id),
 map_id integer NOT NULL REFERENCES public.battle_maps(id),
 character_id integer REFERENCES public.characters(id)
);
INSERT INTO public.campaigns(id) VALUES (1),(2);
INSERT INTO public.battle_maps(id,campaign_id) VALUES (10,1),(20,2);
INSERT INTO public.characters(id,campaign_id) VALUES (100,1),(200,2);
-- Foreign campaign "active map" pointer is allowed by single-column FK.
UPDATE public.campaigns
 SET active_map_id=CASE WHEN id=1 THEN 20 ELSE 20 END;
-- Two good tokens plus one wrong character, one wrong map, one wrong both.
INSERT INTO public.map_tokens(id,campaign_id,map_id,character_id)
 VALUES (1,1,10,100),(2,2,20,200),
        (3,1,10,200),(4,1,20,100),(5,1,20,200);
COMMIT;
