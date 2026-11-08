# Per-player server-authorized fog revisions — staged architecture (8 November 2026)

**Status: implemented as source and SQL candidates on PR #52; NOT MIGRATED, DEPLOYED OR LIVE-VALIDATED.** This follows the earlier memory/observer-path staging on the same branch. No paid Supabase branch, additional compute, cron worker, Edge Function or Vercel deployment.

## Goal and security boundary

Existing `forge_visibility.tick_tokens` advances `map_visibility_ticks` when ANY token moves on a fog-enabled map. Every player receiving that global tick immediately revokes sight, hides non-owned tokens, and runs the expensive `get_authorized_map_fog` RPC even when the movement is well outside their sight. It causes player-side flashing and excess Supabase work.

The staged design introduces **server-authored per-viewer invalidation**. A player's visibility is retained only when the *server* can prove a pure positional update cannot change that player's own or shared vision, accessible tokens, or dynamic light. A new revision never grants permission: the client still calls the existing RLS-authorized fog RPC and re-fetches RLS-authorized token/tool membership before rendering new objects.

## New SQL candidate — unapplied

`staging/sql-candidates/per_viewer_visibility_v2.sql`:

- `public.map_viewer_visibility_ticks`: `(map_id,user_id)` primary key, campaign ID, monotonic revision, fog enforcement flag and update time. **No token IDs, geometry, revealed cells or private fields.** Browser roles can SELECT only their own authorized map revision via RLS; no INSERT/UPDATE/DELETE. Authenticated SELECT is the only browser table grant. Added to `supabase_realtime` publication with RLS.
- `forge_visibility.bump_viewer_ticks`: updates eligible players assigned to the relevant map. NULL recipient list is a conservative all-player invalidation; an empty list means no affected player.
- `forge_visibility.bump_tick`: retains global `map_visibility_ticks` for old clients and DMs, but also updates all active per-viewer ticks on global changes. Doors/walls, published map rules, light changes, exploration reset, ownership/vision metadata and existing character visibility-attribute triggers remain fail-closed.
- `forge_visibility.viewers_affected_by_token_move`: **only** the actual OLD/NEW database rows from a pure coordinate update; server checks campaign role, map assignment, own sight-source token, shared-party sight, nearby eligible source positions (both canonical and recent server-verified preview origins), and any attached lit torch. A conservative 16-cell plus footprint envelope over-approximates the actual 12-cell vision radius. Unknown scene, invalid inputs, carried light, or calculation error => NULL => all players. A source/observer that might see the old OR new token receives a tick and must refresh.
- `forge_visibility.bump_tick_scoped` + revised `tick_tokens`: retain a global tick for legacy subscribers, but only bump *potentially affected* per-player revisions on pure fog-enabled movement. INSERT/DELETE, ownership, visibility, footprint, character link, NPC values and map transfer still invalidate globally. Pure movement on non-fog maps continues without fog invalidation.
- `public.get_authorized_map_fog_v2`: calls the existing `public.get_authorized_map_fog` for actual sight and checks that the viewer's revision did not change during that authorization; returns `protocolVersion=2` and an independent per-viewer `revision`. It does not implement its own LOS algorithm or grant sight.
- Internal SECURITY DEFINER functions retain `search_path=''`, expose no public EXECUTE, and are never callable by the browser. Only the v2 authenticated RPC is exposed, with the same user/map authorization as the existing RPC.

**No SQL from this candidate has been executed.** A green JavaScript build is not PostgreSQL compilation or RLS role acceptance. Before release the SQL must be converted into the approved versioned migration, compiled against the live schema and checked for privileges, privacy, performance and rollback. Keep compatibility with the previously staged `observer_path_visibility_single_snapshot.sql` candidate; the two are independent database changes and belong to the same consolidated approval.

## Frontend selection and fallback

`useAuthorizedMapFog` now attempts `get_authorized_map_fog_v2` for players. A valid versioned, server-authorized frame switches to the new **own-user** `map_viewer_visibility_ticks` subscription. DMs stay on the old global table because they see all tokens and need global published-rule updates. Old servers without v2 RPC (`PGRST202`/`42883`) automatically use the legacy global subscription and original RPC. Unexpected RPC errors or malformed v2 replies remain fail-closed (never downgrade authorization).

A newly subscribed or reconnected stream reauthorizes sight. Hidden browser tabs immediately revoke on relevant ticks but defer network reauthorization until visible. Map/user changes discard stale frames; out-of-order revisions and duplicate pending notifications are ignored only when already covered by a newer server-confirmed revision. V2 notifications include no visibility or coordinates.

The existing `TabletopApp` RLS token and placed-tool refreshes still run on confirmed relevant frame revisions. Existing collision, wall lighting, single-write trajectory, private observer broadcasts, monitor/badge dependency refresh and permission safeguards are unchanged.

## Limitations — work not falsely claimed complete

- **Potential-impact filtering, not pixel-exact equality.** The server sends a tick for ALL sight-source movements affecting a player even if the final fog mask is identical. Tokens in/near view can still temporarily hide during necessary reauthorization. This stage should sharply reduce flashes for **unrelated** movement but does not promise no flashing for the moving player's own fog.
- **Legacy global events are still written** for compatibility, so some database writes remain. V2 adds bounded recipient revision upserts; evaluate total WAL, CPU, Realtime fanout and peak connections at 2/4/6–10 players, rather than claiming memory savings from source code alone.
- **Realtime isn't a revocation cryptographic proof**: a reconnect, focus or subscription error must reauthorize. Direct Data API RLS remains the security boundary; no client may create a sight mask, infer authorization from coordinates or trust a previously cached NPC on an actual invalidation.
- **Role/map reassignments and connected-client revocation** require an explicit end-to-end QA case. A player whose membership is removed may lose server-side access before an existing browser discards already-downloaded sight. Existing map/account navigation and reauthorization remain essential; no tool can undo data already downloaded by a former participant.
- Background physical RAM, swap, pool and query p50/p95 are still unmeasured; the severe ~1.54 GB committed-memory warning is **not resolved by staging alone**.

## Rollout order after designer approval

1. Confirm final PR #52 SHA passes unit tests, lint/build, Deno checks, CodeQL; review independent staged `observer_path_visibility_single_snapshot.sql` and `per_viewer_visibility_v2.sql`, and ensure both are recorded in the release ledger and no other staged work was omitted.
2. Convert SQL candidates to versioned migrations and apply them **once** to the existing free Supabase database, only after designer approval. Check compile, RLS SELECT isolation, no browser write rights, publication membership, direct RPC execution grants, correct global v1 behaviour, and server-generated scoped updates. The SQL must precede the matching v2 client deployment.
3. Merge a single approved release to `main`, deploy Vercel once and verify production SHA. Live clients auto-negotiate v2 and older clients retain global fallback. Do not run an unapproved Vercel preview or paid database branch.
4. Exercise 2/4/6–10 player stress with 10/50/100 tokens: moving own source, far-away NPC, NPC entering/leaving sight, shared-party on/off, lit torch carrier, nearby light, doors, one-way walls, collision/DM overrides, character vision attributes, group moves, map switch, tab background, reconnect and inaccessible role. Confirm player B **cannot** SELECT player A's v2 rows or view hidden NPCs.
5. Capture counters per stable session: global/v2 Realtime events, `get_authorized_map_fog` and monitors/badges/tool RPCs, memory commitment vs actual RAM/swap, connection high-water, CPU and p50/p95 movement/fog. Only claim success if no visibility leaks, fewer pointless revisions and no worse gameplay latency.
6. Rollback order: deploy previous global-only frontend first, then run `staging/sql-candidates/rollback_per_viewer_visibility_v2.sql` to restore exact prior `bump_tick`/`tick_tokens` and remove the v2 table/RPC. The rollback removes only ephemeral per-viewer revision records, not campaign content.

## Verification assets

- `tests/server-per-viewer-visibility-v2.test.mjs`: static security and protocol guards, full-RLS fallback, private grants and original SQL restoration.
- `staging/verification/per_viewer_visibility_v2_read_only.sql`: post-migration RLS, publication, execution-grant, and revision-counter checks. Requires real DM/player JWT browser acceptance separately.
- `staging/sql-candidates/rollback_per_viewer_visibility_v2.sql`: exact live original server functions captured before staging and revocable metadata cleanup.

**Release state remains draft and unapplied.** Additional memory/headroom testing and a pixel-exact visibility projection equality layer are separate future work if the conservative v2 strategy doesn't meet UX targets.
