# Sidebar, characters and private map batch — release checklist

**Current state:** Git commit objects only. No branch moved; no Vercel production or preview build triggered by this batch. No new database migrations applied.

**Base:** feature/weapon-attack-cards @ 158aee9444d604c302c138ba101ce04c35f6fb40.

## User-visible changes
1. Settings > Macros contains Macro Builder and Hotbar Settings.
2. Settings > UI contains View & Zoom and Interface Size.
3. DM > Bestiary & NPC templates no longer uses the bear SVG icon.
4. Characters sidebar tab manages multiple character sheets. The selected sheet opens its own Token Library. Units groups by character and no longer has global sheet/library buttons.
5. DM > Map management assigns each player to Party default or a specific private map. Players see only the map assigned to them; DM sees all. Private map tokens, map artwork and chat (including server-generated rolls) must be restricted through RLS and RPC checks.

## Mandatory SQL migration order
Earlier pending branch migrations must be applied *before* this batch, explicitly in this order:
1. `supabase/migrations/20261106_weapon_attack_cards.sql`
2. `supabase/migrations/20261106_token_reference_codes.sql`
3. `supabase/migrations/20261106180000_multiple_character_sheets.sql`
4. `supabase/migrations/20261106180100_private_player_maps.sql`

The first two files are inherited from the earlier feature branch and still use legacy short filename versions, so **do not rely on automatic file-name sorting for the full release**. Apply their SQL before the two uniquely versioned migrations and record successful migration versions. Never deploy the new frontend before migrations.

## Pre-production verification
- Test (without changing live data) build compilation and responsive sidebar layout.
- Test two characters under one account, switching sheets while autosaves are pending, and choosing separate portraits/tokens.
- Test linked tokens for two different characters owned by the same user; ensure DM token editor resolves the correct character.
- Test reconnecting/rejoining a campaign never adds unwanted default character sheets.
- Test two users on separate maps, and DM seeing both. Try forbidden database API reads of other map rows, file access, map tokens, chat messages and token monitors.
- Test typed chat, /roll, macro runner, spell cast, weapon attack and =@ reference are restricted to the participant's map.
- Test moving a player to a private map and back to Party default during a session; check real-time map refresh and token move permissions.
- Test map deletion and reassignment, confirm chat does not become cross-map visible.
- Compare deployment SHA against merged commit and perform authorized release only after explicit user approval.

**Known limitation:** A real two-account security test and Vite build have not been executed in this staging-only pass. No Supabase schema has been changed.
