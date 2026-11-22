-- R227 PROPOSED OWNER-AUTHORIZATION CHECKPOINT — NOT EXECUTED ON HOSTED DB.
-- READ-ONLY aggregate counts, no names/IDs/content/user rows returned.
-- This SELECT accesses application map/token/character/campaign records and
-- thus requires NEW SPECIFIC OWNER AUTHORIZATION beyond prior metadata review.
-- Never auto-run by source-only CI against any Supabase project.
WITH token_edges AS (
  SELECT
    t.campaign_id AS token_campaign,
    b.campaign_id AS map_campaign,
    t.character_id AS token_character_id,
    ch.campaign_id AS character_campaign
  FROM public.map_tokens AS t
  LEFT JOIN public.battle_maps AS b ON b.id=t.map_id
  LEFT JOIN public.characters AS ch ON ch.id=t.character_id
), token_counts AS (
  SELECT
    count(*)::bigint AS token_count,
    count(*) FILTER (
      WHERE map_campaign IS DISTINCT FROM token_campaign
    )::bigint AS token_wrong_campaign_map_count,
    count(*) FILTER (
      WHERE token_character_id IS NOT NULL
        AND character_campaign IS DISTINCT FROM token_campaign
    )::bigint AS token_wrong_campaign_character_count
  FROM token_edges
), campaign_counts AS (
  SELECT
    count(*) FILTER (
      WHERE c.active_map_id IS NOT NULL
        AND b.campaign_id IS DISTINCT FROM c.id
    )::bigint AS active_map_wrong_campaign_count
  FROM public.campaigns AS c
  LEFT JOIN public.battle_maps AS b ON b.id=c.active_map_id
)
SELECT
  t.token_count,
  t.token_wrong_campaign_map_count,
  t.token_wrong_campaign_character_count,
  c.active_map_wrong_campaign_count
FROM token_counts AS t
CROSS JOIN campaign_counts AS c;
