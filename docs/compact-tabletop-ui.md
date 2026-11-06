# Staged batch: compact sheets, positional effects, DM Bestiary, and condensed rolls

Branch: `feature/compact-tabletop-ui`. This work is **not deployed to production**.

## Character and NPC sheets
- Compressed title, portrait/name row, tabs, inputs, and save footer.
- Repeating spell collection category tabs and add button share a compact toolbar.
- Spell-level selector moves into each spell's title row.
- Collapsed spell entries show only a compact one-line title; click to expand controls.
- Nested fields and description panels use tighter spacing.
- Full-height field scrolling replaces the old fixed `52vh` limit.

## Status badge positioning
- DM → Token settings & resources → Token Display Designer → Status-effect badge position.
- Supports left/right side, above/below, and all four corner positions.
- Default: outside the left edge of the token, away from the existing top-right AC bubble.
- The preview shows example conditions at the chosen position.
- Setting is saved in the existing `campaigns.token_display_config` JSON.
- No database migration; previous campaign configs resolve to the left default.

## Bestiary in DM tools
- Removed the separate Bestiary sidebar tab.
- Bestiary has its own collapsed subsection inside the DM tab, including search,
  folder management, create/edit/place and drag-to-map.
- Retained monochrome bear symbol next to the new subsection label.
- Removed duplicate sidebar headings (Chat, Units, Settings, DM, and nested Bestiary/Token Designer).

## Condensed chat rolls
- Each roll has a one-line label and result plus an unobtrusive formula.
- Dice details are available in a small expandable row.
- Reduced message padding, removed the redundant Campaign chat & rolls title.
- Existing chat messages and dice results remain unchanged in the database.

## Acceptance checks
1. DM and player sheets: all three tabs, repeatable spell editing, save and reopen.
2. A spellbook with five+ entries: tab filters, collapse/expand, level changes, roll buttons.
3. DM editor footer always visible; only field body scrolls inside a resized window.
4. Badge placement options: verify HP/AC bubbles can stay unobstructed, at 70–150% map zoom.
5. Reload DM campaign; custom badge position persists for all clients.
6. Bestiary is only visible inside DM, and NPC drag/drop, folder search and edit still work.
7. Chat roll detail expand/collapse; raw text/chat and macros unaffected.
8. Check 80–125% user UI scaling and narrow/mobile sidebar.
