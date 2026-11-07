# Staged gameplay refinements — 7 November 2026

**Branch:** `stage/sheet-ruler-env-delete-tools-pins-2026-11-07`
**Production:** no production changes, no Vercel previews, no Supabase writes; the staging branch is source plus free GitHub CI.
**Release dependency:** the pin-icon CHECK expansion candidate under `staging/sql-candidates/campaign_pin_icon_expansion.sql` must be reviewed and deployed **before** the matching frontend is released, by explicit designer approval. Existing pin data remains valid.

## Changes

1. Character editor directly requests an authenticated popup window, with no intermediate New tab action; unsaved edits must be saved before transferring to pop-out. The already popped-out sheet suppresses another Pop out button. Browser settings can still present popup requests as tabs.
2. Left-drag ruler retains its original pointer while chorded right presses add successive snapped turns; total length reflects all legs. Right-drag alone still pins ruler measurements.
3. Delete on a selected light-layer wall, door, window or light removes the map environment object, unless the layer is locked or the editor is inactive. Focussed form inputs remain protected.
4. Tools use the same marquee, bounded mixed-group drag, optimistic locally updated position and private map Realtime movement path as characters. Delete for a selected issued tool **picks it up** (map_id cleared) without deleting its issuance, inventory, configuration or access rights. Personal tool previews are validated by visible issuance/DM permission; final positions remain authoritative in the database.
5. The editable environment SVG previously overlaid the pin placement button (z-index 24 over 12). Placement mode now raises pins above the environment editor, and DMs select from 12 pin kinds, including pin, arrow and trap.

## Manual live acceptance after authorized release

- Test DM opening a player sheet directly from the in-app editor and own sheet from Units; verify popup blockers, unsaved edits and a single sheet window.
- On map ruler, hold left and tap right at three different bends, release left, verify summed ft and remote line; standalone right-drag still pins, Clear removes immediately.
- Select light, wall, window and door in the editable light layer and press Delete; ensure a focussed field never loses contents and locked layers cannot delete.
- As DM and player, drag a torch and pack mule alone, then marquee-select character + tool and drag from either; verify immediate local movement, group clamping and remote visibility. Pick up with Delete; verify inventory and issuance survive. Verify a player cannot select another player's private tool.
- Place hidden pin on DM map, select the pin icon, display it, reveal/hide, let player click and pick up and verify it enters party Handouts; repeat with arrow and trap. Verify that an unauthorized player sees neither hidden pin nor handout text.
- As per the project's testing policy, database validation happens using existing live **test campaigns** only after an explicitly authorized release. No paid database staging or hourly service is required.
