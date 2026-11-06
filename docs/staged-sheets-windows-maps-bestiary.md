# Staged follow-up: sheets, windows, maps and Bestiary

**Staging only.** Builds, preview deployments, production branch references and
live Supabase data have not been modified for this batch.

This continues the previous unpublished inventory / Sheet Quickcode / Discord
batch. Its final staged commit is the parent of this document.

## User-visible changes

1. **New character sheet monitor refresh:** On character creation and map token
   placement, resource overlays refresh without reloading the site. DM edits,
   player saves and selected token changes also trigger monitor refresh. A
   websocket broadcast contains no private character sheet values; each client
   fetches only monitor data permitted for their map.
2. **Sheets in separate browser tabs:** Units offers a ↗ action beside each
   permitted character. Player and DM sheet windows also have a New tab
   button. The link carries only the campaign and character UUIDs; the tab
   uses the existing signed-in account and RLS to load the sheet.
3. **Independent, non-blocking windows:** Personal token library and token art
   studio no longer create screen-wide dimming backdrops. They use draggable,
   resizable FloatingWindow layers with global click-to-front ordering;
   the tabletop continues responding to pointer input in exposed areas.
   Their initial positions are offset so sheets remain accessible.
4. **Centred battle maps:** Smaller maps have automatic horizontal centring.
   Larger maps open with initial horizontal and vertical scroll positions
   centred, without changing the user's later pan or wheel-zoom position.
5. **Bestiary trigger error:** The NPC trigger now distinguishes
   `npc_templates.folder_id` from `npc_folders.parent_id`, eliminating
   `record "new" has no field "parent_id"` when inserting NPC templates.
6. **Instant DM-controlled player map transfers:** A dedicated realtime
   listener survives a selected map change. DM assignments notify just the
   targeted player, while publishing the party default notifies followers of
   the shared map. A separate **Move entire party here** action atomically
   resets private overrides and moves every player. Routing broadcasts never
   include private map identifiers: recipients refetch their RLS-authorized
   map from Supabase and adjust the viewport automatically.

## Additional, still-unapplied migrations

Apply after earlier batch migrations in this order:
- `20261106200300_npc_structure_trigger_fix.sql`
- `20261106200400_move_entire_party_map.sql`

Both passed roll-back-only Supabase checks. The Bestiary check inserted
and modified an NPC template and folder in a transaction, then rolled it
back; the party-map function passed permission checks and a DM-context
transactional route/override test. No migration was applied.

## Before publishing this combined batch

- Build with `npm run build`, run `node --test tests/*.test.mjs` and
  perform authenticated two-player + DM browser tests. The staged Git objects
  have **not** been compiled in CI and have not been deployed to Vercel.
- Confirm creating/placing an owned character immediately renders HP bars,
  globes and quickcodes; DM changes and another player's changes propagate
  through realtime without reloading.
- Open multiple sheets in browser tabs, sign out and confirm an unauthorized
  sheet is not exposed. Avoid concurrent editing of the *same* sheet until
  optimistic multi-tab conflict handling has been separately verified.
- Open token library and art studio while a sheet is open: click each to
  raise it and continue panning/selecting the exposed map.
- Try maps smaller and larger than the available viewport, zoom controls,
  panning, and map changes; ensure neither hotbar nor overlays hide map content.
- Create an NPC template in the root Bestiary and inside a folder, then
  edit/move it. Confirm no `parent_id` trigger errors.
- With 1 DM + 2 players online, publish a shared map, move one player to
  a private map, then move the entire party; confirm both changes are
  immediate, private maps remain private, reconnects reconcile correctly,
  and no manual reload is needed.
- Migrations **must** be applied before the new frontend is released.
