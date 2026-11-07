# Consolidated next release — staging ledger and deployment plan

**No production deployment authorized.** All work stays on `stage/next-release-consolidated-2026-11-07` until the designer explicitly requests the next release.

## Standing release contract

The designer's default meaning of “push an update” is: **publish all previously staged, release-ready components together in one production deployment**, including their compatible backend dependencies. The release cannot silently omit another ready branch. Every time a change is staged, register it here and merge it into the current consolidated branch after conflict review. Before the next `main` merge, inventory all GitHub staging branches again; status may change after new work.

## What's included for the next update

- Ruler bends by right-click or R, with snapped cumulative distance.
- Smooth issued-tool/mount drag, mixed marquee selection and group movement with tokens.
- Tool pickup using Delete without deleting issuance.
- Direct character-sheet popouts; DM map layer Delete support.
- Expanded handout/map pin icons and corrected pin editor stacking.
- Breached-password screening on the existing registration Edge Function using k-anonymity.
- Fog/realtime compatibility: no public movement-coordinate preview while authoritative fog is on or its visibility state is unknown.

The pin-kind CHECK constraint expansion is a **staged SQL candidate only** (`staging/sql-candidates/campaign_pin_icon_expansion.sql`). It must be applied to the existing live Supabase project in the **approved future release before the matching frontend is deployed**. The `username-register` Supabase Edge Function must be deployed in that same approved release, not by staging CI. The old proposed NPC Storage policy is **superseded** by the newer production fog security policy; never apply it.

## Release procedure

1. Re-fetch `main` and **all staged branches**. Audit `staging/next-release-ledger.json` against live: add new staged items, mark genuinely released/superseded, and resolve all remaining pending work into this bundle. Never reintroduce older source code over production.
2. Rebase/merge the consolidated branch onto the current `main` without losing fog/collision, autosave, Realtime inventory, security and any intervening production fixes.
3. Run the combined npm test, build, dependency audit and CodeQL on the exact release commit. Test denied access and fog movement preview constraints.
4. Prepare/apply the **one** pending pin-kind SQL candidate and register its exact Supabase migration history. Deploy the updated registration Edge Function as a separately verified backend action.
5. Merge the entire release in **one** approved `main` PR; verify the resulting Vercel production deployment URL, status and exact commit SHA. Do not build preview deployments or use paid staging services.
6. On live test campaigns, check ruler turn changes, two-player mixed drag, fog/collision, tool pickup, pin kinds, popup behaviour, registration/password screens and player permissions. Report all manual gaps honestly. Update the ledger to reflect the completed release and initialize the next bundle for later work.

**Conflict policy:** if any formerly staged component is incompatible or fails CI/security verification, repair it before deployment. If it cannot be made safe, explicitly identify and obtain a scope decision; do not drop it without telling the designer.

The branch classification in `staging/next-release-ledger.json` refers to **feature outcomes**, not to literal ancestry: squash merges can leave old Git branches permanently divergent. An old branch can be “released” even when Git compares it as ahead due to independent squash commits. Verify features against live code and production migrations, not commit ancestry alone.
