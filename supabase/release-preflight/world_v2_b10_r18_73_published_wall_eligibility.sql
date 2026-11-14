-- B10-R18-73: PRIVACY-SAFE READ-ONLY published map wall-eligibility census.
-- DO NOT migrate, cache, alter maps, or return map IDs, coordinates, scene
-- JSON, per-map rows, actor identities or player fog frames.
-- Source contract: exact strict whole-scene R18-72 plain-wall eligibility.
-- This is a single SELECT for authorized read-only execution; aggregate ONLY.
-- All JSON array expansion is bounded to scenes with <=120 objects and each
-- wall's validated point array of 2..80 entries. No code execution or writes.
WITH scenes AS MATERIALIZED (
 SELECT map_id,live,
  CASE WHEN pg_catalog.jsonb_typeof(live->'objects')='array'
   THEN pg_catalog.jsonb_array_length(live->'objects')
   ELSE -1 END AS object_count
 FROM public.map_environments
), objects AS MATERIALIZED (
 SELECT s.map_id,o.value,
  CASE
   WHEN pg_catalog.jsonb_typeof(o.value)='object'
     AND o.value->>'type'='wall' THEN 'wall'
   WHEN pg_catalog.jsonb_typeof(o.value)='object'
     AND o.value->>'type'='door' THEN 'door'
   WHEN pg_catalog.jsonb_typeof(o.value)='object'
     AND o.value->>'type'='window' THEN 'window'
   WHEN pg_catalog.jsonb_typeof(o.value)='object'
     AND o.value->>'type'='light' THEN 'light'
   ELSE 'other'
  END AS safe_family,
  (
   pg_catalog.jsonb_typeof(o.value)='object'
   AND o.value->>'type'='wall'
   AND (SELECT count(*) FROM pg_catalog.jsonb_object_keys(
    CASE WHEN pg_catalog.jsonb_typeof(o.value)='object'
     THEN o.value ELSE '{}'::jsonb END
   ))=2
   AND (CASE WHEN pg_catalog.jsonb_typeof(o.value->'points')='array'
    THEN pg_catalog.jsonb_array_length(o.value->'points') BETWEEN 2 AND 80
    ELSE false END)
   AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(
     CASE WHEN pg_catalog.jsonb_typeof(o.value->'points')='array'
       AND (CASE WHEN pg_catalog.jsonb_typeof(o.value->'points')='array'
        THEN pg_catalog.jsonb_array_length(o.value->'points') BETWEEN 2 AND 80
        ELSE false END)
      THEN o.value->'points' ELSE '[]'::jsonb END
    ) AS point(value)
    WHERE pg_catalog.jsonb_typeof(point.value) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(
      CASE WHEN pg_catalog.jsonb_typeof(point.value)='object'
       THEN point.value ELSE '{}'::jsonb END
     ))<>2
     OR pg_catalog.jsonb_typeof(point.value->'x') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(point.value->'y') IS DISTINCT FROM 'number'
   )
  ) AS plain_wall
 FROM scenes s
 CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
  CASE WHEN s.object_count BETWEEN 2 AND 120
   THEN s.live->'objects' ELSE '[]'::jsonb END
 ) o(value)
), object_stats AS (
 SELECT map_id,
  count(*) AS inspected,
  count(DISTINCT value) AS unique_objects,
  coalesce(bool_and(plain_wall),false) AS all_plain,
  count(*) FILTER(WHERE safe_family='wall') AS walls,
  count(*) FILTER(WHERE safe_family='door') AS doors,
  count(*) FILTER(WHERE safe_family='window') AS windows,
  count(*) FILTER(WHERE safe_family='light') AS lights,
  count(*) FILTER(WHERE safe_family='other') AS other
 FROM objects GROUP BY map_id
), classified AS (
 SELECT s.object_count,
  coalesce(s.object_count BETWEEN 2 AND 120
   AND st.inspected=s.object_count AND st.all_plain,false)
   AS strict_eligible,
  CASE WHEN s.object_count BETWEEN 2 AND 120
    AND st.inspected=s.object_count AND st.all_plain
   THEN s.object_count-st.unique_objects ELSE 0 END
   AS duplicate_objects,
  coalesce(st.inspected,0) AS inspected,
  coalesce(st.walls,0) AS walls,
  coalesce(st.doors,0) AS doors,
  coalesce(st.windows,0) AS windows,
  coalesce(st.lights,0) AS lights,
  coalesce(st.other,0) AS other
 FROM scenes s LEFT JOIN object_stats st USING(map_id)
)
SELECT pg_catalog.jsonb_build_object(
 'schema',1,
 'kind','B10-R18-73-published-wall-eligibility',
 'observed_at',pg_catalog.clock_timestamp(),
 'published_scene_rows',count(*),
 'scenes_with_array',count(*) FILTER(WHERE object_count>=0),
 'scenes_without_array',count(*) FILTER(WHERE object_count<0),
 'scenes_over_120',count(*) FILTER(WHERE object_count>120),
 'strict_plain_wall_scenes',count(*) FILTER(WHERE strict_eligible),
 'strict_plain_wall_scenes_with_duplicates',
  count(*) FILTER(WHERE strict_eligible AND duplicate_objects>0),
 'strict_plain_wall_scenes_without_duplicates',
  count(*) FILTER(WHERE strict_eligible AND duplicate_objects=0),
 'strict_plain_wall_eligible_objects',
  coalesce(sum(object_count) FILTER(WHERE strict_eligible),0),
 'strict_plain_wall_duplicate_objects',
  coalesce(sum(duplicate_objects) FILTER(WHERE strict_eligible),0),
 'fallback_scenes',count(*) FILTER(WHERE NOT strict_eligible),
 'bounded_objects_total',coalesce(sum(inspected),0),
 'bounded_wall_objects',coalesce(sum(walls),0),
 'bounded_door_objects',coalesce(sum(doors),0),
 'bounded_window_objects',coalesce(sum(windows),0),
 'bounded_light_objects',coalesce(sum(lights),0),
 'bounded_other_objects',coalesce(sum(other),0),
 'geometry_recorded',false,
 'map_ids_recorded',false,
 'operator_cli_verified',false,
 'independent_dm_p1_p2_verified',false,
 'safe_to_install',false,
 'release_decision','NO_GO'
) AS world_v2_wall_eligibility
FROM classified;
