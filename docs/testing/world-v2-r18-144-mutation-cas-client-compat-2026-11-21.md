# B10-R18-144 — Mutation CAS / original side-effect audit and V3 client compatibility

**21 November 2026, Melbourne.** Source-only child of verified R18-143 draft
PR #251 (parent SHA `123a4e7ad1ce179d3b2de0690c6f8a1ee296bfbd`).
**Production and hosted QA remain NO_GO.** No SQL migration, new browser
role grant, runtime app edit, build deployment or paid resource.

## Original PostgreSQL / trigger findings (read-only source)
Original `public.touch_updated_at` and `public.validate_campaign_handout`
both set `updated_at:=now()`. PostgreSQL `now()` is fixed at the start of
the transaction, **not a monotonic per-row edit sequence**.
R143 uses `FOR UPDATE` and matching `p_expected_updated_at`; this
blocks ordinary stale edits across different timestamps but does not
establish a unique commit/version token in every transaction.
A separate disposable PG17 proof deliberately runs three accepted
character edits in one transaction. The second and third share the
first response's `updatedAt` timestamp, demonstrating stale CAS ambiguity.
This does **not** prove normal two-browser RPC calls in separate
transactions collide, but does prove the stronger guarantee is missing.
Avoid calling timestamp CAS a complete solution.

Original `collect_campaign_map_pin` unconditionally updates the
handout `collected=true,revealed=true` whenever a visible, collectable,
current-map pin is chosen, even when already collected. Original
`campaign_handout_tick` is an unconditional AFTER UPDATE trigger:
repeated collection can generate repeated revision/events. A fictional
AFTER UPDATE counter in disposable PG17 shows two updates for two
collections. Exact production events/lock ordering remain unverified.

Other original child side-effects include `characters_monitor_refresh`,
`forge_character_elevation_tick`, character art sync, handout
validation/hide-pin cascading, visibility and public Realtime publication.
The original `patch_campaign_sheet_noninventory` returns a full
`to_jsonb(row)` including private art paths. R143 correctly returns a
sanitized receipt; that is **not a drop-in client return type**.

## Exact current client source census — no runtime changes

The tested `MutationCompatibilityAudit.mjs` reads the actual current
`src/TabletopApp.jsx`, `src/useCampaignHandouts.js`,
`src/useCampaignSheetInventory.js`, and R142/R143 SQL candidates.
Five main V2 mutation consumer groups are BLOCKED for direct switch:

1. **Character autosave**: the existing queued call sends patch fields
   **and name metadata**, expects to rehydrate the character.
   R143 supports template non-inventory patch keys only, no name edit.
   An adapter needs a separate authorized name update, fresh revision
   token, re-read, queue/abort semantics and cancellation on revocation.
2. **NPC editor**: another old RPC call supports npc_template/npc_token
   sheet values, NPC art and bars visibility. R143 intentionally
   implements none of these. A V3 replacement needs DM-only contracts
   rather than routing NPC changes to a character-owner API.
3. **Handout manager**: the hook includes folder CRUD, handout
   create/update/delete, pin CRUD and collect; R143 covers **only**
   content editing (not folder assignment) and collection.
   Existing `updateHandout` returns the full row; V3 returns a
   sanitized receipt and must independently re-read.
4. **Handout collection**: current `collectPin` expects the old RPC's
   UUID result and full hook refresh. The V3 proposal returns a
   limited object. Repeated clicks require true idempotency, and
   a hidden/other-map pin must not leak a handout.
5. **Inventory**: `useCampaignSheetInventory` invokes
   `get_campaign_sheet_inventory`, which can **write missing inventory
   IDs** during a nominal read; the alternate direct SELECT returns a
   broader JSON column. R143's non-inventory patch is not an inventory
   replacement. Server-verified per-item identities, leases and
   owner/DM field scope need a separate mutation family.

Any client-side `isDM`, `protocolVersion` or optimistic cache
is not a substitute for current server-side membership and row rights.
All old already-connected Realtime sockets, 17 published public tables,
19 Postgres Changes listeners and 3600-second preissued Storage
bearer URLs remain independent security gates.

## Exit gates and next step

**R18-145:** design and test a monotonic per-resource revision token
that covers *all* writers (including legacy/trigger paths) and an
idempotency token for repeated pin collection; define strict
client mapping and read-after-write adapters. A partial revision
scheme that counts only V3 writes is insufficient. Keep browser
EXECUTE revoked and original `public` API frozen in staged designs.

Real original 83-migration signed DM/P1/P2/outsider and revoked/
rejoined multi-tab QA, cross-map/LOS/collision/fog and free-tier
p50/p95/p99 remain untested. Issues #220/#223/#229/#231 and R127
human release approval remain outstanding.

**NO_GO. No manual action for R18-144.**
