# Next batch — Sheet quickcodes, inventory and encumbrance, Discord provider UX

Status: **staged only**, not merged, deployed or migrated. These Git commit objects
are kept off deployable branches to avoid consuming the user's Vercel build quota.
Base production commit: `713fa4dd440612265d37eb49b5b1dbdc5222e13c`.

## User-visible features

1. **Field quickcodes.** Each Sheet Designer field now has an optional `=@CODE`
   input. Saving the sheet writes the compatible token reference configuration
   atomically. Legacy campaign quickcodes are populated onto their matching fields
   when the designer opens. The old Token Display Designer quickcode submenu is
   removed. Changes to token bar settings do not remove codes. Numeric codes can
   still appear as token bubble values; scalar text/booleans and bounded JSON
   summaries can be posted to chat. Complex fields are not numeric token bubbles.
2. **Two inventory presets.** Classic list and spatial drag-and-drop grid share
   the original saved item arrays; changing presets does not discard items.
   Grid dimensions are DM configured. Cards can carry quantities, per-unit weights,
   notes, and widths/heights. Extra items remain in an overflow list if the grid is
   full rather than being deleted.
3. **DM item distribution.** A DM sidebar panel chooses a character, inventory
   field and item. A security-definer server RPC checks authentication, campaign
   DM role, target character, authorized inventory field, item quantity/weight,
   and max row count, then adds the item in one locked transaction. Players cannot
   call this to grant themselves items.
4. **Carry weight and encumbrance rules.** The DM defines capacity from an ability
   score times a multiplier plus bonus, or from a fixed capacity. Tier thresholds
   can be ability score multiples, % of maximum or fixed weight. Each tier has a
   label, icon, and option to display on a token. D&D defaults are ×5 light, ×10
   heavy, ×15 maximum. Rules are opt-in. Character inventories show combined
   weight and current tier; other players see only a DM-approved icon and label
   on visible tokens, not the underlying inventory.
5. **Discord/Google sign-in availability.** OAuth buttons check Supabase's public
   `/auth/v1/settings` response and are disabled if the provider is unavailable.
   Error text now explains the username/password fallback. Enabling Discord in
   Supabase still requires an external Discord Developer application and OAuth
   credentials; see `docs/discord-auth-setup.md`. No client secrets are committed.

## Database migrations — NOT applied

Apply **in order** before the frontend can be released:

1. `supabase/migrations/20261106200000_dm_distribute_inventory_items.sql`
2. `supabase/migrations/20261106200100_token_encumbrance_badges.sql`
3. `supabase/migrations/20261106200200_sheet_quickcode_values.sql`

All three passed a combined `BEGIN; ... ROLLBACK;` preflight on Supabase.
This verified DM-only item function EXECUTE rights, disabled-tier opt-in,
sample encumbrance thresholds, numeric/boolean/text/array quickcode values.
**No live Supabase data or migration history changed.**

## Required release checks

- Run `node --test tests/*.test.mjs` and `npm run build` (no CI/Vercel builds
  have been triggered yet for this batch).
- Verify old quickcodes, token bubbles, chat, and equipment AC survive sheet saves
  and token display edits. Test duplicate/invalid quickcodes and template imports.
- DM and player accounts: cannot give items as a player; DM may give only within
  their campaign; concurrent player updates must not silently discard gifts.
- Open an existing inventory, switch list⇆grid, edit items and sizes, fill the grid
  and verify overflow persists and no items are lost.
- Confirm per-item quantity×weight and total across several inventory fields;
  test threshold mode changes and disabled flags, negative or empty scores,
  live updates and multi-token map visibility / private map restrictions.
- Verify account creation via username/password. After administrators enable
  Discord credentials in Supabase, confirm the Discord button becomes enabled,
  OAuth returns to the website and a new player can join a campaign.
- Have a DM and two players separately verify token icons reveal only approved
  tier labels, without exposing character inventory records to other players.
- Before release, verify migration execution order, Vite build, browser smoke tests,
  Vercel production SHA, and domain aliases.

**Limitation:** Static code inspections and SQL transaction preflight are not
a substitute for production compilation or a two-account privacy test.
