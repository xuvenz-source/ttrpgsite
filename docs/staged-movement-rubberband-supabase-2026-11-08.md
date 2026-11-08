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

## Second stage — server-side single-write trajectory candidate now staged

The **currently deployed** `public.commit_map_trajectory` calls `public.move_map_group` **once per waypoint**, writing intermediate map token/tool locations and triggering Realtime repeatedly. This can let older intermediate updates conflict with newer visual previews.

The new **unapplied, self-contained SQL candidate** `staging/sql-candidates/world_runtime_single_write_trajectory.sql` replaces that behavior. It:
- Retains the same `public.commit_map_trajectory(p_map, p_token_ids, p_tool_issue_ids, p_steps, p_ignore_collision)` signature, so the current UI RPC call remains compatible.
- Makes one call to the **existing, SECURITY INVOKER** `public.move_map_group` with the accumulated final delta, preserving authenticated campaign/map access, per-piece RLS, DM-only override, a maximum of 48 mixed pieces, locks in a stable order, and all-or-nothing writes.
- Uses transaction-local, map/actor-scoped route metadata to route the existing token and tool collision triggers through a new **private** `forge_visibility.validate_piece_trajectory`. Both triggers still run as before and enforce all intermediate swept-footprint wall/door/window collision checks, conditional attribute passage, map bounds and final route endpoint matching. Direct movement without the route metadata keeps the original straight-line collision behavior.
- Revokes `PUBLIC`, `anon`, and `authenticated` execution on the internal validator; only the existing privileged collision-trigger path can call it. It grants no new table, fog, tool or authorization permissions.
- Reduces persisted movement to **one final UPDATE per token/tool**, not one per waypoint. An atomic mixed-group request still updates multiple rows, so group movement can still produce more than one *final* fog tick; do not promise zero server load.
- Does not change any fog, lighting, spectator, vision, Realtime broadcast or collision bypass policy. The earlier queued trusted preview RPC fix remains part of this PR.

**Status:** staged source and static regression checks only. It has not been parsed/executed against a PostgreSQL server, and has not been applied as a Supabase migration. Before an approved release, convert the SQL candidate to a versioned migration (remove its enclosing `begin;commit;` because the migration runner provides the transaction), review the final DB privileges and existing trigger definitions, apply to the existing live Supabase instance, verify installed functions and scoped grants, and then merge the combined frontend. If the SQL fails on application, **stop before the production merge**.

**Remaining database release gates:**

- Compare candidate functions against deployed versions of both collision triggers and `move_map_group`; inspect RLS and `SECURITY INVOKER` privileges and ensure the new private validator cannot be called by `anon` or `authenticated`.
- Keep direct single-token movement collision-checked and DM override explicit; do not replace the validator with unguarded trigger suppression.
- A movement transaction should either commit every requested token/tool at the validated final coordinates or roll back completely on a single wall or authorization failure. No mid-path positions should be persisted.
- Applying this SQL requires explicit designer approval for the next coordinated release. Only existing test campaigns may be used for post-release browser tests. No new paid Supabase branch or services.

## Verification and acceptance before production

- GitHub Actions: `npm test`, production dependency audit, Vite production build, strict Deno checks, CodeQL on final consolidated SHA.
- New focused tests cover remote sprite+monitor handoff, latest-only queue under delayed replies, cancellation/drain and no-tool drag path.
- Human two-browser DM/player checks on fog-on and fog-off maps: drag 1–6 cells rapidly with turns, stop/restart drag, remote follow latency, position after release, wall/door collision and no unauthorized NPC reveal, 2+ token groups, mounts and held lights.
- To prove a sub-100 ms target or identify the remaining database delay, instrument local-paint, RPC submit/ack, private-broadcast receive, authorized snapshot commit and paint events in a dedicated browser test; compare median/p95 and correlate with backend `preview_map_motion`, `commit_map_trajectory` and `get_authorized_map_fog` request durations. Do not claim a measured improvement from unit tests or screenshots alone.

**Release status:** client and server single-write trajectory SQL candidate staged together in draft PR #49; SQL still unapplied and requires compile, role/trigger verification and live post-release testing. No Vercel preview, main merge or production deployment from this branch.
