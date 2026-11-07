# Stage: automatic sheet saving, shared-item leases, DM categories, compact weapon headers

**Branch:** `stage/realtime-inventories-dm-tabs-compact-weapons-2026-11-07`
**Scope:** staged only, no merge to `main`, no Vercel deployment, no Supabase changes.
**Cost:** GitHub Actions and existing Supabase/Vercel free plans only.

## Functional changes

1. Character, DM character editor, NPC and Bestiary sheets, issued Tools sheets and individual inventory-item detail editors save automatically. A "Saving…" / error status appears rather than a manual Save button; close attempts to flush pending sheet edits. Errors must not silently discard the unsaved draft.
2. All character/NPC template/NPC token grid inventories and issued shared inventories edit **single items** against the newest server row. Each item receives a stable hidden UUID; dragging, opening or focusing claims the item temporarily (18-second renewable server lease). Other viewers see it greyed out. The DM can take over a held item. Release happens on exiting that item; abandoned browser sessions expire without a background worker. Two different items can be edited concurrently without overwriting one another.
3. Every Inventory field is excluded from ordinary full-sheet field autosaves. The API patches noninventory field differences into current JSONB values, preserving changed inventory rows, and rejects direct REST overwrites that would bypass the leases. RLS + explicit campaign/member checks are enforced in the RPCs, not just the UI.
4. DM sidebar subcategories: **Live play** (Bestiary, Combat, Item distribution), **Maps** (map manager and settings), **Campaign** (token settings, character sheet templates, invites). Expansion keys remain scoped to their previous saved state.
5. Weapon attack chat cards retain their green heading but use the compact one-line layout of macro/spell cards.

## Coordinated release dependency

**Both** SQL candidates must be applied before the matching approved frontend release:

- `staging/sql-candidates/campaign_tool_item_collaboration.sql`
- `staging/sql-candidates/campaign_sheet_inventory_collaboration.sql`

They are not official versioned migrations or applied SQL. Create reviewed versioned migrations at release time, inspect existing live schema permissions and check authorization boundaries first. Schema changes are additive apart from a one-time UUID ID backfill on tool inventory entries; no item contents are intentionally removed or re-ordered. The new triggers prohibit old direct inventory REST writes, so coordinate migration and frontend deployment as tightly as possible. If deployment quota blocks Vercel after applying SQL, hold/recover to avoid leaving an incompatible frontend. Consider the DB migration and UI feature a tightly coupled release.

**No separate DB testing platform** will be created. After designer approval and a coordinated production push, test on the *existing live test campaigns*. This is not verified by GitHub CI.

## Manual multiplayer acceptance

- Two connected players open a party-shared inventory; player A drags Rope, player B drags Potion, both see immediate local movement and peer changes; neither overwrites the other. Open item details and edit Quantity; other player sees greyed/locked icon.
- Try to interact with an occupied item; the client must block it, and direct unauthorized RPC/REST update must be refused. DM clicks "Take" and gains exclusive edit ownership; previous holder loses authority and receives an error if trying to commit.
- Close inventory editor, switch tabs, refresh page, disconnect network and leave an item mid-drag; each claim clears by release or expiry. Reconnect and verify one authoritative position, no disappeared items.
- Repeat on player character inventory, DM character editor, NPC token sheet, Bestiary template, pack mule; include legacy items originally lacking UUIDs.
- Change a character's HP while another viewer moves its inventory item; both changes must persist. Cast an attack/spell immediately after editing and verify the latest committed values are used.
- Verify no Save button is needed for any sheet or item details; no data lost when closing after an edit or when a write fails. Noninventory sheet edits appear on other clients on refresh/realtime reconciliation.
- DM tab categories show the correct tools; selected tab does not reset existing settings. Weapon-roll header matches the height and alignment of spell/macro rolls and retains attack/damage/critical results.
- Review Postgres/RLS permissions and inspect Realtime publications; ensure private NPC/DM-only sheet information is not exposed to players.

**Rollback considerations:** remove new RPC and lease table triggers/functions in a scoped reviewed rollback if necessary. Revert front end in a coordinated rollout. Tool entry UUIDs can harmlessly remain in existing JSON; do not drop real inventory data.
