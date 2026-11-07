# Project-wide optimization and functionality audit — staged fixes

**Date:** 2026-11-07  
**Production base:** `1468101ed258c033126e930503e59330470f85f5`  
**Dedicated staging branch:** `stage/project-audit-correctness-optimization-2026-11-07` (draft PR #37)  
**Release state:** staging only. No Vercel deployment, no Supabase migration and no Edge Function deployment.

## Implemented in this branch

1. **DM character editor pop-outs:** removed references to undefined `changed` and `setError`; flush all pending sheet writes before opening the browser popup. Saves cannot be bypassed with an immediate close.
2. **Inventory item acknowledgement:** item editors now wait for `onSave` to settle; collaborative grid/list changes return Promise acknowledgements from the per-item Supabase RPCs. An error keeps the editor open and shows a retry message. Parent inventory panels also surface rejected asynchronous writes.
3. **Movement packet checks:** extracted identical token/tool UUID, sequence, map and coordinate validation into `LiveMovementPreview.js`. Permission rules remain separate and server-authoritative.
4. **Shared inventory collaboration core:** `InventoryCollaborationCore.js` centralizes item ID validation, optimistic row merging, object-level diffs and active lease lookup. Existing sheet/tool RPC authorization and DM lease takeover behavior remain unchanged.
5. **Lease reconciliation:** continue renewing active leases every eight seconds against their 18-second expiry, but only do full inventory/claim backstop reads every 64 seconds on a healthy Realtime connection. Disconnected clients return to eight-second reads; reconnect re-synchronizes immediately.
6. **Tool metadata saves:** the existing ordered, revision-aware queued writer now handles torch/mount details with a 300 ms debounce, retains a dirty draft on failed writes and flushes before editor close. Unrelated tool/inventory refreshes do not overwrite an active local draft.
7. **Realtime refreshes:** tool issues and map projections, handout ticks, combat and authorized fog updates coalesce bursts of events instead of issuing one query per event. Combat does not re-query on unrelated fog/position ticks while no initiative encounter is active.
8. **Fog security:** a map visibility tick **still invalidates the previous frame immediately** before any delayed/combined authorized refresh. Do not render stale player sight to avoid visual blackouts.
9. **Static CI guard:** added a targeted ESLint `no-undef` gate for changed interactive components. Existing Node regression tests, Vite build, Deno checks, dependency audit and CodeQL remain part of the staging verification.
10. **Database history:** recorded the production-vs-Git comparison in `staging/db-migration-history-audit.json`. This is **documentation only**, not a SQL migration or an attempt to rewrite live migration history.

## Database history discrepancy — no SQL applied

- Production Supabase history contains **51 applied entries**.
- GitHub currently tracks **29 SQL migration files**, of which **8 filenames match a production version exactly**.
- **43** applied migration version IDs have no exact Git filename; **21** tracked files have no matching applied version.
- **9** production migration names have same-named Git files with different versions, demonstrating that these counts include numbering/history drift, not 43 necessarily missing schema changes.
- Some old filename prefixes are dates, not 14-digit migration stamps. Do **not** run `supabase db push` or automatically apply repository history against the production test database. Investigate each applied version, its source SQL and effective schema before producing a vetted baseline.

## Safe deployment and manual QA gates

- Run `npm run lint:critical`, `npm test`, `npm audit --omit=dev --audit-level=high`, `npm run build`, Deno typechecks and CodeQL on the final aggregate branch.
- **DM sheet:** Edit, immediately click pop-out, verify saved data in the new window; simulate a failed RPC and confirm the original editor remains open.
- **Shared inventory:** Two player accounts edit separate items simultaneously. Verify item leases, greyed-out tiles, DM takeover, same-item contention, slow/erroring RPC acknowledgement and close/reopen persistence. Include both grid and list variants, NPCs and tools.
- **Tool details:** Change mount stats or torch light repeatedly while another client moves the tool. Verify the final setting survives, with accurate save/error states and no stale overwrites after close.
- **Realtime:** Profile network request counts/minute and UI responsiveness under 10, 50, 100 tokens, handout updates, map switches and online/offline transitions. Measure combat and fog tick bursts and compare before/after. Confirm hidden NPCs and private images never become visible via stale previews.
- **Database:** Keep existing live test campaigns as the only database acceptance environment; no paid development projects or hourly-billed resources.

## Items intentionally not refactored blindly

- The large `src/main.jsx` still deserves staged module extraction, but moving the entire Board/controller without browser profiling risks pointer capture, fog permissions and mixed token/tool selection. Split along tested feature boundaries incrementally in a later batch.
- **Conservative CSS cleanup completed:** removed older identical Units subtab declarations and the earlier redundant map panning cursor rule after checking scope and later overrides. Remaining repeated selectors include responsive and cascade rules; do not mass-delete them without browser layout checks.
- `get_authorized_map_fog` currently updates exploration records when called. Before changing backend computation, profile workloads and verify visibility/RLS semantics. Client-side request coalescing reduces redundant calls without a migration.
- Source and CI verification are not full browser/multiplayer acceptance; there is no claim that all interactions have been manually tested.

## Next-release contract

Keep PR #37 **draft**. Before the next requested live update, include this branch plus every other outstanding ready branch in a fresh consolidated release commit, resolve all code/permission/migration conflicts and use **one** production Vercel deployment. Do not silently omit prior staged functionality.

## Second-stage architecture and fog optimization

These additional improvements are **staged for the next release**, not deployed.

### Main controller refactor
- `src/main.jsx` is now a **14-line entrypoint** importing the UI/CSS in the prior order.
- `src/TabletopApp.jsx` owns application session, campaign state and composition. The live battlemap and DM sheet designer have been isolated into `BattlemapBoard.jsx` and `SheetTemplateDesigner.jsx` (with independent components, React hooks and no import cycle).
- `src/AppBoundaries.jsx` centralizes error recovery; `TabletopSheetDefaults.js` shares stored-sheet ID/default format helpers.
- `src/useCampaignPresence.js` owns the pseudonymous Supabase channel and membership hashes, preserving roster updates and cleanup.
- Existing source-scanning regression tests were updated to inspect the new module locations; `eslint no-undef` checks all extracted controllers.
- **No database contract, REST/RPC signature, character sheet schema or battlemap pointer behavior was intentionally modified** during component extraction.

### CSS consolidation
- The formerly monolithic 151 KB stylesheet has been divided into **11 ordered feature CSS files** under `src/styles/`, imported through the existing `src/style.css` entrypoint.
- The generated combined CSS has the **same original text and cascade order** as the pre-split audit branch (after its prior conservative duplicate-rule cleanup). A regression checksum test prevents inadvertent cascade changes.
- All existing visual-structure tests now consume the ordered feature CSS source. The production `map-environment.css` and `combat.css` remain imported after the feature sheets, as before.
- Responsive overrides remain in their original relative order. A real browser viewport review is still necessary before calling visual parity fully verified.

### Server-authoritative fog: database migration candidate
- `supabase/migrations/20261107124000_fog_visibility_batch_optimization.sql` replaces **only** the body of `public.get_authorized_map_fog(uuid)`, maintaining `SECURITY DEFINER`, empty `search_path`, membership/map authorization, fog-on validation, maximum 128-cell map dimension, and existing DM/no-fog early returns.
- **Before:** for every candidate fog cell, `point_visible` re-queried map data, live scene and authorized viewer sources.
- **After:** one materialized collection of at most eight authorized viewer tokens supplies the same centers, radius-12 range, character/NPC attributes, `ray_blocked` wall/door test and `is_lit` illumination test across candidate cells.
- Exploration state now performs the same numeric JSONB union **only when** the new visible cells are not already contained in the stored explored array, reducing repeated writes and WAL traffic during movement in previously visited territory.
- No client RLS bypass, visible NPC disclosure, private geometry exposure, new external service, scheduled job, or paid infrastructure is included.
- **Rollback candidate:** `staging/sql-candidates/rollback_fog_visibility_batch_optimization.sql`, from the current deployed function. This must also never apply automatically.

### Approval and QA requirements for backend change

1. Do **not** run `supabase db push` against production: existing historical version drift is documented and bulk replay risks real test campaign data. At the explicitly approved release, apply the single vetted fog migration only.
2. Before enabling the new function, capture comparable per-player visibility snapshots for a DM, a player owner, a second party member and an unrelated player, including hidden maps and inaccessible NPCs.
3. Compare **all visible grid cells**, not merely token visibility, under: open/closed/secret doors, light-source on/off, darkness, walls/windows, multiple tokens, partyShared on/off, elevation, unexplored/previously explored cells, NPCs and map transitions.
4. Run a two-player multiplayer test with token and tool movement, fog revision ticks and simultaneous combat. Confirm final positions are server-authoritative and no transient leaked cells or artwork.
5. Compare fog RPC duration and `forge_visibility.exploration` update rate before and after on the same test map size and token count (10, 50, 100). No improvement percentages are claimed before measurement.
6. If any discrepancy exists, restore the reviewed rollback function or disable the new candidate before further release. Preserve the prior security model in every scenario.

### Current release scope
This is a **code-first release**, but it still must include **every previously staged, release-ready component**. Validate the aggregate as one release and deploy with a single Vercel production update when explicitly requested.
