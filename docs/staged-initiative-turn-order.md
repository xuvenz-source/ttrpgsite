# Initiative & Turn Order System — Staging v1

**Branch:** `stage/initiative-turn-order-2026-11-07`  
**Base dependency:** `stage/map-environment-interactions-2026-11-07` (draft PR #8).  
**Status:** Database migration applied and verified on the existing free-tier Supabase project, with test changes rolled back. Frontend release still requires merge, deployment and browser QA.

## Implemented

### DM Tools → Combat · Initiative order

- **Begin Combat** chooses individual map tokens and a DM-configured numeric sheet field (Number, Attribute or Resource); select either `1d20 + raw value` or `1d20 + modifier` using the campaign's custom modifier base/step.
- All NPCs and individual character tokens can roll separate initiative scores; one DM button rolls all unrolled NPCs, and each player can roll initiative once for their **own visible token**.
- Realtime public tracker with descending initiative, server-generated d20 results, dice chat messages, tie-stable sorted order, and DM manual score corrections.
- Floating, draggable, resizable and minimizable Turn Order auto-opens for authorized viewers when a new encounter begins. Closing it is local to the user; a persistent sidebar **Open Turn Order** control restores it.
- Previous / Next combatant arrows (DM only), automatic round increment/decrement, explicit **Re-sort** button, token locate action and active-token ring.
- DM can add reinforcements, remove participants, override initiative, and end combat with confirmation.
- Map-specific encounters survive tab changes and reconnect through persisted Supabase data.

### Security

- Public map state: `map_combats` is **SELECT-only** for authenticated viewers authorized via `can_view_campaign_map`. PostgreSQL Realtime broadcasts only this RLS-controlled table.
- Private token mapping: `map_combat_entries` is readable only by the campaign DM and is **never** added to the Realtime publication.
- Hidden/unpublished token names and token UUIDs are replaced by an opaque combat-entry UUID and **Unknown combatant** in public state and dice-chat labels. DM retrieves private mappings separately.
- All mutations are server-side, authenticated SECURITY DEFINER RPCs with explicit DM or token-owner checks and map-access checks. No direct client INSERT/UPDATE/DELETE grants on either table. Player rerolls are blocked server-side.
- DB triggers republish sanitized state when token visibility, name or assigned map changes, and when a combatant is deleted.
- Per-map row locking serializes competing turn operations. New encounters have stable encounter UUIDs so routine turn changes do not reopen dismissed windows.
- Encounter participants limited to 60, initiative scores bounded, and all DM-supplied field IDs validated against the actual campaign sheet template.

### Database rollout

**Applied migration:** `supabase/migrations/20261107150000_map_combat_initiative.sql`

Migration is installed on the existing live Supabase database using the corrected, versioned SQL. The frontend is not live until the tested release commit deploys; avoid claiming connected-client QA is complete.

## Explicitly not in v1

- Drag-and-drop manual tie reordering, temporary non-token participants / lair actions, ready/delay mechanics, condition timers and historical encounter review.
- Fog-of-war occlusion and token collision are separately staged map-environment work; the initiative tracker does not claim these are implemented.

## QA gate (must pass before merge/release)

1. **Complete:** Migration applied on the existing free-tier project; DM, player and synthetic outsider permissions were checked with transactional rolled-back test encounters. Additional real-browser multiplayer QA is still required.
2. Begin combat with 2 player tokens, 2 NPC tokens, and one invisible NPC. Confirm all authorized users see a popup, but players do not receive hidden NPC names or token IDs, even by querying the database or listening to Realtime.
3. Have each player roll their own character's initiative (and reject attempts to roll another player's or a hidden NPC's). Verify Chat roll card values match the tracker.
4. Test individual NPC rolls, Roll All NPCs, manual score override, re-sort, next/previous navigation, round rollover and reverting from round 2 to round 1.
5. Reorder visible vs hidden token states while combat is active; the public row must immediately redact or reveal only permitted fields. Move/delete a token mid-combat and check roster refresh.
6. Switch each player to another private map and ensure their old map encounter disappears and the old state is no longer readable. Switch back and confirm encounter recovers without losing scores/turn.
7. Minimize/close the window for one player while others keep it open. Advance multiple turns; dismissed tracker stays closed until explicitly reopened.
8. Reload and reconnect multiple clients, repeatedly advance turns, and verify no duplicate rolls, stale updates or incorrect round counts.
9. Ensure mobile-width window controls, other draggable windows, dice chat, token dragging, Map setting and sidebar expansion are unchanged.
10. Run `node --test tests/*.test.mjs` and `npm run build` in GitHub CI and verify database schema, SQL integration tests and security advisors on the existing free-tier Supabase project.


## No-cost live-database integration verification — 7 November 2026

**Supabase project:** Existing free-tier database only. No billable branch, instance or replica was created.

**Migration successfully installed:** `map_combat_initiative` was applied to the existing project, including both new RLS-enabled tables, two triggers, authenticated/DM-guarded RPCs and public sanitized Realtime publication. The initial syntax error caused by a reserved `natural` column was corrected to `die_roll` in the versioned SQL; the failed attempt rolled back with no new tables. The corrected migration applied successfully.

**Read-only checks:** Existing campaigns/maps/tokens preserved; RLS enabled on both combat tables; authenticated users have SELECT but no direct INSERT/UPDATE/DELETE; anonymous users have no SELECT; internal helper functions cannot be executed by anon or authenticated; only public `map_combats` is published to Realtime.

**Transactional live-schema integration checks (ALL PASS; test records rolled back):**
- DM begins and ends combat, rolls a d20 initiative, sorts and advances/rewinds turns.
- DM bulk rolls hidden NPC initiative, and hidden NPC stays anonymized in public tracker data.
- Revealing and re-hiding a temporary NPC updates public roster via triggers; never leaks hidden token name/ID to players.
- Normal assigned-map player can read shared roster but not DM-only entry mappings; cannot advance turns or roll an NPC.
- Synthetic unrelated authenticated user cannot read or end an encounter.
- A player can roll initiative for an owned character token exactly once; repeated roll is rejected.
- After test rollback, 0 public combat rows, 0 private entries and no temporary QA NPC/player tokens remained. Existing campaign and token counts were unchanged.

**Security advisors:** The signed-in-user `SECURITY DEFINER` RPC linter warns about intentionally callable combat functions. These are required public RPC endpoints with explicit authentication, campaign/DM and token ownership checks; their anonymous privileges are revoked. Other existing platform security advisories are outside this feature and should be assessed independently.

**Updated frontend:** DM combat setup filters participants by the current map to avoid picking stale cached tokens from other maps. Build/unit CI must still pass for the final source commit.

**Release still outstanding:** Manual connected-client visual/Realtime/browser verification, merge of clean PR #14, and Vercel frontend production deployment when the existing free-tier quota permits it. Production database is ready, but the Initiative UI is not live until frontend deployment.

---

## Release-preparation audit — 7 November 2026

**Safe integration branch:** `stage/initiative-release-ready-2026-11-07` based directly on current `main` (`03cc8708`). This isolates the Initiative files from an obsolete staging base that omitted already-live Cloudflare CAPTCHA, authentication hardening, and Vercel CI-only deployment policies. Only Initiative-specific files are changed.

**SQL syntax correction:** Both `combat_sync_token_change` and `combat_sync_deleted_entry` require `AS $$ ... END $$;` rather than an invalid single-dollar delimiter. The correction and a structural regression test are included.

### Final sign-off blockers before production

1. **Completed without paid infrastructure:** Corrected migration applied to the current free-tier Supabase project. Verified schema, policies, triggers, guards, grant/publication isolation and transient real-schema DM/player/outsider tests. No extra database project created.
2. **Authorization audit with distinct accounts:** Confirm anonymous, unrelated-campaign, normal member and DM capabilities for SELECT and every combat RPC. Ensure hidden NPC token IDs/names never appear in public rows, Realtime or chat. Verify visibility change, map reassignment and deletion trigger paths.
3. **Multiplayer smoke testing:** At least 1 DM + 2 players, token ownership and initiative, NPC bulk rolls, manual score, sorting, round boundaries, private maps, reconnection, closed pop-up persistence, encounter end/restart. Confirm dice-chat formatting.
4. **Merge sequence:** Database migration is already applied and verified. Merge the clean Initiative pull request based on current `main` (not old PR #10), pass post-merge GitHub Actions, then release the tested Git SHA to Vercel production once its free-tier quota allows. Perform immediate browser/multiplayer smoke tests on the live site.
5. **Rollback:** An application-only rollback does not remove the combat schema. Keep new tables/RPCs dormant if frontend rollback is needed; avoid dropping tables and discarding encounter data. Database changes should be additive and compatible with the existing application.

**What CI guarantees:** Node regression tests and Vite/Deno build syntax. It cannot by itself guarantee runtime PostgreSQL migration success, connected-player permissions or production network performance.
