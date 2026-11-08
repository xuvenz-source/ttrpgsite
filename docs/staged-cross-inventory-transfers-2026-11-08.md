# Staged: inventory-to-party transfer repairs — 8 November 2026

**Status:** staging only. No production deployment, Vercel preview, Supabase
migration, or Edge Function change has been performed for this feature.

## Why transfers failed

`InventoryPanel`'s old pointer-release handler always called
`moveInventoryItem` for its **source** grid. Dragging a character item into
a separate open party-stash grid therefore attempted to move it to a
coordinate outside the character grid and reported a bogus
"Not enough empty slots" error. Reverse transfers likewise lacked a transfer
RPC and a target handler, so the item could stay unchanged with no feedback.

## Staged solution

- A destination-aware pointer-release path recognises other open inventory
  windows. A cross-inventory drop invokes a dedicated transfer RPC, while
  internal grid rearrangements continue to use the existing local grid
  movement path and existing per-item mutation API.
- All normal items have a **Move item…** action in their clicked detail
  editor. This discovers the signed-in user's accessible issued party/mount
  inventories or character Inventory fields, allows a destination selection,
  saves pending detail edits, and then transfers the record.
- Destination placement checks a contiguous footprint, not total empty-cell
  count. A drop over occupied squares falls back to the first fitting
  rectangle, consistent with existing auto-layout. A true full grid, an item
  exceeding destination dimensions, expired/in-use lease or permission error
  is reported without changing either inventory. List destinations retain
  the item fields without carrying obsolete grid coordinates.
- `transfer_campaign_inventory_item` is a single transactional
  SECURITY DEFINER RPC. It verifies campaign scope, destination access,
  source lease ownership, unique item ID, item footprint, count limit and
  authoritative destination layout. It locks the character then issued tool
  record and moves one item between their current JSON snapshots; if either
  update fails, PostgreSQL rolls back both. The UUID, quantity, weight,
  notes, visual appearance and orientation survive the move.
- Existing realtime subscriptions and explicit best-effort local refreshes
  update inventory windows and preserve item-specific collaboration semantics.
  No direct array writes or client-side permission assumptions are introduced.

## Release dependency

Review `staging/sql-candidates/campaign_cross_inventory_item_transfers.sql`.
After explicit release approval, convert this candidate into a versioned
Supabase migration and apply it to the existing live Supabase Free database
**before** merging the matching frontend into `main`. Do not apply SQL during
staging. There is no separate paid staging DB and no hourly charges.

Rollback plan: remove EXECUTE on the new transfer RPC immediately to prevent
further transfers; if necessary drop the transfer and slot functions. Existing
inventory data is unchanged by installation. Completed transfers are ordinary
item records; rollback does **not** reverse transfers already made.

## Manual acceptance checklist — existing live test campaigns only

1. With a player character and shared party grid open in the same browser
   window, drag a 1×1 item from sheet grid to a visible vacant party cell.
   The item appears exactly once in party storage, disappears from the sheet
   and remains after closing/reopening both windows.
2. Reverse the direction. Repeat with 2×1 and 2×2 items and a crowded target:
   if the chosen cells are occupied but another contiguous rectangle fits,
   the server chooses that free rectangle rather than rejecting the move.
3. Click an item to open its details; use **Move item…** to pick a shared
   inventory without needing both windows open. Reverse using an item in
   the party stash and choose the player's character inventory field.
4. Test list and grid destinations, multi-Inventory-field characters, NPC
   inventories (not part of v1), owned mounts vs shared inventory, DM
   permission and unauthorized other-player character. Ineligible
   destinations should be hidden and all forged RPC targets rejected.
5. Test a full grid, insufficient rectangle, too-large item, stale lease,
   DM Take override, two players editing separate items, simultaneous
   moves, transfers while sheet and party windows stay open, error feedback
   and item preservation after a rejected request.
6. Verify item identity, quantity, weight, notes, icon, tile sizes, rotation
   and color persist. Check network errors report the failure visibly.
7. Confirm intra-grid reordering/rotation, autosave, weapon sheets, and
   token/tools movement still work; run GitHub unit/build/CodeQL before release.

## Scope

Character Inventory fields ↔ issued party/mount inventories only.
Moving NPC template/token inventories or tool↔tool directly is outside this
batch, because server permissions for those sources need a separate design.
Cross-*browser-window* drag gestures are not supported; the clicked-item Move
menu works even when the destination inventory is not open.
