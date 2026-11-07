# Staged batch: one-click weapon attacks, DM reference codes, hotbar clearance

Branch: feature/weapon-attack-cards
Status: STAGING ONLY. Do NOT deploy the frontend ahead of the SQL migrations.

## Weapon attack button
- Every equipment weapon row has one "🎲 Attack" button, instead of Hit/Dmg/Crit.
- One server RPC roll_equipment_weapon rolls two independent d20 attacks (Normal
  and Advantage), rolls the configured damage once, and adds one Crit row with
  extra configured crit dice if either natural d20 meets or exceeds Crit on.
- The attack bonus uses the currently saved linked attack stat, ability-score
  conversion when configured, linked proficiency, weapon magic and hit bonus.
- The damage roll uses configured weapon dice, damage bonus, magic and
  optional attribute modifier. The critical roll is additional dice, without
  automatically doubling base damage. Crit thresholds are limited to 1–20.
- Each execution inserts exactly one kind=macro chat message using the
  existing compact multi-row MacroChatCard and hover dice maths.
- Critical attack results show green in chat and weapon cards use a green title.
- The button works in the player sheet, DM character editor and DM NPC editors.
  Dirty editor values are saved before calling the server. The main player
  sheet flushes its optimistic autosave queue before invoking the RPC.
- Errors show inside the equipment section, without blanking the screen.

## DM-defined reference codes
- DM tools > Token settings & resources > Token Display Designer >
  Reference codes (collapsed by default).
- DM creates a unique code such as =@AC and gives it a label.
- Sources: normal numeric field, numeric current value of a Resource field,
  calculated numeric output (e.g. proficiency_bonus), or the live defence
  total of a configured Equipment module.
- On the token bubble/globe designer, select the code under Custom reference
  codes or type the code into Manual field ID. The existing visibility
  restrictions apply (owner/DM for private character monitors, DM-only for
  private NPC monitors, unless explicitly made public).
- In campaign chat, select a token you own (or any token as DM) and send
  exactly =@AC. The server obtains its current saved value and writes one
  compact text message ("Token name · Armour Class: 16"). This does not
  expose another user's private character values.
- The equipment defence calculation matches the prior frontend calculation,
  including score-to-modifier conversion, highest worn base armour,
  additive equipment, unarmoured base and miscellaneous bonuses.
- On the active player's sheet, linked monitor bubbles change immediately
  on local edits; the server and realtime listeners catch up.
- Code is stored inside campaigns.token_display_config.references. No new
  database tables are required. Codes are case-insensitive in chat.
  Codes are uppercase in the designer for consistent bubble linkage.
- There is no need to use the notation in Dice /roll expressions in this
  version; those continue to use @{field_id} from the sheet and macro system.

## Hotbar / map
- Raise translucent hotbar 11px (bottom 9px -> 20px) so its slots clear
  the horizontal map scrollbar.
- Keep the existing map-bottom scroll allowance at exactly 78px.
- No changes to the map calibration, token positions or viewport dimensions.

## Required migrations (apply in this order before frontend deploy)
1. supabase/migrations/20261106_weapon_attack_cards.sql
2. supabase/migrations/20261106_token_reference_codes.sql

No SQL is applied to production as part of staging. Execute migrations before
merging to main to prevent clients calling unavailable functions.

## Pre-production / release QA
- Perform one attack from a saved weapon: two independent attack totals and
  damage on one chat card, with hover breakdowns.
- Force Crit on to 1 temporarily on a test weapon; verify extra crit dice
  are posted and the original weapon threshold remains unchanged afterward.
- Try a non-critical attack and verify no Crit row.
- Edit attack bonus/damage dice just before clicking Attack; verify new values
  are used after the automatic save, including in DM/NPC editors.
- Configure =@AC linked to equipment defence. Verify chat and token bubble
  show the same current total when the character equips/unequips armour.
- Verify ordinary numeric references, resource current values and derived
  numeric proficiency references. Test privately visible player/NPC monitors.
- Verify players cannot submit =@AC for someone else's token or execute an
  NPC weapon attack as non-DM. Verify anonymous users cannot call RPCs.
- Scroll the map all the way to the bottom; hotbar clears the scrollbar
  without altering the blank bottom scroll space. Check narrow screens.
- Verify spell and macro chat cards, old /roll and hotbar commands still work.

## Staging checks
- Weapon attack SQL was compiled/executed in a rolled-back transaction with
  a guaranteed critical result and 3 rows.
- Reference SQL was compiled/executed in a rolled-back transaction with
  =@AC resolving to the same equipment value (16) in token monitor and chat.
- Neither test modified live campaign state or history.
