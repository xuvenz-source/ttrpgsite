# DM map pins, party Handouts and folders

**Branch:** `stage/map-pins-handouts-folders-2026-11-07`
**Status:** staged frontend and unapplied database SQL candidate; **not deployed**.

## Core workflow

In **Units → Handouts**:

- The DM can create a saved text handout (title, note contents and folder), edit it in a draggable native dark window, delete it, reveal/hide it from the party, and create/rename/delete folders. Removing a folder moves documents to **Unfiled** rather than deleting them. Drag-and-drop between folder headings moves documents.
- Handouts and folders are **campaign-wide**, not bound to a single character. Once a note is revealed or collected it appears for the entire party.
- Players see only their party's **revealed** saved handouts and only folder names containing such handouts. They can open/close the note from this subsection. Hidden drafts and empty secret folders are not transmitted as library results.
- Each handout can also be placed as a **map pin**. Click **⌖** on the saved handout; the DM's Light Layer switches to **Place handout pin**. The next map click positions one pin (then reverts to Select). Alternatively choose **Place handout pin** in DM Map setting and select the saved handout.
- Map pin kinds cover **note, signpost, engraving, book and clue**. DMs see hidden pins as muted/dashed; map players see only pins explicitly made visible. Clicking a pin opens the note; a DM can edit it and toggle **Visible on map** / **Players can pick up**, change the pin icon, move it by dragging in Select/edit mode or remove it without deleting the underlying handout.
- A player clicking a visible collectable map pin can select **Pick up · Save to Handouts**, permanently recording `collected=true` and `revealed=true` for the **whole party**. The map pin is not automatically removed, allowing a signpost to remain on the board; the DM may delete/hide it.
- Hiding a previously revealed handout from the party library also hides its pins, preventing the same visible pickup from immediately undoing the DM's revocation. A DM can separately keep an otherwise uncollected handout off the library while displaying a pin on the map; viewing an exposed pin is deliberate map-level disclosure.

## Security model

Three private tables and a sanitized revision notification table are defined in the staged SQL candidate:

- `campaign_handout_folders`: DM-only writes. A player may read a folder only if it contains a revealed document in the same campaign.
- `campaign_handouts`: titles/body/visibility/collection. DM-only writes. A player can read a document only if it has been revealed, **or** a visible pin linked to it exists on a map that player is allowed to access. Players' Handouts query explicitly filters to `revealed=true`, so exposed-but-uncollected map notes do not prematurely appear in saved Handouts.
- `campaign_map_pins`: DM-only writes with handout/map same-campaign and map-bound validation. Player SELECT is restricted by both `visible` and `can_view_campaign_map`. Note IDs have no other browser-readable secret metadata.
- `campaign_handout_events`: campaign-id and revision counter only. **Only this table is published through Supabase Realtime.** No raw note text, hidden-pin coordinates, folder names or private draft metadata are broadcast. Authorized clients re-fetch RLS-filtered snapshots after each revision tick and when returning to an active browser tab.
- `collect_campaign_map_pin(uuid)`: authenticated function with explicit campaign membership, map permission, visible/pickup flags and a pin row lock. It is the **only player write path**. Normal clients have no direct UPDATE/INSERT rights to handouts or pins.

The app invalidates cached open player notes when permission is removed or live note loading fails. An unrevealed document pinned visibly to a player-accessible map is readable on that map by design.

**Fog-of-war dependency:** While authoritative player fog/collision remains unimplemented (Issue #23), a player with access to a map may see all intentionally visible pins on that map. When fog is implemented, pin queries and rendering must also respect the player's server-authorized visible area; do not claim proximity or line-of-sight protection in this batch.

## Rollout: existing live Supabase only

Follow the designer's **live database testing** standard, not a separate test platform. This change does not request or create paid Supabase branches, test databases, preview environments, recurring jobs, new storage buckets or paid deployments.

SQL is **not applied**: `staging/sql-candidates/campaign_pins_and_handouts.sql`. It must be reviewed, converted into an official migration using the available Supabase CLI during the authorized release, then applied to the existing live database before publishing the matching frontend. No implicit production changes or deployment authorization.

### Live acceptance checks (after explicit approval)

1. With DM, player A and player B in existing test campaigns, create a hidden draft and secret folder; confirm neither player can see them via Units, raw REST, Realtime subscriptions or direct UUID guesses.
2. DM reveals handout; both players see it in Handouts and the correct folder. Rename/move/delete a folder and verify notes are preserved.
3. Pin hidden handout to a map. Neither player sees it until DM reveals the pin. Both can click to read the note but it does not yet appear in saved Handouts.
4. One player **picks up** the note: it immediately appears in both players' Handouts and survives reconnect/reload/map switching. Both receive the same document; no duplicates.
5. DM hides revealed note: map pins turn hidden, player windows close when refreshed and raw API read is denied if no other intentionally visible pin exposes the same note.
6. DM drags/repositions pin at different zooms, changes its type, disables collection, and deletes a pin; the underlying handout and folders remain intact.
7. Validate a player cannot edit/reveal/delete handouts/pins, add folders or collect a hidden/non-collectable pin, even with forged REST/RPC requests. Check cross-campaign IDs and unauthorized private maps.
8. Inspect normal performance on existing Supabase/Vercel Free with two players, and avoid accidental production secrets in test notes.

Any issue found in live is fixed in a reviewed, approved subsequent patch. Keep basic rollback instructions for schema/policies available before applying. GitHub CI and Vite builds are staging checks, **not** proof of live database correctness.

## Other open PR compatibility

The separate Units → Tools staging PR #25 also introduces a Characters/Tools subsection. This branch starts from `main` independently and introduces Characters/Handouts. At release, explicitly integrate **Characters / Tools / Handouts** together rather than accepting one branch's two-tab implementation and inadvertently dropping the other's UI. Do not merge other unapproved staged features to resolve this conflict automatically.
