# B10-R18-130 — RPC call-candidate and Postgres Changes subscriber audit

**19 November 2026, Australia/Melbourne.** Direct isolated child of R18-129 draft PR #237, pinned at `31779ef3b1829f227c976c78144d748acd938c64`. **NO_GO** for hosted Supabase SQL, release, production, staging deployment, versioned migrations, changes under `src/`, merges or paid infrastructure.

## R18-129 inherited proof

R18-129 dedicated source/PG17, standard repository verification and final combined SQL succeeded. The `is_map_fog_published` guard remains an unapplied source candidate. Original project migration count remains 83 and QA remains empty. No R125–R129 private SQL candidates have been installed in the original or QA projects.

## Authenticated privileged RPC review — scoped and reproducible, NOT complete

A read-only original `pg_proc` query extracted signatures, definition MD5s, direct guard-text flags, `auth.uid` text flags, and regex-matched qualified function references for **all 67** authenticated-callable `public` SECURITY DEFINER functions. No SQL bodies, campaign rows, user identifiers, API keys, or secrets are preserved in the staged ledger. Fifteen have no direct text match for the four common membership/map checks; this is a **review queue, not 15 confirmed vulnerabilities**.

Confirmed code-path examples from actual original definitions:

| Callable public entrypoint | Observed delegation | Current decision |
| --- | --- | --- |
| `advance_world_motion_v2` | `forge_world_v2.advance_core_v2` → `session_valid` → `public.can_view_campaign_map` | Existing path checks current map access; still review in-flight session, publisher, service-role paths |
| `get_authorized_map_fog_v2` | `get_authorized_map_fog` → `can_view_campaign_map` | Delegated authenticated check observed; does not fix all fog metadata exposure |
| `get_campaign_sheet_inventory` | `can_edit_campaign_sheet_inventory` → `can_edit_campaign_sheet` | A guard exists but prior revoked-sheet-owner flaw remains blocked (#220) |
| `preview_map_motion` | `forge_visibility.dispatch_movement_preview` → current map permission | Static delegation observed; timing and old Broadcast topics remain unproved |
| `get_world_visibility_v2` | `forge_world_v2.visibility_frame_v2` → current viewer map lookup | Preview and fog security still require signed-user verification |
| `is_map_fog_published` | No authorized-map or actor predicate in original function | Narrow confirmed metadata-oracle candidate, R129 repair unapplied |
| Actor-owned cleanup RPCs | Cleanup is constrained by `auth.uid` and stored session/item ownership | Not a proof those session/lease owners are still campaign members |

The staged `public-definer-call-candidates.json` contains **static candidate edges only**, including possible false positives from strings/comments and missed indirect or dynamic SQL. It does not mark the full graph signed-off, nor bypass manual review of 83 historical SQL bodies. There are no granted new schemas or functions in R130. A metadata hash mismatch invalidates any previous audit assertions.

## Live client Realtime listeners and release surface

The source review identifies actual listeners in `src/TabletopApp.jsx`, `src/useCampaignHandouts.js`, `src/useCampaignSheetInventory.js`, `src/useCampaignToolCollaboration.js`, `src/useCampaignTools.js`, `src/useMapCombat.js`, `src/useAuthorizedMapFog.js`, plus V2 Broadcast consumers in `src/engine/v2/SceneTransport.js` and `RealtimeTransport.js`. The full `src/` scanner enumerated **19 listener declarations across seven source files**, with **16 wildcard `*` event handlers**, **19 filters**, **zero explicit column projections**, and one dynamic table binding with three known targets. These counts are source-level characteristics, not proof that a DELETE event was actually delivered or that a full-row payload was leaked. The pinned baseline came from passing dedicated CI run #44501859219. The full `src/` scanner is authoritative for this static subscriber *inventory* once its pinned baseline is reviewed. Matching the baseline is never evidence of live authorization or socket teardown.

The `useCampaignSheetInventory.js` table expression `target.table` resolves to `characters`, `npc_templates` or `map_tokens` depending on sheet source. Those are three distinct potential feed tables; other new dynamic subscriptions must be explicitly rejected by the scanner until reviewed. Several other listeners use event `*`, which can include DELETE.

Supabase's Postgres Changes documentation (https://supabase.com/docs/guides/realtime/postgres-changes) states that authorization runs per event per subscriber, unlike Broadcast private-channel join authorization. It also states that **RLS policies are not applied to DELETE events**, because a deleted record cannot be authenticated by a current row check, and warns about the special DELETE/replica identity/filter behavior. It would therefore be wrong to claim that every connected Postgres Changes listener becomes a security leak on membership revocation, or that a `*` listener is automatically safe. Signed-user payload and timing verification is required. A source-only client callback that merely re-fetches through RLS is different from one that directly consumes a raw `event.new` / `event.old` payload.

The real `supabase_realtime` publication has 17 public tables with RLS enabled in the observed catalog. It does **not** publish `campaign_members`. The previous catalogue found `map_tokens` lacks `authenticated` base-table SELECT even though a SELECT RLS policy exists; verify whether its Postgres Changes channel delivers expected authorized events instead of assuming it does. Default event payloads may contain full rows for permitted recipients; an authorization failure remains security sensitive for `characters.field_values`, `campaigns.sheet_template`, and `map_viewer_visibility_ticks.authorized_frame`.

Source-specific observations: `useAuthorizedMapFog` listens only to INSERT/UPDATE on per-viewer visibility ticks, explicitly avoiding DELETE, while `TabletopApp` uses `*` on campaign routing, tokens, characters, NPCs, chat and map metadata. These are all audit surfaces, not confirmed leaks. The `vtt-routing-...` Broadcast channel is not declared private in the existing file, another separate server-side send/receive authorization review target. The V2 scene client still subscribes to the legacy shared map topic; staged R125/R126 V3 has not replaced it.

## Source-only automated guard and limitations

`SourceRealtimeSubscriptionAudit.mjs` scans **all source JS/JSX/MJS**, rejects unparsed subscription options, unexpected dynamic table bindings, new/unpublished tables and drift against a pinned baseline of file, schema, table, event, filter and column projection. It is read-only and cannot change any live listener. Unknown or changed listener contracts must block any release review until inspected. The baseline is populated from an exact-source CI receipt, not guessed. `client-subscription-baseline.json` labels source parity as **NO_GO** even when every listener matches.

No client runtime changes or test deployment are made. R18-123 revocation teardown and R18-125/126 recipient epoch are still dormant staged candidates; the public-schema maintenance deny of R18-128 remains unapplied. An R130 inventory alone cannot evict already-connected Broadcast sockets, prevent future Postgres Changes deliveries, block service_role paths, or revoke 3,600-second signed Storage bearer URLs (#231).

## Next release blockers and test requirements

Maintain production NO_GO. Review all 67 callable functions' complete privileged paths, not only text/call candidates; check 83 original private SQL migrations; inspect all 17 publication policy definitions and client-subscription handlers; test signed DM/P1/P2/outsider sessions (active, revoked, off-map, rejoined and reconnecting), in-flight edits, DELETE semantics, Postgres Changes after membership loss, and Broadcast stale-channel behavior. Preserve movement/collision/fog responsiveness and the $0 resource budget. A verified server-side maintenance/legacy-client protocol fence remains mandatory before any V3 cutover.

**Manual work now: none. No original/QA write, merge or deployment.**
