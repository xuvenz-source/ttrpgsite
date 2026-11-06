# Next batch — staged, unpublished

**Base production:** `6f543c52bc7cb533da228e0c3754cab46dac496d`.
Everything in this batch remains an unreferenced chain of Git commit objects. No branch ref
was changed, no Vercel deployment was triggered, and no pending migration was applied.

## Seven user-visible changes

1. Keep the existing website account sign-up and sign-in system; remove the Characters tab.
2. Units shows an **account-name folder** for each relevant member, containing their character
   sheets, then their linked map tokens. A player's own folder provides **+ New character sheet**.
   Sheet buttons open the player's own sheet, or DM's editor for another player's sheet.
3. Linked **Attack** macro cells: to-hit formula, normal/advantage/disadvantage, natural critical
   threshold 1–20, base damage, and extra damage on critical. For advantage/disadvantage the
   server rolls the to-hit formula twice and **selects the higher/lower natural d20**, not the
   modified total. Damage is rolled **once**, crit extra is rolled **only if the selected natural
   attack qualifies**, with a total shown if a bonus was added. Legacy Dice / Number cells
   remain independent, preserving previously saved macros.
4. DM-only hidden ability modifier rules on a Number field. Base and step default to D&D 10/2;
   e.g. a Dexterity score 8→−1, 9→−1, 12→+1, 13→+1. The field gets a modifier reference name,
   e.g. `@{dexterity_mod}`, without adding a new visible player sheet field. Server macro
   resolution derives the value from stored raw scores even if the sheet was not resaved.
5. Portable template import/export using local JSON files (max 2 MB); importing updates only
   the DM designer until they click **Save template** to use it in the campaign. The files
   are saved on the DM's device, not as a new Supabase template library.
6. Chat follows incoming messages and rolls at the bottom, pauses while the user is manually
   reading earlier messages, and resumes when they scroll back near the bottom.

7. Token resource **bars and globes** now render on a map overlay layer above every token,
   instead of being trapped inside each token's stacking context. The layer is click-through.
   Each widget in the DM Token Display Designer has **Placement: Outside token** (the default,
   preserving existing layouts) or **Inside token boundaries**. Top/bottom/corner positions
   work with either placement. Overlays follow map panning, zoom, dragging, footprint resizing,
   and live monitor data. No additional database migration is needed.

## SQL migrations required before releasing the corresponding frontend

1. `supabase/migrations/20261106190000_campaign_account_names.sql`
2. `supabase/migrations/20261106190100_dm_ability_modifiers.sql`
3. `supabase/migrations/20261106190200_linked_attack_macros.sql`

All three were syntax-checked and functionally smoke-tested inside a `BEGIN ... ROLLBACK`
transaction on the current Supabase project; this did not persist the changes.

## Required pre-release tests

- Build Vite and run `node --test tests/*.test.mjs` without triggering unintended deployments.
- Two signed-in accounts: account folders display usernames, remain campaign-scoped, and
  never expose email or metadata. Open and create multiple sheets; DM access remains limited.
- Attack with natural rolls 18, 19, and 20 under crit-on-20 and crit-on-19, including
  disadvantage where 20 is discarded in favour of 18 (no critical) and advantage where 20
  is kept (critical). Check damage rolled once, conditional extra dice, correct total and tooltip.
- Legacy saved macros with only Dice / Number and Text cells still save and execute.
- Modifier references after DM changes base/step, including negative scores and older sheets.
- Import/export round-trip, malformed/oversized JSON, and unsaved-import behaviour.
- Chat automatic following, manual scroll-up pause, and follow resumption after scrolling down.
- With two overlapping tokens, verify a health bar or globe for the covered token remains
  visible on top of both portraits, including after selecting and dragging either token.
  Ensure the monitor layer does not block token dragging, controls or map panning.
- Set bar and globe widgets independently to inside and outside; check preview and map agree
  for top, bottom and corner locations at several zoom levels and token footprint sizes.
  Multiple inside monitors may compete for limited space on a very small token.
- Check branch and Vercel build quotas before deployment. Verify Supabase migration history,
  Vercel commit SHA, production domain, and authenticated UI after any authorized release.

**Not yet done:** frontend compile, browser tests with real accounts, or a live deployment.
