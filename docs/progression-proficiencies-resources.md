# Staged: class-neutral advancement, proficiency and personal resources

Branch: feature/compact-tabletop-ui. Not deployed to production.

## Sheet builder (DM)
- Add Class levels & progression field, Skills & proficiencies field, or
  use the + Advancement tab preset to add both linked modules together.
- DM defines custom advancement path/class names and the casting ability
  associated with each path (e.g. Intelligence score or an already-calculated
  casting modifier). No class names are hardcoded.
- DM configures proficiency-bonus milestones by total level, attribute-score
  calculation (default floor((score - 10)/2)), DC starting value (default 8),
  and the four result references.
- DM defines grouped skill/save/tool proficiency entries and which attributes
  supply their modifiers. A DM may mark proficiencies automatically granted
  by any advancement path with at least one level. Players can also select
  None, Half, Proficient or Expert; automatic grants set a floor of Proficient.
- The optional earlier Equipment module can now interpret attributes as
  raw scores or direct modifiers for armour and weapon calculations.
- The template uses existing campaign sheet_template JSONB and user field_values;
  no new tables or permissions are required.

## Character sheet (player and DM)
- Player enters class levels; the sheet automatically totals levels and
  derives proficiency bonus from the DM's thresholds.
- Choose active casting path; the sheet displays each path's individual
  casting modifier and spell save DC, plus the active DC and attack modifier.
- Editable proficiency ranks calculate their skill/save bonus immediately.
- All character/NPC sheet editors now include a permanent Resources tab.
  Any player may add up to 60 personal named resources with Current, Max,
  recharge type (none, short rest, long rest, daily or custom), notes and
  +/- / refill buttons, without DM template edits. Stored in reserved
  __personal_resources in their existing field_values.
- Saving character or NPC edits materializes calculated numeric references in
  field_values/npc_values, so server dice and macros can use them.
- Default output IDs: level, proficiency_bonus, spell_save_dc and
  spell_attack_bonus; DMs can customize the output IDs in the designer.
- Score fields configured for automatic score conversion also produce a
  numeric <field_id>_mod result, for example wisdom_mod.
- Per-path DC and per-proficiency bonus IDs are included in the macro field
  picker, allowing class-specific combinations.

## Spell integration
The existing staged spellcasting migration (not yet applied) has been updated
to use the character's active spell_attack_bonus and spell_save_dc as
fallbacks if individual spells do not override those values.
A spell saving-throw target ability still belongs to each spell, as expected.
Character edits are saved before casts via the existing queue.

## Limitations / planned follow-ons
- DMs may assign an automatic full proficiency by class path. More elaborate
  level-specific feat, expertise, subclass and multiclass prerequisites are not
  automated in this first version.
- Custom personal resource recharge describes the rule and provides a
  manual Refill action; automated rests and resource consumption are not
  enforced.
- Derived fields are recalculated on sheet edits/saves. Existing characters
  using newly added progression modules will need one edit/save before new
  computed references are persisted for server macros.
- Attribute representations are chosen by the DM for each relevant component,
  since systems differ between raw ability scores and precomputed modifiers.

## Release test cases
1. Create a DM advancement tab with two paths using different casting attrs.
2. Add levels in both paths; verify cumulative proficiency thresholds, active
   and per-class save DC, attack bonus and score-based attribute modifiers.
3. Check skill proficiency 0, half, full and expertise, including negative
   ability modifiers, then roll.
4. Build a macro with @{proficiency_bonus}, @{wisdom_mod},
   @{spell_save_dc} and a specific skill bonus; confirm saved results.
5. Create, edit, refill and remove personal resources on player and DM sheets,
   reload and verify values persist per character.
6. Test existing Equipment light/medium/heavy with score vs modifier mode.
7. Verify spell casting uses automatic active DC/attack bonus when no spell
   override exists, while preserving explicit spell overrides.
8. Test character, NPC token/template editors and that players cannot edit
   the campaign template.
9. Verify existing spellbook, status markers, tokens, chat and macros continue
   to function. No existing data should be removed.
