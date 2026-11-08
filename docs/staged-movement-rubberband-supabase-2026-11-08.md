# Staged movement continuity and lower preview RPC pressure — 8 November 2026

**Scope:** first production-safe implementation stage only. **DO NOT DEPLOY OR APPLY SQL** without the designer's explicit production-release approval. Based on main `92f982ce23dcda706032c3abb235a84233324578`. No paid infrastructure or test database.

## Reported live symptoms

- Player-side sprite flashing after token movement is fixed by PR #48 and must remain fixed.
- DM and player still experience visual rubber-banding and objectionable remote motion latency.
- Supabase dashboard screenshots (reported 8 Nov, screenshots' chosen ranges vary) show 39 slow queries, 28/60 peak connections, 17% disk usage, 58% memory usage, 4% CPU, a **SEVERE** memory-commitment risk, 9.5% database errors, and 3.1% Realtime warnings. These are snapshot/dashboard indicators, *not* proven movement-RPC timings or memory exhaustion. A memory-commitment warning is not the same as OOM.
- Read-only Supabase inspection: project ACTIVE_HEALTHY, no health advisor notices, performance advisor reports missing covering indexes on 33 foreign keys (not all are necessarily involved in movement), and server metrics are not a controlled multiplayer performance trace. Do not add blanket indexes based solely on an advisor count.

## Code-level root causes and first staged fixes

1. **Premature remote overlay removal:** `TabletopApp` previously called `remoteMotion.clearPreview` immediately after scheduling a `map_tokens` position state update. React had not yet painted the new base left/top; the token and monitor could move back for a frame. Now matching authoritative events mark **remote handoff**, and `BattlemapBoard`'s existing `useLayoutEffect` retires the overlay after committed coordinates match. Out-of-sync intermediate trajectory events do not erase a newer private observer preview.
2. **Expiry painted stale coordinates before reconcile:** private observer motion timer now requests a fresh authorized token/tool projection **before** clearing the overlay. Sequence guards prevent an old completion from clearing a newer packet's motion.
3. **Unnecessary React state churn:** the hot token-pointer path updated `toolPreview` even for a movement containing no tools; it now skips this React update entirely. Sprite/monitor motion stays on the existing animation-frame presentation layer.
4. **Excess server preview backlog:** fast pointer samples used to create overlapping `preview_map_motion` database RPCs, which can be expensive (per-recipient lighting, LOS, collision). `ObserverPreviewQueue` permits at most **one in-flight RPC per token/tool**; it replaces any unsent coordinates with the latest sample and cancels/drains the queued/in-flight operation before `end_map_motion_previews` cleanup. Server-side RLS, collision and observer visibility authorization are unchanged. Existing 115 ms client throttle and 100 ms DB throttle are **not reduced**, so this stage attempts load relief without increasing their maximum request rate.

## Remaining structural limitation — NOT yet implemented

The deployed `public.commit_map_trajectory` calls `public.move_map_group` **once per waypoint**, writing each intermediate map token/tool location and firing movement triggers/Realtime more than once. This can let older authorized intermediate updates arrive after a newer presentation preview. The above client handoff prevents them from visually superseding an active newer preview, but a future complete fix should validate the entire route while persisting one final state per token/tool.

**Server redesign obligations before staging executable SQL:**

- Keep public RPC `SECURITY INVOKER` so actor/session RLS and token/tool ownership remain enforced; never trust client-provided viewer IDs, token coordinates, collision outcomes or sight cells.
- Validate **each path segment in order** from current server positions using the same wall/window/door passage, token footprint and mount/tool span rules, group-relative offsets, bounds, DM-only override and current published environment as the existing triggers.
- Preserve bends/reversals. Replacing a validated path with one blind start-to-end diagonal would invalidate intended hallway movements.
- Take consistent row locks for group members and validate all pieces before a **single atomic final UPDATE per piece**; no partial updates, no hidden sprite/LOS exposure, no additional unverified bypass flags.
- Carefully coordinate any necessary trigger/RPC changes in a **versioned, reviewed SQL candidate only**; do not apply a staged backend migration until the designer approves its release.
- For fog-enabled maps continue server-only private observer broadcasts, per-recipient LOS/lighting checks, immediate sight revocation on real visibility revisions and authorized fog refreshes. Do not add an unauthenticated or universally broadcast shortcut.
- Test out-of-order Realtime events, failed collision, denied player ownership, multi-token groups, DM bypass, door state changes, NPC hiding and torch light clipping using existing live test campaigns **after** authorized migration.

## Verification and acceptance before production

- GitHub Actions: `npm test`, production dependency audit, Vite production build, strict Deno checks, CodeQL on final consolidated SHA.
- New focused tests cover remote sprite+monitor handoff, latest-only queue under delayed replies, cancellation/drain and no-tool drag path.
- Human two-browser DM/player checks on fog-on and fog-off maps: drag 1–6 cells rapidly with turns, stop/restart drag, remote follow latency, position after release, wall/door collision and no unauthorized NPC reveal, 2+ token groups, mounts and held lights.
- To prove a sub-100 ms target or identify the remaining database delay, instrument local-paint, RPC submit/ack, private-broadcast receive, authorized snapshot commit and paint events in a dedicated browser test; compare median/p95 and correlate with backend `preview_map_motion`, `commit_map_trajectory` and `get_authorized_map_fog` request durations. Do not claim a measured improvement from unit tests or screenshots alone.

**Release status:** client fixes staged; server single-write trajectory redesign explicitly planned, not implemented. No SQL migrated, no Vercel preview or production build deployed from this branch.
