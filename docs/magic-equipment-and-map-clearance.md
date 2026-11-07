# Staged batch: map hotbar clearance, optional magic resources and equipment

Branch: feature/compact-tabletop-ui. Production is intentionally unchanged.

## Battlemap
- Macro hotbar container is visually transparent; individual slots retain faint
  backgrounds and full pointer/drag controls.
- While the hotbar is shown, the battlemap scroll contents include exactly 78px
  of transparent bottom clearance below the image. Hidden hotbar = no extra space.
- Selecting a token auto-scrolls into the visible area above the hotbar, rather
  than under its overlay.
- This does not resize, translate or recalibrate the image, grid or tokens.

## Optional magic dashboard
- DM sheet builder: add Magic resources dashboard field, or click + Magic dashboard
  in an existing tab (e.g. Spellbook).
- DM chooses whether to display tiered slots, traditions/metrics and resource pools.
- Tiers are customizable (default 1-9) with Used/Max per character; optional
  calculated Max formula per tier.
- Traditions have arbitrary names and DM-defined tracked values, editable per
  character or automatically calculated via shared/per-tradition formulas.
- Pools have Used/Max plus recharge description and an optional Level value.
  This supports point/charge systems and high-level shared pact-slot systems.
- Simple safe numeric expressions: e.g. floor(@{level}/2), max(1,@{int_mod}+1).
  No eval or arbitrary scripting. Configuration lives in sheet_template JSON;
  individual character/NPC values live in existing field_values/npc_values JSON.

## Optional Equipment tab and armour
- DM sheet builder: + Equipment tab creates a new Equipment tab and its Equipment
  & defence module. A field type is also available to place the module anywhere.
- DM configures category names, one-base-versus-additive equipment roles,
  full/capped/disabled attribute bonuses (including negative modifiers),
  unarmoured base score/rule, proficiency and attack attribute references.
- Sample categories: Light (full), Medium (positive cap 2), Heavy (none),
  Shield (additive), Other (additive). All are editable or removable by the DM.
- Character sheet shows live calculated defence, equipped items, bonuses,
  configurable melee/ranged weapons, hit modifiers, damage dice, crit dice,
  damage types and roll buttons.
- Calculated score is displayed in the equipment panel. It does not silently
  overwrite a separate AC field. DM may choose a linked attribute for the
  calculation; a future enhancement could add explicit output-field syncing.

## Release / QA
- No database migrations required; new modules use existing flexible JSON columns.
- Check optional feature visibility, design/rename/delete and template saving.
- Verify Light/Medium/Heavy custom rule effects with positive and negative
  linked modifiers; equipped shields and other accessories stack correctly.
- Verify unarmoured base when no base armour is worn, and highest base equipment
  when multiple base pieces are worn.
- Verify weapon hit/damage/crit and that a player's edits survive reload.
- Verify point, slot-tier and pool-level tracks, formula errors and recharge notes.
- Pan/scroll to bottom with hotbar shown, then hide it and confirm extra scroll
  disappears. Check keyboard movement and mouse-drag at every map zoom.
- Confirm all features work in player, DM character and NPC sheet editors.
- Verify no regressions to existing repeating spellbook, macro builder, and
  status-icon placement from prior staged commits.
