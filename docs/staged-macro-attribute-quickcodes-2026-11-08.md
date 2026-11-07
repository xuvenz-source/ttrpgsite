# Staged macro insertion and quickcode resolution — 8 November 2026

**Branch:** `stage/player-sheets-token-artwork-fog-2026-11-08` · **PR:** #42 (same consolidation)
**Status:** Staging only; **no Supabase production migration or Vercel deployment**.

## User-facing fixes
1. Selecting a sheet attribute now creates `1d20+@{dexterity_mod}`
   from `1d20`. If the user already typed `+` or `-`, the editor honors
   that operator rather than appending a second sign. Empty formulas accept
   standalone references.
2. Linked Attack macros now expose **+ Insert sheet attribute** and
   **+ Insert sheet quickcode** controls for **To-hit**, **Damage**, and
   **Extra damage on crit**. Standard Dice/Number cells share the same UI.
3. References such as `1d20+=@AC`, `1d8+=@STR`, or `=@AC` evaluate
   using the **current selected sheet** when the macro runs; no client-supplied
   numeric dice outcomes.

## Security/persistence
The private SQL helper `public.resolve_tabletop_macro_quickcodes` calls the
existing `public.token_reference_value` to calculate configured quickcodes.
It is used only inside the SECURITY DEFINER `run_tabletop_macro` function,
**after** owner, campaign membership, source visibility and DM permissions
are checked. It refuses sheetless macros, unknown quickcodes, nonnumeric
results, fractions, values outside ±10000 and overlarge formulas.
The original `public.roll_spell_expression` evaluator still validates the
resulting expression; it has not been weakened or replaced. The helper
EXECUTE privilege is revoked from public/anon/authenticated.

## Deployment dependencies
- Migration `20261108033000_player_owned_token_artwork.sql` (previously staged)
- **Then** `20261108043000_macro_quickcode_resolution.sql` (new)
- **Then** one bundled Vercel production merge and deployment when explicitly
  approved by the designer. No new Edge Functions, extensions or paid resources.

## Verification
- Node unit tests for + insertion, preserving existing operators, standalone
  references, invalid input, and both attribute and quickcode dropdowns.
- SQL release tests verifying the private helper, existing run-time authorization,
  all five macro roll paths and original critical/advantage logic.
- Final GitHub tests + build + CodeQL scan.
- Actual authenticated quickcode runs require tester-led live tests when
  deployment is approved, including negative values, equipment AC, unknown
  or nonnumeric quickcodes and player-vs-DM NPC sources.
