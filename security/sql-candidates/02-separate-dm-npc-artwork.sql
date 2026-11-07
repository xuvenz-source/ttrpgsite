-- REVIEW CANDIDATE ONLY. Do not deploy without DM/player browser tests.
-- Replaces the current campaign-wide artwork SELECT rule, preserving:
--  * DM access to all artwork belonging to their campaign
--  * player access to player-character artwork already shared in their campaign
--  * player access to NPC token artwork ONLY when linked to a revealed
--    visible NPC token on a map the player is authorized to view.
-- NPC library portraits and hidden NPCs remain DM-only even if paths leak.
-- WARNING: If a player needs extra NPC portraits from a non-token path,
-- add an explicit handout/share policy instead of reopening all NPC art.
--
-- Optional supporting index to assess under representative load:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS map_tokens_art_path_lookup_idx
--   ON public.map_tokens(campaign_id,image_path)
--   WHERE image_path IS NOT NULL;
--
drop policy if exists "campaign members access artwork" on storage.objects;

create policy "campaign members access artwork"
on storage.objects
for select to authenticated
using (
  bucket_id = 'tabletop-artwork'
  and exists (
    select 1
    from public.campaigns c
    where c.id::text = split_part(storage.objects.name, '/', 1)
      and public.is_campaign_member(c.id)
      and (
        public.is_campaign_dm(c.id)
        or split_part(storage.objects.name, '/', 2) = 'players'
        or exists (
          select 1 from public.map_tokens t
          where t.campaign_id = c.id
            and t.image_path = storage.objects.name
            and t.character_id is null
            and t.visible = true
            and public.can_view_campaign_map(t.campaign_id,t.map_id)
        )
      )
  )
);
