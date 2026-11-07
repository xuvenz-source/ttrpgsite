# Initiative & Turn Order System — Staging v1

**Branch:** `stage/initiative-turn-order-2026-11-07`  
**Base dependency:** `stage/map-environment-interactions-2026-11-07` (draft PR #8).  
**Status:** Not approved for production. **Do not apply** its new migration to the production Supabase database before manual multiplayer / RLS QA.

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

**Pending migration:** `supabase/migrations/20261107150000_map_combat_initiative.sql`

This migration is versioned in GitHub **only**. It has not been applied to any production schema. The staging UI will show a database unavailable message until a dedicated staging database receives the migration. Do not share this preview as a ready multiplayer combat release until database/permission integration has been validated.

## Explicitly not in v1

- Drag-and-drop manual tie reordering, temporary non-token participants / lair actions, ready/delay mechanics, condition timers and historical encounter review.
- Fog-of-war occlusion and token collision are separately staged map-environment work; the initiative tracker does not claim these are implemented.

## QA gate (must pass before merge/release)

1. Apply migration to an **isolated staging Supabase project**. Verify RLS using signed-in DM, two players, and an unrelated campaign member.
2. Begin combat with 2 player tokens, 2 NPC tokens, and one invisible NPC. Confirm all authorized users see a popup, but players do not receive hidden NPC names or token IDs, even by querying the database or listening to Realtime.
3. Have each player roll their own character's initiative (and reject attempts to roll another player's or a hidden NPC's). Verify Chat roll card values match the tracker.
4. Test individual NPC rolls, Roll All NPCs, manual score override, re-sort, next/previous navigation, round rollover and reverting from round 2 to round 1.
5. Reorder visible vs hidden token states while combat is active; the public row must immediately redact or reveal only permitted fields. Move/delete a token mid-combat and check roster refresh.
6. Switch each player to another private map and ensure their old map encounter disappears and the old state is no longer readable. Switch back and confirm encounter recovers without losing scores/turn.
7. Minimize/close the window for one player while others keep it open. Advance multiple turns; dismissed tracker stays closed until explicitly reopened.
8. Reload and reconnect multiple clients, repeatedly advance turns, and verify no duplicate rolls, stale updates or incorrect round counts.
9. Ensure mobile-width window controls, other draggable windows, dice chat, token dragging, Map setting and sidebar expansion are unchanged.
10. Run `node --test tests/*.test.mjs`, `npm run build`, SQL integration checks and security advisors on **staging** before approval.
