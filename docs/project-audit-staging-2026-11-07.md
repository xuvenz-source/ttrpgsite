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
4. **Lease reconciliation:** continue renewing active leases every eight seconds against their 18-second expiry, but only do full inventory/claim backstop reads every 64 seconds on a healthy Realtime connection. Disconnected clients return to eight-second reads; reconnect re-synchronizes immediately.
5. **Tool metadata saves:** the existing ordered, revision-aware queued writer now handles torch/mount details with a 300 ms debounce, retains a dirty draft on failed writes and flushes before editor close. Unrelated tool/inventory refreshes do not overwrite an active local draft.
6. **Realtime refreshes:** tool issues and map projections, handout ticks, combat and authorized fog updates coalesce bursts of events instead of issuing one query per event. Combat does not re-query on unrelated fog/position ticks while no initiative encounter is active.
7. **Fog security:** a map visibility tick **still invalidates the previous frame immediately** before any delayed/combined authorized refresh. Do not render stale player sight to avoid visual blackouts.
8. **Static CI guard:** added a targeted ESLint `no-undef` gate for changed interactive components. Existing Node regression tests, Vite build, Deno checks, dependency audit and CodeQL remain part of the staging verification.
9. **Database history:** recorded the production-vs-Git comparison in `staging/db-migration-history-audit.json`. This is **documentation only**, not a SQL migration or an attempt to rewrite live migration history.

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
