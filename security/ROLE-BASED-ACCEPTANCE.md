# Private content authorization acceptance tests

Run in a **separate Supabase staging project** with disposable accounts and fake data.
Never use production passwords, service-role credentials or actual player's private content in test fixtures.

## Roles
- DM-A: creator of Campaign A.
- Player-A: member of Campaign A, assigned to Map A.
- Player-B: member of Campaign A, assigned to Map B.
- Player-C: member of unrelated Campaign B.
- Signed-out browser.

## Private artwork / map cases
1. DM-A can upload/read NPC token and portrait files under Campaign A `npcs/`.
2. Player-A cannot download the unpublished NPC token or portrait by **known exact storage path**.
3. DM-A places an NPC token on Map A, first hidden; Player-A still cannot download that NPC image.
4. DM-A reveals the NPC: Player-A can download the *token* image; still cannot access hidden portrait not linked to a visible token.
5. Player-B assigned Map B cannot download Map A's revealed NPC token image.
6. Player-C cannot download any Campaign A artwork, even if supplied an exact path.
7. A player can continue to view permitted fellow-party player artwork.
8. A signed-out browser cannot read artwork, and private storage signed URLs expire at the configured time.
9. Hiding/reassigning an NPC stops **new** downloads; acknowledge that a previously obtained signed URL/file may remain available until URL expiry or browser cache eviction.

## Database roles / privileged RPCs
- As signed-out/anonymous, test all public app tables and 19 elevated RPCs: no private data.
- Test `get_npc_token_values`, `get_token_monitor_values`, `get_token_quick_values`, `apply_token_quick_changes`, `dm_give_inventory_item`, `post_token_reference`, macros/spells/weapons with cross-campaign UUIDs.
- A player cannot modify `campaign_members` roles, update DM-only `map_environments`, or reveal/alter NPCs without permission.
- Map/token image-path replacement cannot be used by a player to force accessibility of private DM images.
- Member revoked while online loses access on token refresh/reconnect; check stale Realtime and cached signed image URLs.
- Confirm `campaign_map_views`, `campaign_player_maps`, and `tabletop_menu_preferences` work for logged-in users after anonymous SQL grants are revoked.

## Deployment gate
**Already applied and independently verified:** anonymous SQL grants revoked from
three authenticated-only tables in production using migration
`20261107051546_remove_unused_anon_preference_and_map_grants`; authenticated
privileges and RLS remained intact. The exact migration is recorded under
`supabase/migrations/` for repository parity.

The **NPC artwork** policy remains **candidate-only** under
`security/sql-candidates/` and is NOT yet deployed. Generate an official
migration after DM/player acceptance testing and a reviewed rollback plan.
Do not modify production Storage RLS from GitHub CI or a Vercel frontend build.

## Rollback plan
- Anonymous grants: restore only the specifically needed ACL grants if a documented legacy anonymous flow depends on them (prefer fixing that flow).
- Artwork: restore the previous `campaign members access artwork` policy from a reviewed backup in an emergency; this temporarily reopens NPC artwork to all campaign members until the visibility-aware policy is repaired.
