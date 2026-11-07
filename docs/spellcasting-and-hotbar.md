# Staged spellbook casting and hotbar links

Part of `feature/compact-tabletop-ui` — **NOT YET IN PRODUCTION**.

## New behavior
- Existing and newly created Spellbook preset fields detect `cast_spell` automatically.
- Cast Spell performs a single authenticated server RPC `public.cast_collection_spell`, reading the actual saved spell (damage dice, attack bonus, saving stat/DC, healing dice, description, and effects).
- Roll Damage, Roll Healing and Spell Attack use their respective saved spell data rather than hardcoded template formulas.
- Mixed dice expressions such as `2d6+1d4+3` and `@{damage_bonus}` numeric references are supported and rolled server-side.
- A single compact chat card includes whichever sections are enabled for that spell. **Show when cast** checkboxes for Description, Attack, Save, Healing, Damage and Effects appear inside each expanded spell. They are saved with each individual spell entry, not globally.
- Existing spells without checkbox values default to showing configured attack, damage and healing, but hide lengthy descriptions, saving throw details and effects until their boxes are enabled.
- New **+ Hotbar** button assigns the spell to the first empty slot; if full, drag the small ⠿ icon onto a slot to replace it. Drop onto any slot to assign or overwrite. Slots retain their 1–8 keybindings.
- Hotbar stores `/spell <source> <id> <collection> <entry>` so casts pick up **current saved spell dice** even if the user edits the spell later.
- DM character and NPC editors save dirty draft values before casting or assigning. NPC token and NPC template casting are DM-only.
- Generic repeating collections, existing /roll, /macro, /say, /em and current hotbar settings remain supported.

## Required release migration
`supabase/migrations/20261106_spellcasting.sql` must be applied **before** the frontend is released.
It expands `chat_messages_kind_check` to allow `kind='spell'`, and creates
`public.roll_spell_expression` (no public execute grant) and
`public.cast_collection_spell` (authenticated only; checks campaign role and source permissions).
The new chat card is stored in the existing `chat_messages.result` JSONB; no new tables are needed.

## Manual release QA
1. Set Fireball damage to `8d6`, enable Damage and Save checkboxes, set DEX save DC, cast; verify one spell card with actual 8d6 result and save DC.
2. Switch damage to `3d8+1d6+2` and immediately cast after typing; verify the just-edited value is persisted before the server cast.
3. Enable Description and Effects only; confirm chat displays that prose and omits disabled sections.
4. Save a spell in the DM character editor with unsaved changes; casting should persist those edits first and leave the sheet open.
5. Add to first empty hotbar slot; click and press slot key, verify same spell is cast from saved data.
6. Drag the spell handle onto an occupied hotbar slot; verify slot replacement, persisted after reload.
7. Check damage-only/healing-only buttons and missing/invalid dice errors without a blank screen.
8. Verify normal chat, dice rolls, player-controlled casting, denied NPC casting for players, and DM NPC casting.
9. Validate spellbook entries survive character sheet and template save/reload; generic collections unchanged.

## Notes
Spells are posted as informational/rolled cards only; spell slots, concentration duration, and target saving throws are not automatically enforced.
