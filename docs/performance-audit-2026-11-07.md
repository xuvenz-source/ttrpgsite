# TTRPG Site — performance and redundancy audit

**Review date:** 7 November 2026  
**Source:** `stage/dm-map-environment-tools` (`768fd860`); production baseline `main` (`e0c0215e`)  
**Implementation:** `stage/performance-audit-2026-11-07` (draft PR #7)

## Safety boundaries

All changes are staged separately from production. No schema migration, RLS policy, player visibility rule, networking protocol, persistent character-sheet format or game rule has been changed. Database writes remain authoritative. Private-map Realtime checks and server permissions remain in place.

This is a source-level review with automated Node tests, a Vite production build and a Deno type-check. **It is not yet a browser profiling session or multiplayer acceptance test.** Faster FPS and latency cannot be quantified until those tests are performed.

## Improvements staged

### 1. Rendering hot paths
- `Board` memoizes visible tokens, token display settings and combined measurements.
- Token status hover titles are computed once per token render instead of twice.
- `TokenMonitorFrames.jsx` moves monitors into separately memoized per-token frames, preserving the shared top stacking layer so overlapping tokens cannot obscure resource monitors.
- `TokenMonitors` accepts already-normalized config and memoizes its own output.
- `Artwork` is memoized, sharing an external signed URL manager.
- `MapEnvironmentOverlay` is memoized, using stable editor callbacks; snapped wall-line hover coordinates only update when they change.

### 2. Realtime events and duplicate requests
- `PerformanceScheduling.js` coalesces bursts of token or campaign changes into a single refresh after ~100ms.
- Map-specific token events skip unrelated map updates, while incomplete/DELETE payloads fail open to **refreshing** to avoid stale views.
- Chat reconciliation uses a 30-second backstop when Realtime is healthy, returning to 4 seconds when disconnected.
- Roster reconciliation uses a 60-second healthy backstop, returning to 8 seconds when disconnected.
- Reconnect and tab focus still immediately reconcile; event-driven refresh remains live.
- Realtime token event subscriptions no longer reconnect just because the selected map changed.

### 3. Targeted campaign and stale-response handling
- Campaign Postgres notifications refresh campaign metadata and monitor values rather than reloading roughly eleven independent campaign resources.
- Campaign list, initial campaign load, map library and NPC library responses are guarded against superseded requests, account switches and campaign switches.
- Full initial loads and explicit full reload actions remain unchanged where expected.

### 4. Signed image and map URL management
- `SignedAssetUrls.js` shares in-flight signing requests and caches URLs until their refresh threshold.
- A single refresh timer covers subscribed image assets rather than one interval per mounted token.
- The cache evicts inactive assets, retains active subscriptions during authorization changes, and invalidates old signed URLs on sign-in/sign-out.
- Map images now use the same renewal logic as character/NPC artwork, including long-open map views.

### 5. DM environment saves
- `QueuedWrites.js` batches quick numeric and selector edits into the latest snapshot after ~280ms.
- All submitted snapshots are serialized in order to prevent an older write from winning a race.
- New walls and lights are queued immediately. Pending settings edits are flushed when switching maps, hiding the tab or navigating away.
- A stale write cannot report `Saved` for a newer unsaved revision. Write errors still appear in the UI.
- A browser can terminate in-flight requests on an abrupt tab close; use the visible `Saved` indicator before closing during large edits.

### 6. Automated verification
- `npm test` runs all Node test files; Vite production build and Supabase Deno check remain in the workflow.
- New executable tests cover map event filtering, burst coalescing, adaptive polling, URL cache expiration/auth invalidation, save debouncing and write ordering.
- Existing structural regression tests were adapted for the extracted monitor layer and adaptive reconnect path.
- CI is configured for `main`, stage and feature branches, and PRs targeting main/stage; superseded in-progress runs can be cancelled. This workflow change only affects main after the branch is merged.

### 7. Maintenance and CSS boundaries
- A dedicated `map-environment.css` now owns the DM map layer styling, imported **after** global CSS to maintain cascade ordering.
- The monitor presentation, network scheduling, asset signing cache and queued saving each live in focused modules.
- Avoid mass-removing global CSS declarations until browser coverage confirms they are unused.

## Manual verification gate before release

1. DM: connected-line wall and freehand pen input, right-click finish, doors, lights, layer visibility and selection.
2. Players: never see private DM geometry or hidden tokens; token reference fields and monitors remain correct.
3. Map: move, resize and group-drag tokens with multiple connected clients; verify remote previews and eventual authoritative coordinates.
4. Realtime: send chat and rolls; drop/reconnect network; check recovery with tab hidden and resumed.
5. Images: switch maps/accounts and keep a map open across signed-URL renewal; verify the correct images appear.
6. Saves: edit environment settings rapidly, immediately switch maps, reload and confirm the final values persisted.
7. Inspect React Profiler and network waterfall with 10, 50 and 100 tokens; record FPS, commit durations, Supabase calls/minute and reconnect latency.

**Release status:** staging only, draft PR; no production deployment or merge. Pass automated validation **and** complete the manual browser/multiplayer checks before publishing.
