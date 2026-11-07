# Universal roll-button hotbar drag — staged only

No Vercel preview, production deployment, Supabase/Edge Function write or paid test infrastructure is authorized by staging. This branch is based on the previous pending seamless-movement branch and is registered in the consolidated release ledger; do not omit older outstanding staged work.

## User interaction
Every available Roll, Attack, Save, or initiative button can be dragged directly to one of the eight personal campaign hotbar slots. Drop replaces that slot, clicking the source button still rolls normally, and pressing the hotbar's bound key still executes the shortcut. The existing saved macro/spell drag, reorder and drag-outside-to-remove flows stay intact.

Supported button surfaces:
- Player sheet and DM character editor custom sheet Roll fields
- NPC token and Bestiary sheet Roll fields
- Weapon **Attack** buttons in Equipment (rolls two attacks plus damage and critical using `roll_equipment_weapon` with current saved weapon stats)
- Attribute saving throws, proficiency checks, and arbitrary repeating-collection Roll actions
- Spellbook Cast, Attack, Healing, and Damage buttons (uses `cast_collection_spell` with the matching mode)
- DM combat setup / shared Turn Order individual initiative and unrolled-NPC roll buttons (existing RPCs)
- Saved Macro Builder **Run macro** button (uses the existing saved-macro drag protocol; unsaved or modified drafts must be saved first)

The hotbar saves validated references, not a frozen numeric bonus, for sheet/proficiency/weapon/spell shortcuts. On activation, the current authorized sheet values are read; deleted fields, entries, spells and weapons fail rather than silently rolling stale values. No private sheet values enter the drag payload.

## Release compatibility and security
- New commands fit into the existing personal `tabletop_hotbars.slots` JSON; no schema migration needed for this feature.
- Server RPCs for weapons, spell casting, rolls and initiative remain the permission/collision/validation authorities.
- The source character is owner- or DM-accessible only; NPC sheet shortcuts are DM-only. Never interpret drag data as trusted.
- Preserve existing `/roll`, `/macro`, `/builder`, `/spell`, `/say`, `/em` commands.
- Preserve the previous staged movement fix and the older staged player-sheet/artwork/macro fixes in one approved consolidated release.

## Manual acceptance (existing live test campaigns after designer approval)
Run a player + DM session. Drag one weapon attack, attribute save, proficiency, spell cast, spell attack, damage, healing, custom collection roll, ordinary Roll field, NPC attack and initiative onto distinct hotbar slots (replace slots as needed). Verify clicking and keyboard execution match the original button's result layout and access rules. Edit weapon dice and proficiency/attribute ranks, save, then verify the shortcut uses the new values. Test deleting a referenced weapon, entry or field; shortcut must fail safely. Confirm moving assigned slots, dragging a slot away, shortcut persistence after refresh, switching characters/campaigns, different map assignments and pop-out windows. Confirm a player cannot forge another player's source or DM-only NPC shortcut. Run CI/build before approved release. Do not create a paid test database.
