# Staged: visual multi-roll macro builder and compact roll maths

Branch: feature/compact-tabletop-ui. NOT DEPLOYED TO PRODUCTION.

## Player workflow
Open Settings > Macro Builder > Open Macro Builder. The builder is a floating,
non-modal and resizable window over the tabletop.

- Give a macro a title and subtitle (e.g. Bobby / Swipe).
- Choose a source: no sheet, your character, or (DM only) NPC template/map token.
- Add up to 12 labelled rows with up to three independently rolled results or
  labelled text notes per row, max 18 roll cells across the macro.
- Use expressions like 1d20+3, 1d8+2, 2d6+1d4+3 and @{wisdom_mod}.
- Insert sheet attribute references without manually typing their IDs.
- Rearrange rows, edit the live layout preview and save to your campaign.
- Run the macro, add to the first free hotbar slot or drag it onto a slot to replace.
- Macros use /builder <uuid> internally for resilient hotbar references.
- Chat /macro <name> also finds saved personal macros, falling back to
  the older sheet-template macro of that name when no personal macro matches.

## Chat display
- One macro execution becomes one kind=macro chat message, with title, subtitle,
  labelled rows, and multiple values in each row.
- Hover or keyboard-focus any rolled value for expression, individual dice,
  modifier, kept result (where relevant) and total.
- Hover maths apply consistently to ordinary rolls and spell rolls.
- Tooltip is rendered in a viewport portal outside chat overflow.

## Database release order
1. Apply supabase/migrations/20261106_spellcasting.sql.
2. Apply supabase/migrations/20261106_visual_macros.sql.
3. Merge the staged branch to main and deploy the complete frontend once.

public.tabletop_macros stores campaign-scoped, user-owned macros with RLS.
public.run_tabletop_macro re-reads saved definitions and current sheet values,
checks campaign ownership and source permission, validates safe formulas,
rolls on the server and inserts a single message. The browser never provides
authoritative outcomes.

The migration and an authenticated multi-row execution have been dry-run with
rolled-back transactions. The production database is unchanged.

## QA before production release
- Build Bobby Swipe: dual attack rolls, damage + crit, graze numeric and
  charge extra / crit. Verify consolidated chat output.
- Test formula attribute references on an owned character and as DM NPC.
- Verify normal rolls, sheet roll macros, spell casts and hotbar spells work.
- Hover/focus numbers in ordinary, spell and multi-roll chat cards.
- Drag macros onto occupied hotbar slots, reload and test keyboard binding.
- Verify only the macro owner can list, update, delete and execute that macro.
- Test invalid formulas, empty rows, 12-row cap and 18-roll cap.
- Test on 80% and 125% UI scale and a narrow viewport.
