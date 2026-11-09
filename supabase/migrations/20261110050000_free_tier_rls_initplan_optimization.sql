-- STAGING ONLY / UNAPPLIED. Do not run directly on production.
-- The sole change is hoisting row-constant auth.uid() to a SELECT initPlan.
-- No permissions are broadened, no search_path or role grants are changed.
-- Generated from pg_policies read-only snapshot on 10 November 2026.

-- public.campaigns: dm edit campaigns
alter policy "dm edit campaigns" on "public"."campaigns"
 using (is_campaign_dm(id))
 with check ((is_campaign_dm(id) AND (owner_id = (select auth.uid()))));

-- public.characters: owner or dm read characters
alter policy "owner or dm read characters" on "public"."characters"
 using ((is_campaign_member(campaign_id) AND ((user_id = (select auth.uid())) OR is_campaign_dm(campaign_id))));

-- public.characters: owners or dm edit characters
alter policy "owners or dm edit characters" on "public"."characters"
 using ((((user_id = (select auth.uid())) OR is_campaign_dm(campaign_id)) AND is_campaign_member(campaign_id)))
 with check ((((user_id = (select auth.uid())) OR is_campaign_dm(campaign_id)) AND is_campaign_member(campaign_id)));

-- public.map_tokens: player creates owned character only where already observed
alter policy "player creates owned character only where already observed" on "public"."map_tokens"
 with check (((owner_id = (select auth.uid())) AND (character_id IS NOT NULL) AND (npc_template_id IS NULL) AND (visible = true) AND (npc_values = '{}'::jsonb) AND can_view_campaign_map(campaign_id, map_id) AND (EXISTS ( SELECT 1
   FROM characters ch
  WHERE ((ch.id = map_tokens.character_id) AND (ch.campaign_id = ch.campaign_id) AND (ch.user_id = (select auth.uid())) AND (NOT (map_tokens.image_path IS DISTINCT FROM ch.token_path))))) AND can_player_place_map_piece(map_id, ((x)::double precision + ((span_x)::double precision / (2)::double precision)), ((y)::double precision + ((span_y)::double precision / (2)::double precision)))));

-- public.tabletop_macros: owner creates campaign macros
alter policy "owner creates campaign macros" on "public"."tabletop_macros"
 with check (((user_id = (select auth.uid())) AND is_campaign_member(campaign_id)));

-- public.tabletop_macros: owner edits campaign macros
alter policy "owner edits campaign macros" on "public"."tabletop_macros"
 using (((user_id = (select auth.uid())) AND is_campaign_member(campaign_id)))
 with check (((user_id = (select auth.uid())) AND is_campaign_member(campaign_id)));

-- public.tabletop_macros: owner reads campaign macros
alter policy "owner reads campaign macros" on "public"."tabletop_macros"
 using (((user_id = (select auth.uid())) AND is_campaign_member(campaign_id)));

-- public.tabletop_macros: owner removes campaign macros
alter policy "owner removes campaign macros" on "public"."tabletop_macros"
 using (((user_id = (select auth.uid())) AND is_campaign_member(campaign_id)));

-- public.tabletop_menu_preferences: Members create own sidebar menus
alter policy "Members create own sidebar menus" on "public"."tabletop_menu_preferences"
 with check ((((select auth.uid()) = user_id) AND is_campaign_member(campaign_id)));

-- public.tabletop_menu_preferences: Members edit own sidebar menus
alter policy "Members edit own sidebar menus" on "public"."tabletop_menu_preferences"
 using ((((select auth.uid()) = user_id) AND is_campaign_member(campaign_id)))
 with check ((((select auth.uid()) = user_id) AND is_campaign_member(campaign_id)));

-- public.tabletop_menu_preferences: Members read own sidebar menus
alter policy "Members read own sidebar menus" on "public"."tabletop_menu_preferences"
 using ((((select auth.uid()) = user_id) AND is_campaign_member(campaign_id)));

-- realtime.messages: World V2 private observers receive only their map stream
alter policy "World V2 private observers receive only their map stream" on "realtime"."messages"
 using (((extension = 'broadcast'::text) AND
CASE
    WHEN (( SELECT realtime.topic() AS topic) ~ '^forge-world-v2:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) THEN (((split_part(( SELECT realtime.topic() AS topic), ':'::text, 3))::uuid = (select auth.uid())) AND (EXISTS ( SELECT 1
       FROM battle_maps bm
      WHERE ((bm.id = (split_part(( SELECT realtime.topic() AS topic), ':'::text, 2))::uuid) AND can_view_campaign_map(bm.campaign_id, bm.id)))))
    ELSE false
END));

-- realtime.messages: forge observer motion receive
alter policy "forge observer motion receive" on "realtime"."messages"
 using (((extension = 'broadcast'::text) AND
CASE
    WHEN (( SELECT realtime.topic() AS topic) ~ '^forge-observer:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) THEN (((split_part(( SELECT realtime.topic() AS topic), ':'::text, 3))::uuid = (select auth.uid())) AND (EXISTS ( SELECT 1
       FROM battle_maps m
      WHERE ((m.id = (split_part(( SELECT realtime.topic() AS topic), ':'::text, 2))::uuid) AND can_view_campaign_map(m.campaign_id, m.id)))))
    ELSE false
END));
