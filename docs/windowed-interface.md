# Windowed tabletop interface — staging notes

This change is staged on `feature/token-status-markers` together with the
token-status feature. It has **not been deployed to production**.

## Release order
1. Apply `supabase/migrations/20261106_token_status_effects.sql` (the status feature prerequisite).
2. Apply `supabase/migrations/20261106_ui_scale_preferences.sql`.
3. Merge and deploy the feature branch in one release after the database migrations.
4. Perform browser testing with DM and player accounts.

## Window behavior
- Personal character sheet opens as a **draggable, resizable floating window**;
  battlemap stays rendered and visible behind it.
- DM player-character and NPC editors, quick token adjustments, and status-effect
  selection share the same title-bar drag convention.
- Click/drag a title bar to reposition; corner resize grip adjusts dimensions.
- Clicking away does not dismiss a window or dim the map. Close from the title
  bar; unsaved DM/NPC sheet edits retain their existing close confirmations.
- Map Library and Sheet Designer remain full-page workspaces with a
  **Return to Game** action.
- Separate portrait/artwork editors remain existing focused dialogs.

## UI scale
- Settings → Interface size: **80%, 90% (default), 100%, 110%, 125%**.
- Saved on the user's `tabletop_user_preferences.ui_scale` row.
- Scale changes menu fonts/controls and the side panel/window proportions.
- Battlemap calibration, grid sizes, map zoom and token dimensions are untouched.

## Quick-adjust initial values
- Window appears immediately with locally available sheet / token monitor / 
  previously fetched values.
- Background RPC merges current server values only into fields not yet
  touched by the user. Edits are never wiped by a late read.
- +/- controls wait until their numeric baseline is known, preventing
  unknown HP from being mistaken for zero.
- Apply continues to use the optimistic, batched server write.

## Acceptance checklist
- Open a character sheet with C or Units; pan/inspect the map with the sheet open.
- Drag each window by its title bar; resize it; check a narrow screen.
- Open several DM monster sheets/quick-adjust pickers in succession.
- Ctrl+click a token on first access; observe immediately rendered fields;
  rapidly type a value before the server response and verify it is preserved.
- Verify a DM and player see only the quick attributes permitted by RLS.
- Verify multiple resource updates and failure rollback still work.
- Check UI scale persistence across reloads, 80/90/100/110/125 settings,
  and ensure neither map tile count nor token footprint changes.
- Check keyboard movement and hotbar shortcuts while window inputs are focused.
- Recheck spellbook repeating collections from the previous staged changes.
